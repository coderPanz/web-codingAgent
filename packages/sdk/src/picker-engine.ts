/**
 * Coding Agent SDK — 元素拾取引擎
 * 负责覆盖层渲染、鼠标跟随、data-insp-path 解析、文件上下文读取
 */

import type { InspPathResult } from './types';
import type { SessionClient } from './session-client';
import type { TerminalView } from './terminal-view';

/** 解析 data-insp-path 属性 */
export function parseInspPath(raw: string): InspPathResult {
  const parts = raw.split(':');
  if (parts.length < 4) return { filePath: raw, row: 0, col: 0, nodeType: '' };
  const nodeType = parts.pop() || '';
  const col = parseInt(parts.pop() || '0', 10);
  const row = parseInt(parts.pop() || '0', 10);
  const filePath = parts.join(':');
  return { filePath, row, col, nodeType };
}

export class PickerEngine {
  private _active = false;
  private _overlay: HTMLDivElement | null = null;
  private _client: SessionClient;
  private _term: TerminalView;
  private _onActiveChange: ((active: boolean) => void) | null = null;

  // 绑定的事件处理函数（用于 removeEventListener）
  private _boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private _boundClick: ((e: MouseEvent) => void) | null = null;

  constructor(client: SessionClient, term: TerminalView) {
    this._client = client;
    this._term = term;
  }

  get active(): boolean { return this._active; }

  onActiveChange(fn: (active: boolean) => void): void { this._onActiveChange = fn; }

  /** 激活拾取模式 */
  activate(): void {
    if (this._active) return;
    this._active = true;

    // 创建覆盖层
    this._overlay = document.createElement('div');
    this._overlay.className = 'casdk-overlay active';
    this._overlay.innerHTML = `
      <div class="casdk-label">
        <span class="casdk-label-path"></span>
        <span class="casdk-label-pos"></span>
      </div>
    `;
    document.body.appendChild(this._overlay);
    document.body.classList.add('casdk-picking');

    // 延迟绑定事件，防止激活点击触发拾取
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundClick = this._onClick.bind(this);
    setTimeout(() => {
      document.addEventListener('mousemove', this._boundMouseMove!);
      document.addEventListener('click', this._boundClick!, true);
    }, 100);

    this._term.writeln('\x1b[33m🔍 Pick mode active — click any element on the page\x1b[0m');
    this._term.writeln('\x1b[90m   Press Esc to cancel\x1b[0m');

    this._onActiveChange?.(true);
  }

  /** 停用拾取模式 */
  deactivate(): void {
    if (!this._active) return;
    this._active = false;

    this._overlay?.remove();
    this._overlay = null;
    document.body.classList.remove('casdk-picking');

    if (this._boundMouseMove) {
      document.removeEventListener('mousemove', this._boundMouseMove);
      this._boundMouseMove = null;
    }
    if (this._boundClick) {
      document.removeEventListener('click', this._boundClick!, true);
      this._boundClick = null;
    }

    this._term.focus();
    this._onActiveChange?.(false);
  }

  toggle(): void {
    this._active ? this.deactivate() : this.activate();
  }

  dispose(): void {
    this.deactivate();
  }

  // ─── 内部事件 ───

  private _onMouseMove(e: MouseEvent): void {
    if (!this._overlay) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!el || el.closest('.casdk-panel, .casdk-trigger, .casdk-overlay')) {
      this._overlay.classList.remove('active');
      return;
    }
    const rect = el.getBoundingClientRect();
    this._overlay.classList.add('active');
    this._overlay.style.left = `${rect.left + window.scrollX}px`;
    this._overlay.style.top = `${rect.top + window.scrollY}px`;
    this._overlay.style.width = `${rect.width}px`;
    this._overlay.style.height = `${rect.height}px`;

    const rawPath = el.getAttribute('data-insp-path') || '';
    const { filePath, row } = parseInspPath(rawPath);
    const pathEl = this._overlay.querySelector('.casdk-label-path') as HTMLElement;
    const posEl = this._overlay.querySelector('.casdk-label-pos') as HTMLElement;

    if (rawPath) {
      pathEl.textContent = filePath;
      posEl.textContent = row ? `:${row}` : '';
    } else {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = Array.from(el.classList).slice(0, 2).map(c => `.${c}`).join('');
      pathEl.textContent = `${tag}${id}${cls}`;
      posEl.textContent = '(no source map)';
    }
  }

  private _onClick(e: MouseEvent): void {
    if (!this._overlay || !this._active) return;
    const target = e.target as HTMLElement;
    if (target?.closest('.casdk-panel, .casdk-trigger, .casdk-overlay')) return;
    e.preventDefault();
    e.stopPropagation();

    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!el || el.closest('.casdk-panel, .casdk-trigger, .casdk-overlay')) return;

    const rawPath = el.getAttribute('data-insp-path') || '';
    const { filePath, row } = parseInspPath(rawPath);
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().slice(0, 40);
    const classes = Array.from(el.classList).join('.');

    this.deactivate();

    // 先进入上下文模式让 UI 渲染 input bar，再校准终端尺寸
    this._term.enterAwaitingMode('');
    // 等待 input bar DOM 渲染完成
    requestAnimationFrame(() => {
      this._term.fit();
      this._term.scrollToBottom();

      this._term.writeln('');
      this._term.writeln(`\x1b[36m📍 Picked element: \x1b[93m<${tag}${classes ? `.${classes}` : ''}>${text ? `${text.slice(0, 30)}` : ''}</${tag}>\x1b[0m`);
      if (rawPath) {
        this._term.writeln(`\x1b[36m📁 File: \x1b[94m${filePath}\x1b[0m\x1b[36m:\x1b[94m${row || '?'}\x1b[0m`);
        this._fetchContext(filePath, row || 0);
      } else {
        this._term.writeln('\x1b[33m⚠️  No source mapping found\x1b[0m');
      }
    });
  }

  // ─── 异步读取文件上下文 ───

  private async _fetchContext(filePath: string, row: number): Promise<void> {
    try {
      const { content, error } = await this._client.readFile(filePath);
      if (error) { this._term.writeln(`\x1b[31m❌ ${error}\x1b[0m`); return; }
      if (!content) { this._term.writeln('\x1b[33m⚠️ File empty\x1b[0m'); return; }

      const lines = content.split('\n');
      const start = Math.max(0, row - 8);
      const end = Math.min(lines.length, row + 8);
      this._term.writeln(`\x1b[36m──── Code context (${start + 1}-${end}) ────\x1b[0m`);
      for (let i = start; i < end; i++) {
        const lineNum = String(i + 1).padStart(4, ' ');
        const marker = i === row - 1 ? '\x1b[42;97m ▶ \x1b[0m' : '   ';
        this._term.writeln(`${marker} \x1b[90m${lineNum}\x1b[0m \x1b[97m${lines[i]}\x1b[0m`);
      }
      this._term.writeln(`\x1b[36m──────────────────────────────\x1b[0m`);

      const contextCode = lines.slice(start, end).join('\n');
      this._term.enterAwaitingMode(`文件: ${filePath}:${row}\n\`\`\`\n${contextCode}\n\`\`\``);

      this._term.writeln('');
      this._term.writeln(`\x1b[33m✏️  Type your modification request and press Enter:\x1b[0m`);
      this._term.write(`\x1b[36m❯ \x1b[0m`);
      requestAnimationFrame(() => this._term.scrollToBottom());
    } catch (err: any) {
      this._term.writeln(`\x1b[31m❌ ${err.message}\x1b[0m`);
    }
  }
}
