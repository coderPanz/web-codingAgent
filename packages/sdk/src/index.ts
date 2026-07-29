/**
 * Coding Agent SDK
 *
 * 浏览器 AI 开发助手 — 零侵入、框架无关、可注入
 *
 * @example
 * ```html
 * <script src="coding-agent-sdk.js"></script>
 * <script>
 *   CodingAgentSDK.init({
 *     runtimeUrl: 'http://localhost:3002',
 *   });
 * </script>
 * ```
 */

import type { SDKOptions } from './types';
import { AgentSDK } from './agent-sdk';

let _instance: AgentSDK | null = null;

/**
 * 初始化 Coding Agent SDK
 * 注入浮动按钮、终端面板、建立 WebSocket 连接
 */
async function init(options: SDKOptions): Promise<{ destroy: () => void }> {
  // 防止重复初始化
  if (_instance) {
    console.warn('[CodingAgentSDK] Already initialized, ignoring duplicate init()');
    return { destroy: () => _instance?.destroy() };
  }

  _instance = new AgentSDK(options);
  return _instance.init();
}

/**
 * 销毁当前 Coding Agent SDK 实例
 */
function destroy(): void {
  if (!_instance) return;
  _instance.destroy();
  _instance = null;
}

// ─── 挂载到全局 ───
// IIFE 模式下，name 为 CodingAgentSDK，Vite 会自动挂载到 window.CodingAgentSDK
// 这里手动补一个命名空间挂载以兼容不同构建模式
if (typeof window !== 'undefined') {
  (window as any).CodingAgentSDK = {
    init,
    destroy,
  };
}

export { init, destroy, type SDKOptions };
