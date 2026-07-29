/**
 * Coding Agent SDK — 会话客户端
 * 负责 HTTP API 调用 + WebSocket 连接管理
 */

import type { CreateSessionResponse, ReadFileResponse, WSMessage } from './types';

const SESSION_KEY = '_coding_agent_sessionId';

export type SessionStatusListener = (status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'expired', msg?: string) => void;

export class SessionClient {
  private _runtimeUrl: string;
  private _workspace?: string;
  private _sessionId: string;
  private _active = false;
  private _staleSession = false; // 标记 session 已过期，不要自动重连
  private _ws: WebSocket | null = null;
  private _reconnectTimer: number | null = null;
  private _onData: ((data: string) => void) | null = null;
  private _onHistory: ((data: string) => void) | null = null;
  private _onStatus: SessionStatusListener | null = null;

  constructor(runtimeUrl: string, workspace?: string) {
    this._runtimeUrl = runtimeUrl.replace(/\/+$/, '');
    this._workspace = workspace;
    this._sessionId = this._loadSessionId();
  }

  get sessionId(): string { return this._sessionId; }
  get active(): boolean { return this._active; }

  // ─── 持久化 ───
  private _loadSessionId(): string {
    try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
  }
  private _persist(id: string): void {
    try { localStorage.setItem(SESSION_KEY, id); } catch { /* noop */ }
  }
  private _clearPersisted(): void {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
  }

  // ─── 回调注册 ───
  onTerminalData(fn: (data: string) => void): void { this._onData = fn; }
  onTerminalHistory(fn: (data: string) => void): void { this._onHistory = fn; }
  onSessionStatus(fn: SessionStatusListener): void { this._onStatus = fn; }

  // ─── Session HTTP API ───

  /** 创建 Session */
  async createSession(): Promise<string> {
    try {
      const body: Record<string, string> = {};
      if (this._workspace) body.workspace = this._workspace;
      const res = await fetch(`${this._runtimeUrl}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data: CreateSessionResponse = await res.json();
        this._sessionId = data.sessionId;
        this._persist(data.sessionId);
        this._onStatus?.('connected', `Session: ${data.sessionId.slice(0, 8)}`);
        return data.sessionId;
      }
    } catch (err: any) {
      this._onStatus?.('error', `Create session failed: ${err.message}`);
    }
    return '';
  }

  /** 确保 Session 存在（有缓存则复用，无则创建） */
  async ensureSession(): Promise<string> {
    if (this._sessionId && this._active) return this._sessionId;
    if (this._sessionId) {
      this._onStatus?.('connecting', `Reconnecting ${this._sessionId.slice(0, 8)}...`);
      return this._sessionId;
    }
    return this.createSession();
  }

  /** 读取文件 */
  async readFile(filePath: string): Promise<ReadFileResponse> {
    try {
      const sid = this._sessionId ? `?sessionId=${encodeURIComponent(this._sessionId)}` : '';
      const res = await fetch(`${this._runtimeUrl}/read-file${sid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      return res.json();
    } catch (err: any) {
      return { error: err.message };
    }
  }

  /** 获取工作区 */
  async getCwd(): Promise<string> {
    try {
      const sid = this._sessionId ? `?sessionId=${encodeURIComponent(this._sessionId)}` : '';
      const res = await fetch(`${this._runtimeUrl}/cwd${sid}`);
      const data = await res.json();
      return data.cwd || '';
    } catch {
      return '';
    }
  }

  // ─── WebSocket ───

  connect(): void {
    if (this._ws) return;
    if (!this._sessionId) return;

    const wsUrl = this._runtimeUrl.replace(/^http/, 'ws');
    const url = `${wsUrl}/__agent/ws?sessionId=${encodeURIComponent(this._sessionId)}`;
    this._ws = new WebSocket(url);

    this._ws.onopen = () => {
      this._active = true;
    };

    this._ws.onmessage = (e) => {
      try {
        const p: WSMessage = JSON.parse(e.data);
        switch (p.type) {
          case 'data':
            this._onData?.(p.data || '');
            break;
          case 'history':
            if (p.source === 'undo') {
              this._onData?.(p.data || '');
            } else {
              this._onHistory?.(p.data || '');
            }
            break;
          case 'session':
            if (p.event === 'attached') {
              this._onStatus?.('connected', p.workspace || '');
            } else if (p.event === 'destroyed') {
              this._active = false;
              this._clearPersisted();
              this._onStatus?.('disconnected', `Session destroyed: ${p.message}`);
            } else if (p.event === 'pty-exited') {
              this._active = false;
              this._onStatus?.('disconnected', `PTY exited (code: ${p.exitCode})`);
            }
            break;
          case 'error':
            this._onStatus?.('error', p.data || '');
            break;
        }
      } catch {
        this._onData?.(e.data);
      }
    };

    this._ws.onclose = (event) => {
      this._ws = null;
      this._active = false;

      // Server closed with code 4000 → Session not found
      if (event.code === 4000 && !this._staleSession) {
        this._staleSession = true;
        this._clearPersisted();
        this._sessionId = '';
        this._onStatus?.('error', 'Session expired, recreating...');
        this._recreateAndReconnect();
        return;
      }

      // 正在重建 session，忽略本次关闭
      if (this._staleSession) return;

      // 正常断连 → 2 秒后重连
      this._reconnectTimer = window.setTimeout(() => {
        if (this._sessionId) this.connect();
      }, 2000);
    };

    this._ws.onerror = () => this._ws?.close();
  }

  /** 发送数据到 PTY */
  send(data: string): void {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: 'input', data }));
    }
  }

  /** 发送终端尺寸 */
  resize(cols: number, rows: number): void {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  /** 请求历史回放 */
  requestHistory(): void {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: 'requestHistory' }));
    }
  }

  /** 断开 WebSocket（不销毁 PTY Session） */
  disconnect(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._active = false;
  }

  /** Session 过期时自动重建并重连 */
  private async _recreateAndReconnect(): Promise<void> {
    const newId = await this.createSession();
    if (!newId) {
      this._onStatus?.('error', 'Failed to recreate session');
      this._staleSession = false;
      return;
    }
    this._staleSession = false;
    this.connect();
  }
}
