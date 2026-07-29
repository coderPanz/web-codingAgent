/**
 * Coding Agent SDK — 样式系统 (Catppuccin Mocha)
 * 所有 UI 样式在此定义，通过 <style> 标签注入页面
 */

// ============================================================
// 注意：xterm.js 的样式需要单独处理。
// 因为 Vite lib mode 对 ?inline CSS import 的支持有限，
// 这里内联了 xterm.js 的最小必需样式 + 所有 SDK UI 样式。
// ============================================================

const STYLES = /* css */ `
/* ── xterm.js core (minimal) ── */
.xterm {
  cursor: text;
  position: relative;
  user-select: none;
  -ms-user-select: none;
  -webkit-user-select: none;
  font-feature-settings: "liga" 0;
}
.xterm.focus,
.xterm:focus { outline: none; }
.xterm .xterm-helpers {
  position: absolute;
  top: 0;
  z-index: 5;
}
.xterm .xterm-helper-textarea {
  padding: 0;
  border: 0;
  margin: 0;
  position: absolute;
  opacity: 0;
  left: -9999em;
  top: 0;
  width: 0;
  height: 0;
  z-index: -5;
  white-space: nowrap;
  overflow: hidden;
  resize: none;
}
.xterm .composition-view {
  background: #000;
  color: #fff;
  display: none;
  position: absolute;
  white-space: nowrap;
  z-index: 1;
}
.xterm .composition-view.active { display: block; }
.xterm .xterm-viewport {
  background-color: #1e1e2e;
  overflow-y: scroll;
  cursor: default;
  position: absolute;
  right: 0;
  left: 0;
  top: 0;
  bottom: 0;
  scrollbar-width: thin;
  scrollbar-color: #45475a #1e1e2e;
}
.xterm .xterm-screen { position: relative; }
.xterm .xterm-screen canvas { position: absolute; left: 0; top: 0; }
.xterm .xterm-scroll-area { visibility: hidden; }
.xterm-char-measure-element {
  display: inline-block;
  visibility: hidden;
  position: absolute;
  top: 0;
  left: -9999em;
  line-height: normal;
}
.xterm.enable-mouse-events { cursor: default; }
.xterm.xterm-cursor-pointer,
.xterm .xterm-cursor-pointer { cursor: pointer; }
.xterm.column-select.focus .xterm-cursor-layer { cursor: crosshair; }

/* ── 浮动触发按钮 ── */
.casdk-trigger {
  position: fixed;
  z-index: 2147483646;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #1a1a2e;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s, box-shadow 0.2s;
  user-select: none;
  border: none;
  outline: none;
  padding: 0;
}
.casdk-trigger:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
}
.casdk-trigger svg { width: 22px; height: 22px; }

/* ── 面板 ── */
.casdk-panel {
  position: fixed;
  z-index: 2147483645;
  background: #1e1e2e;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 400px;
  min-height: 240px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.casdk-panel.is-dragging { user-select: none; }
.casdk-panel.is-resizing { user-select: none; }

/* ── 标题栏 ── */
.casdk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #181825;
  border-bottom: 1px solid #313244;
  user-select: none;
  flex-shrink: 0;
  cursor: grab;
}
.casdk-header:active { cursor: grabbing; }
.casdk-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.casdk-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #a6e3a1;
  flex-shrink: 0;
}
.casdk-title {
  color: #cdd6f4;
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
}
.casdk-cwd {
  color: #6c7086;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
  max-width: 280px;
}
.casdk-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.casdk-size-badge {
  color: #585b70;
  font-size: 10px;
  font-family: 'SF Mono', Consolas, monospace;
  padding: 2px 6px;
  background: #252538;
  border-radius: 4px;
}
.casdk-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #6c7086;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: background 0.15s, color 0.15s;
  outline: none;
  padding: 0;
}
.casdk-btn:hover { background: #313244; color: #cdd6f4; }

/* ── 拾取按钮 ── */
.casdk-picker-btn.active {
  background: #89b4fa !important;
  color: #1e1e2e !important;
  animation: casdk-pickerPulse 1.2s ease-in-out infinite;
}
@keyframes casdk-pickerPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(137, 180, 250, 0.5); }
  50% { box-shadow: 0 0 0 6px rgba(137, 180, 250, 0); }
}

body.casdk-picking,
body.casdk-picking * { cursor: crosshair !important; }

/* ── 拾取浮层 ── */
.casdk-overlay {
  position: absolute;
  z-index: 2147483647;
  pointer-events: none;
  background: rgba(137, 180, 250, 0.12);
  border: 2px solid #89b4fa;
  border-radius: 4px;
  display: none;
}
.casdk-overlay.active { display: block; }
.casdk-label {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  background: #1e1e2e;
  border: 1px solid #89b4fa;
  border-radius: 4px;
  font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
  font-size: 11px;
  white-space: nowrap;
  color: #cdd6f4;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.casdk-label-path { color: #89b4fa; }
.casdk-label-pos { color: #6c7086; }

/* ── 终端容器 ── */
.casdk-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  padding: 6px;
  box-sizing: border-box;
}
.casdk-terminal {
  width: 100%;
  height: 100%;
}
.casdk-terminal .xterm { height: 100%; }

/* ── 输入栏 ── */
.casdk-input-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  background: #181825;
  border-top: 1px solid #313244;
}
.casdk-input-hint {
  color: #585b70;
  font-size: 11px;
  flex-shrink: 0;
}
.casdk-input-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.casdk-clear-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #45475a;
  border-radius: 6px;
  background: #1e1e2e;
  color: #a6adc8;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: background 0.15s, border-color 0.15s;
  outline: none;
}
.casdk-clear-btn:hover { background: #313244; border-color: #585b70; color: #cdd6f4; }
.casdk-send-btn {
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 6px;
  background: #89b4fa;
  color: #1e1e2e;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: background 0.15s;
  outline: none;
}
.casdk-send-btn:hover { background: #74c7ec; }
.casdk-send-btn:active { background: #89dceb; }

/* ── 缩放把手 ── */
.casdk-resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 20px;
  height: 20px;
  cursor: nwse-resize;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 3px;
  z-index: 1;
  opacity: 0.4;
  transition: opacity 0.2s;
}
.casdk-resize-handle:hover { opacity: 1; }
`;

let styleEl: HTMLStyleElement | null = null;

/** 注入样式到页面 */
export function injectStyles(): void {
  if (styleEl) return;
  styleEl = document.createElement('style');
  styleEl.id = 'coding-agent-sdk-styles';
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);
}

/** 移除样式 */
export function removeStyles(): void {
  styleEl?.remove();
  styleEl = null;
}
