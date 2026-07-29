/**
 * Coding Agent SDK — 浮动触发按钮
 * 固定在页面右下角，点击显示/隐藏面板
 */

export class FloatingTrigger {
  private _button: HTMLButtonElement | null = null;
  private _onClick: (() => void) | null = null;

  constructor() {}

  onClick(fn: () => void): void { this._onClick = fn; }

  /** 注入到页面 */
  inject(right = 24, bottom = 24): void {
    if (this._button) return;

    this._button = document.createElement('button');
    this._button.className = 'casdk-trigger';
    this._button.title = 'Coding Agent';
    this._button.style.right = `${right}px`;
    this._button.style.bottom = `${bottom}px`;
    this._button.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>
    `;

    this._button.addEventListener('click', () => {
      this._onClick?.();
    });

    document.body.appendChild(this._button);
  }

  /** 从页面移除 */
  remove(): void {
    this._button?.remove();
    this._button = null;
  }
}
