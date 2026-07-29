/**
 * Session 管理器
 *
 * 职责：
 * - 创建/销毁 Session
 * - Attach/Detach WebSocket 客户端
 * - 管理 PTY 生命周期（与 WebSocket 解耦）
 * - 自动回收空闲 Session
 */

import { v4 as uuidv4 } from 'uuid';
import { HistoryBuffer } from './history-buffer.js';
import { spawn } from 'node-pty';

const RECYCLE_TIMEOUT = 30 * 60 * 1000; // 30 分钟
const RECYCLE_INTERVAL = 60 * 1000;      // 每分钟检查一次

export class SessionManager {
  constructor() {
    /** @type {Map<string, Session>} */
    this.sessions = new Map();
    this._recycleInterval = null;
  }

  /**
   * 创建新 Session（不自动 spawn PTY）
   * @param {string} workspace 项目目录路径
   * @returns {{ sessionId: string, workspace: string }}
   */
  create(workspace) {
    const sessionId = uuidv4();
    const session = {
      sessionId,
      workspace,
      createdAt: Date.now(),
      lastActive: Date.now(),
      status: 'idle', // idle | running | recycling
      pty: null,      // node-pty 实例
      history: new HistoryBuffer(3000),
      clients: new Set(), // 已连接的 WS 客户端
    };
    this.sessions.set(sessionId, session);
    console.log(`[Session] ${sessionId.slice(0, 8)} created → ${workspace}`);
    return { sessionId, workspace };
  }

  /**
   * 销毁 Session（kill PTY + 清理）
   * @param {string} sessionId
   * @returns {boolean}
   */
  destroy(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // 断开所有客户端
    for (const ws of session.clients) {
      try {
        ws.send(JSON.stringify({ type: 'session', event: 'destroyed', message: 'Session terminated' }));
        ws.close(4001, 'Session destroyed');
      } catch { /* ignore */ }
    }
    session.clients.clear();

    // kill PTY
    if (session.pty) {
      try { session.pty.kill(); } catch { /* ignore */ }
      session.pty = null;
    }

    this.sessions.delete(sessionId);
    console.log(`[Session] ${sessionId.slice(0, 8)} destroyed`);
    return true;
  }

  /**
   * 获取 Session
   * @param {string} sessionId
   * @returns {Session|null}
   */
  get(sessionId) {
    const s = this.sessions.get(sessionId);
    if (s) s.lastActive = Date.now();
    return s || null;
  }

  /**
   * Attach WebSocket 客户端到 Session
   *
   * 如果 PTY 不存在（首次连接），自动 spawn。
   * 如果 PTY 存在，回放 History 然后切换实时输出。
   *
   * @param {string} sessionId
   * @param {WebSocket} ws
   * @returns {{ success: boolean, reason?: string }}
   */
  attach(sessionId, ws) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, reason: 'Session not found' };
    }

    session.clients.add(ws);
    session.lastActive = Date.now();

    // 如果 PTY 不存在，spawn
    if (!session.pty) {
      this._spawnPty(session);
    }

    // 回放历史
    const history = session.history.drain();
    if (history.length > 0) {
      ws.send(JSON.stringify({ type: 'history', data: history }));
    }

    // 如果 PTY 正在运行，通知客户端
    if (session.pty) {
      ws.send(JSON.stringify({
        type: 'session',
        event: 'attached',
        sessionId,
        workspace: session.workspace,
        ptyAlive: true,
      }));
    }

    console.log(`[Session] ${sessionId.slice(0, 8)} client attached (${session.clients.size} total)`);
    return { success: true };
  }

  /**
   * Detach WebSocket 客户端（不移除 PTY）
   * @param {string} sessionId
   * @param {WebSocket} ws
   */
  detach(sessionId, ws) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.clients.delete(ws);
    session.lastActive = Date.now();
    console.log(`[Session] ${sessionId.slice(0, 8)} client detached (${session.clients.size} remaining)`);

    // 无客户端连接时，开始倒计时回收
    if (session.clients.size === 0) {
      console.log(`[Session] ${sessionId.slice(0, 8)} no clients, will recycle after ${RECYCLE_TIMEOUT / 60000}min`);
    }
  }

  /**
   * 发送输入到 Session 的 PTY
   * @param {string} sessionId
   * @param {string} data
   */
  write(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.pty) return false;
    session.pty.write(data);
    session.lastActive = Date.now();
    return true;
  }

  /**
   * 调整 PTY 尺寸
   * @param {string} sessionId
   * @param {number} cols
   * @param {number} rows
   */
  resize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.pty) return false;
    session.pty.resize(cols, rows);
    return true;
  }

  /**
   * 启动自动回收定时器
   */
  startRecycle() {
    if (this._recycleInterval) return;
    this._recycleInterval = setInterval(() => this._recycleCheck(), RECYCLE_INTERVAL);
    console.log(`[Recycle] Started (timeout: ${RECYCLE_TIMEOUT / 60000}min, check: every ${RECYCLE_INTERVAL / 1000}s)`);
  }

  /**
   * 停止自动回收
   */
  stopRecycle() {
    if (this._recycleInterval) {
      clearInterval(this._recycleInterval);
      this._recycleInterval = null;
    }
  }

  // ── 私有方法 ──

  /**
   * 回收检查：销毁超过 30 分钟无客户端且无活动的 Session
   */
  _recycleCheck() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.clients.size === 0 && (now - session.lastActive) > RECYCLE_TIMEOUT) {
        console.log(`[Recycle] Destroying idle session ${id.slice(0, 8)}`);
        this.destroy(id);
      }
    }
  }

  /**
   * Spawn PTY 并监听输出
   * @param {Session} session
   */
  _spawnPty(session) {
    const shellBin = process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh';
    let shell;
    try {
      shell = spawn(shellBin, [], {
        name: 'xterm-color',
        cwd: session.workspace,
        env: { ...process.env, TERM: 'xterm-256color' },
      });
    } catch (err) {
      this._broadcast(session, {
        type: 'error',
        data: `Failed to spawn PTY: ${err.message}`,
      });
      return;
    }

    session.pty = shell;
    session.status = 'running';
    console.log(`[PTY] ${session.sessionId.slice(0, 8)} spawned (pid: ${shell.pid})`);

    // PTY 输出 → 写入 History + 广播给所有客户端
    shell.onData((data) => {
      session.history.append(data);
      session.lastActive = Date.now();
      this._broadcast(session, { type: 'data', data });
    });

    // PTY 退出
    shell.onExit(({ exitCode }) => {
      console.log(`[PTY] ${session.sessionId.slice(0, 8)} exited (code: ${exitCode})`);
      session.pty = null;
      session.status = 'idle';
      this._broadcast(session, {
        type: 'session',
        event: 'pty-exited',
        exitCode,
      });
    });
  }

  /**
   * 广播消息给 Session 的所有客户端
   * @param {Session} session
   * @param {object} message
   */
  _broadcast(session, message) {
    const data = JSON.stringify(message);
    for (const ws of session.clients) {
      try {
        if (ws.readyState === ws.OPEN) {
          ws.send(data);
        }
      } catch { /* ignore */ }
    }
  }
}
