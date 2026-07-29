/**
 * Coding Agent SDK — 主调度器
 * 协调 SessionClient、TerminalView、PickerEngine、PanelUI、FloatingTrigger
 */

import type { SDKOptions } from './types';
import { injectStyles, removeStyles } from './styles';
import { SessionClient } from './session-client';
import { TerminalView } from './terminal-view';
import { PickerEngine } from './picker-engine';
import { PanelUI } from './panel-ui';
import { FloatingTrigger } from './floating-trigger';

export class AgentSDK {
  private _options: SDKOptions;
  private _client: SessionClient;
  private _termView: TerminalView;
  private _picker: PickerEngine;
  private _panel: PanelUI;
  private _trigger: FloatingTrigger;
  private _initialized = false;

  constructor(options: SDKOptions) {
    this._options = options;

    // 依赖链：SessionClient → TerminalView → PickerEngine → PanelUI
    this._client = new SessionClient(options.runtimeUrl, options.workspace);

    this._termView = new TerminalView(this._client);

    this._picker = new PickerEngine(this._client, this._termView);

    this._panel = new PanelUI(this._termView, this._picker);
    this._panel.onToggle(() => this.toggle());

    // 拾取器状态变化 → 同步按钮样式
    this._picker.onActiveChange((active) => {
      this._panel.setPickerActive(active);
      if (active) {
        this._panel.hideInputBar();
      }
    });

    // 上下文输入模式变化 → 显示/隐藏输入栏
    this._termView.onAwaitingChange((awaiting) => {
      if (awaiting) {
        this._panel.showInputBar();
      } else {
        this._panel.hideInputBar();
      }
    });

    this._trigger = new FloatingTrigger();
  }

  /** 初始化：注入样式 + 悬浮按钮 */
  async init(): Promise<{ destroy: () => void }> {
    if (this._initialized) return { destroy: () => this.destroy() };
    this._initialized = true;

    // 1. 注入 CSS
    injectStyles();

    // 2. 注入浮动按钮
    const pos = this._options.triggerPosition || {};
    this._trigger.inject(pos.right ?? 24, pos.bottom ?? 24);

    // 3. 按钮点击 → 切换面板
    this._trigger.onClick(() => this.toggle());

    return { destroy: () => this.destroy() };
  }

  /** 切换面板显示/隐藏 */
  private async toggle(): Promise<void> {
    if (this._panel.visible) {
      this._panel.hide();
      this._client.disconnect();
      this._termView.dispose();
      this._picker.deactivate();
    } else {
      this._panel.show();

      // 确保 Session
      await this._client.ensureSession();
      if (!this._client.sessionId) {
        const id = await this._client.createSession();
        if (!id) {
          this._termView.writeln('\x1b[31mFailed to create session\x1b[0m');
          return;
        }
      }

      // 连接 WebSocket
      this._client.connect();

      // 获取 cwd
      const cwd = this._options.workspace || (await this._client.getCwd());
      this._panel.setCwd(cwd);
    }
  }

  /** 销毁 SDK */
  destroy(): void {
    this._initialized = false;
    this._picker.dispose();
    this._panel.dispose();
    this._termView.dispose();
    this._client.disconnect();
    this._trigger.remove();
    removeStyles();
  }
}
