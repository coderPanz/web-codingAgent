/**
 * Coding Agent SDK — 终端视图
 * xterm.js 封装，管理终端实例生命周期
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { SessionClient } from './session-client';

// Catppuccin Mocha 主题
const CATPPUCCIN_MOCHA = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  selectionBackground: '#585b70',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8',
};

export class TerminalView {
  private _terminal: Terminal | null = null;
  private _fitAddon: FitAddon | null = null;
  private _container: HTMLElement | null = null;
  private _client: SessionClient;
  private _awaitingInput = false;
  private _inputBuffer = '';
  private _pickedContext = '';
  private _onSend: ((text: string) => void) | null = null;
  private _onAwaitingChange: ((awaiting: boolean) => void) | null = null;

  constructor(client: SessionClient) {
    this._client = client;
  }

  get terminal(): Terminal | null { return this._terminal; }
  get cols(): number { return this._terminal?.cols || 80; }
  get rows(): number { return this._terminal?.rows || 24; }
  get awaitingInput(): boolean { return this._awaitingInput; }

  // 发送回调（用户按下 Enter 发送上下文 + 输入到 PTY 时调用）
  onSend(fn: (text: string) => void): void { this._onSend = fn; }

  // 上下文输入模式变化回调
  onAwaitingChange(fn: (awaiting: boolean) => void): void { this._onAwaitingChange = fn; }

  /** 挂载到容器 */
  mount(container: HTMLElement, onReady?: () => void): void {
    if (this._terminal) return;
    this._container = container;

    this._terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      theme: CATPPUCCIN_MOCHA,
    });

    this._fitAddon = new FitAddon();
    this._terminal.loadAddon(this._fitAddon);
    this._terminal.open(container);

    setTimeout(() => this._fitAddon?.fit(), 50);

    this._terminal.onData((data) => {
      if (this._awaitingInput) {
        this._handleInput(data);
        return;
      }
      this._client.send(data);
    });

    // 注册 WS 数据回调
    this._client.onTerminalData((data) => {
      this._terminal?.write(data);
    });

    this._client.onTerminalHistory((data) => {
      this._terminal?.write('\x1b[33m── Session history recovered ──\n\x1b[0m');
      this._terminal?.write(data);
      this._terminal?.write('\x1b[33m── Live output ──\n\x1b[0m');
    });

    this._client.onSessionStatus((status, msg) => {
      switch (status) {
        case 'connected':
          this._terminal?.writeln(`\x1b[32m✓ Attached to session\x1b[0m`);
          this._terminal?.writeln(`\x1b[90m   ${msg || ''}\x1b[0m`);
          this._terminal?.write('');
          this._terminal?.focus();
          this.fit();
          break;
        case 'connecting':
          this._terminal?.writeln(`\x1b[90m${msg}\x1b[0m`);
          break;
        case 'disconnected':
          this._terminal?.writeln(`\r\n\x1b[33m✗ ${msg || 'Disconnected — session remains active'}\x1b[0m`);
          break;
        case 'error':
          this._terminal?.writeln(`\x1b[31mError: ${msg}\x1b[0m`);
          break;
      }
    });

    onReady?.();
  }

  /** 校准尺寸 */
  fit(): void {
    if (!this._fitAddon) return;
    this._fitAddon.fit();
    if (this._terminal) {
      this._client.resize(this._terminal.cols, this._terminal.rows);
    }
  }

  /** 滚动到底部 */
  scrollToBottom(): void {
    this._terminal?.scrollToBottom();
  }

  /** 写入文本 */
  write(text: string): void {
    this._terminal?.write(text);
  }

  /** 写入一行 */
  writeln(text: string): void {
    this._terminal?.writeln(text);
  }

  /** 清空视口 */
  clear(): void {
    this._terminal?.clear();
  }

  /** 聚焦 */
  focus(): void {
    this._terminal?.focus();
  }

  // ─── 上下文输入模式 ───

  /** 进入上下文输入模式 */
  enterAwaitingMode(pickedContext: string): void {
    this._awaitingInput = true;
    this._pickedContext = pickedContext;
    this._inputBuffer = '';
    this._onAwaitingChange?.(true);
  }

  /** 退出上下文输入模式 */
  exitAwaitingMode(): void {
    this._awaitingInput = false;
    this._inputBuffer = '';
    this._pickedContext = '';
    this._onAwaitingChange?.(false);
  }

  /** 撤销上下文输入（清空终端，回放 PTY 历史） */
  undoContext(): void {
    this._awaitingInput = false;
    this._inputBuffer = '';
    this._pickedContext = '';
    this._onAwaitingChange?.(false);
    this._terminal?.clear();
    this._client.requestHistory();
    this._terminal?.focus();
  }

  // ─── 内部：输入处理 ───

  private _handleInput(data: string): void {
    if (data === '\r' || data === '\n') {
      const userInput = this._inputBuffer.trim();
      this._inputBuffer = '';
      this._awaitingInput = false;
      this._onAwaitingChange?.(false);

      if (!userInput) {
        this._terminal?.writeln('');
        this._terminal?.writeln('\x1b[33m⏹ Empty input, cancelled\x1b[0m');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this._terminal?.scrollToBottom();
          });
        });
        return;
      }

      const combined = `${this._pickedContext}\n\n${userInput}`;
      this._pickedContext = '';
      this._client.send(combined + '\r');
      // 等 input bar 隐藏 → fit → 再滚到底部（双 rAF 确保 fit 已执行）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this._terminal?.scrollToBottom();
        });
      });
    } else if (data === '\x7f' || data === '\b') {
      if (this._inputBuffer.length > 0) {
        this._inputBuffer = this._inputBuffer.slice(0, -1);
        this._terminal?.write('\r\x1b[K');
        this._terminal?.write(`\x1b[36m❯ \x1b[0m${this._inputBuffer}`);
      }
    } else if (data === '\x03') {
      this._awaitingInput = false;
      this._inputBuffer = '';
      this._pickedContext = '';
      this._onAwaitingChange?.(false);
      this._terminal?.writeln('^C');
      this._terminal?.writeln('\x1b[33m⏹ Cancelled\x1b[0m');
    } else {
      this._inputBuffer += data;
      this._terminal?.write(data);
    }
  }

  /** 销毁 */
  dispose(): void {
    this._terminal?.dispose();
    this._terminal = null;
    this._fitAddon = null;
    this._container = null;
  }
}
