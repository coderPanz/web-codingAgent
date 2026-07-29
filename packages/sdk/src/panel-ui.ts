/**
 * Coding Agent SDK — 面板 UI
 * 负责面板 DOM 构建、拖拽/缩放、输入栏、按钮事件
 */

import type { TerminalView } from './terminal-view';
import type { PickerEngine } from './picker-engine';

export class PanelUI {
  private _panel: HTMLDivElement | null = null;
  private _visible = false;
  private _termView: TerminalView;
  private _picker: PickerEngine;

  // 面板几何
  private _posX: number;
  private _posY: number;
  private _width: number;
  private _height: number;

  // DOM 引用
  private _bodyRef: HTMLDivElement | null = null;
  private _terminalRef: HTMLDivElement | null = null;
  private _inputBarRef: HTMLDivElement | null = null;
  private _sizeBadgeRef: HTMLSpanElement | null = null;

  // 拖拽状态
  private _dragging = false;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _dragInitX = 0;
  private _dragInitY = 0;

  // 缩放状态
  private _resizing = false;
  private _resizeStartX = 0;
  private _resizeStartY = 0;
  private _resizeInitW = 0;
  private _resizeInitH = 0;
  private _resizeInitX = 0;
  private _resizeInitY = 0;

  // 全局事件绑定
  private _boundDragMove: ((e: MouseEvent) => void) | null = null;
  private _boundDragUp: ((e: MouseEvent) => void) | null = null;
  private _boundResizeMove: ((e: MouseEvent) => void) | null = null;
  private _boundResizeUp: ((e: MouseEvent) => void) | null = null;
  private _boundKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private _resizeObserver: ResizeObserver | null = null;

  // 回调
  private _onToggle: (() => void) | null = null;

  constructor(termView: TerminalView, picker: PickerEngine) {
    this._termView = termView;
    this._picker = picker;

    // 默认位置：右下角
    this._posX = window.innerWidth - 720 - 80;
    this._posY = window.innerHeight - 480 - 24;
    this._width = 720;
    this._height = 480;
  }

  get visible(): boolean { return this._visible; }
  get panel(): HTMLDivElement | null { return this._panel; }

  onToggle(fn: () => void): void { this._onToggle = fn; }

  // ─── 显示/隐藏 ───

  show(): void {
    if (this._visible) return;
    this._visible = true;

    if (!this._panel) {
      this._panel = this._buildPanel();
      document.body.appendChild(this._panel);
    }
    this._panel.style.display = '';
    this._updatePosition();

    // 启动 ResizeObserver
    this._resizeObserver = new ResizeObserver(() => this._termView.fit());
    if (this._panel) this._resizeObserver.observe(this._panel);

    // 挂载终端
    if (this._terminalRef) {
      this._termView.mount(this._terminalRef);
    }

    // 键盘事件
    this._boundKeyDown = this._onKeyDown.bind(this);
    document.addEventListener('keydown', this._boundKeyDown);
  }

  hide(): void {
    if (!this._visible) return;
    this._visible = false;

    this._resizeObserver?.disconnect();
    this._resizeObserver = null;

    if (this._boundKeyDown) {
      document.removeEventListener('keydown', this._boundKeyDown);
      this._boundKeyDown = null;
    }

    // 隐藏面板（保留 DOM 复用）
    if (this._panel) this._panel.style.display = 'none';
  }

  /** 显示/更新输入栏 */
  showInputBar(): void {
    if (this._inputBarRef) this._inputBarRef.style.display = '';
    // 触发 resize observer → fit terminal
  }

  /** 隐藏输入栏 */
  hideInputBar(): void {
    if (this._inputBarRef) this._inputBarRef.style.display = 'none';
  }

  /** 更新 cwd 显示 */
  setCwd(cwd: string): void {
    const el = this._panel?.querySelector('.casdk-cwd');
    if (el) el.textContent = cwd;
  }

  /** 同步拾取按钮激活状态 */
  setPickerActive(active: boolean): void {
    const btn = this._panel?.querySelector('.casdk-picker-btn');
    if (btn) btn.classList.toggle('active', active);
  }

  /** 更新尺寸标记 */
  private _updateSizeBadge(): void {
    if (this._sizeBadgeRef) {
      this._sizeBadgeRef.textContent = `${this._width}×${this._height}`;
    }
  }

  /** 更新面板位置 */
  private _updatePosition(): void {
    if (!this._panel) return;
    this._panel.style.right = `${this._posX}px`;
    this._panel.style.bottom = `${this._posY}px`;
    this._panel.style.width = `${this._width}px`;
    this._panel.style.height = `${this._height}px`;
  }

  // ─── 构建 DOM ───

  private _buildPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'casdk-panel';
    panel.style.display = 'none'; // 初始隐藏，show() 时显示

    // Header
    const header = document.createElement('div');
    header.className = 'casdk-header';
    header.addEventListener('mousedown', this._onHeaderMouseDown.bind(this));
    header.innerHTML = `
      <div class="casdk-header-left">
        <span class="casdk-dot"></span>
        <span class="casdk-title">Coding Agent</span>
        <span class="casdk-cwd"></span>
      </div>
      <div class="casdk-header-right">
        <button class="casdk-btn casdk-picker-btn" title="选择页面元素 (Esc)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
            <path d="M13 13l6 6"/>
          </svg>
        </button>
        <span class="casdk-size-badge">${this._width}×${this._height}</span>
        <button class="casdk-btn" title="关闭">✕</button>
      </div>
    `;

    // Picker button
    const pickerBtn = header.querySelector('.casdk-picker-btn') as HTMLButtonElement;
    pickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._picker.toggle();
    });

    // Close button (last btn in header)
    const buttons = header.querySelectorAll('.casdk-btn');
    const closeBtn = buttons[buttons.length - 1] as HTMLButtonElement;
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._onToggle?.();
    });

    this._sizeBadgeRef = header.querySelector('.casdk-size-badge') as HTMLSpanElement;

    // Body
    this._bodyRef = document.createElement('div');
    this._bodyRef.className = 'casdk-body';

    this._terminalRef = document.createElement('div');
    this._terminalRef.className = 'casdk-terminal';
    this._bodyRef.appendChild(this._terminalRef);

    // Input bar (初始隐藏)
    this._inputBarRef = document.createElement('div');
    this._inputBarRef.className = 'casdk-input-bar';
    this._inputBarRef.style.display = 'none';
    this._inputBarRef.innerHTML = `
      <span class="casdk-input-hint">Enter 发送</span>
      <div class="casdk-input-actions">
        <button class="casdk-clear-btn" title="撤销上下文（回到拾取前状态）">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
          清空
        </button>
        <button class="casdk-send-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
          Send
        </button>
      </div>
    `;

    // Clear button
    const clearBtn = this._inputBarRef.querySelector('.casdk-clear-btn') as HTMLButtonElement;
    clearBtn.addEventListener('click', () => this._termView.undoContext());

    // Send button
    const sendBtn = this._inputBarRef.querySelector('.casdk-send-btn') as HTMLButtonElement;
    sendBtn.addEventListener('click', () => {
      // 模拟回车
      this._termView.terminal?.input('\r');
    });

    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'casdk-resize-handle';
    resizeHandle.title = '拖拽缩放';
    resizeHandle.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M12 0v12H0l12-12z" fill="#585b70"/></svg>`;
    resizeHandle.addEventListener('mousedown', this._onResizeMouseDown.bind(this));

    // 组装
    panel.appendChild(header);
    panel.appendChild(this._bodyRef);
    panel.appendChild(this._inputBarRef);
    panel.appendChild(resizeHandle);

    return panel;
  }

  // ─── 拖拽 ───

  private _onHeaderMouseDown(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('.casdk-btn, .casdk-picker-btn')) return;
    this._dragging = true;
    this._panel?.classList.add('is-dragging');
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    this._dragInitX = this._posX;
    this._dragInitY = this._posY;

    this._boundDragMove = this._onDragMove.bind(this);
    this._boundDragUp = this._onDragUp.bind(this);
    document.addEventListener('mousemove', this._boundDragMove);
    document.addEventListener('mouseup', this._boundDragUp);
    e.preventDefault();
  }

  private _onDragMove(e: MouseEvent): void {
    if (!this._dragging) return;
    this._posX = this._dragInitX + (this._dragStartX - e.clientX);
    this._posY = this._dragInitY + (this._dragStartY - e.clientY);
    this._updatePosition();
  }

  private _onDragUp(): void {
    this._dragging = false;
    this._panel?.classList.remove('is-dragging');
    if (this._boundDragMove) {
      document.removeEventListener('mousemove', this._boundDragMove);
      this._boundDragMove = null;
    }
    if (this._boundDragUp) {
      document.removeEventListener('mouseup', this._boundDragUp);
      this._boundDragUp = null;
    }
  }

  // ─── 缩放 ───

  private _onResizeMouseDown(e: MouseEvent): void {
    this._resizing = true;
    this._panel?.classList.add('is-resizing');
    this._resizeStartX = e.clientX;
    this._resizeStartY = e.clientY;
    this._resizeInitW = this._width;
    this._resizeInitH = this._height;
    this._resizeInitX = this._posX;
    this._resizeInitY = this._posY;

    this._boundResizeMove = this._onResizeMove.bind(this);
    this._boundResizeUp = this._onResizeUp.bind(this);
    document.addEventListener('mousemove', this._boundResizeMove);
    document.addEventListener('mouseup', this._boundResizeUp);
    e.preventDefault();
    e.stopPropagation();
  }

  private _onResizeMove(e: MouseEvent): void {
    if (!this._resizing) return;
    const dX = e.clientX - this._resizeStartX;
    const dY = e.clientY - this._resizeStartY;
    this._width = Math.max(400, this._resizeInitW + dX);
    this._height = Math.max(240, this._resizeInitH + dY);
    this._posX = this._resizeInitX - (this._width - this._resizeInitW);
    this._posY = this._resizeInitY - (this._height - this._resizeInitH);
    this._updatePosition();
    this._updateSizeBadge();
  }

  private _onResizeUp(): void {
    this._resizing = false;
    this._panel?.classList.remove('is-resizing');
    if (this._boundResizeMove) {
      document.removeEventListener('mousemove', this._boundResizeMove);
      this._boundResizeMove = null;
    }
    if (this._boundResizeUp) {
      document.removeEventListener('mouseup', this._boundResizeUp);
      this._boundResizeUp = null;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this._termView.fit());
    });
  }

  // ─── 键盘 ───

  private _onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this._picker.active) {
        this._picker.deactivate();
        this._termView.writeln('\x1b[33m⏹ Pick cancelled\x1b[0m');
      } else if (this._termView.awaitingInput) {
        this._termView.exitAwaitingMode();
        this._termView.writeln('');
        this._termView.writeln('\x1b[33m⏹ Cancelled\x1b[0m');
      }
    }
  }

  // ─── 清理 ───

  dispose(): void {
    this.hide();
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (this._boundKeyDown) {
      document.removeEventListener('keydown', this._boundKeyDown);
      this._boundKeyDown = null;
    }
    this._cleanupDragListeners();
    this._cleanupResizeListeners();
    this._panel?.remove();
    this._panel = null;
    this._bodyRef = null;
    this._terminalRef = null;
    this._inputBarRef = null;
    this._sizeBadgeRef = null;
  }

  private _cleanupDragListeners(): void {
    if (this._boundDragMove) {
      document.removeEventListener('mousemove', this._boundDragMove);
      this._boundDragMove = null;
    }
    if (this._boundDragUp) {
      document.removeEventListener('mouseup', this._boundDragUp);
      this._boundDragUp = null;
    }
  }

  private _cleanupResizeListeners(): void {
    if (this._boundResizeMove) {
      document.removeEventListener('mousemove', this._boundResizeMove);
      this._boundResizeMove = null;
    }
    if (this._boundResizeUp) {
      document.removeEventListener('mouseup', this._boundResizeUp);
      this._boundResizeUp = null;
    }
  }
}
