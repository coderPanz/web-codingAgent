/**
 * Coding Agent SDK — 类型定义
 */

/** SDK 初始化选项 */
export interface SDKOptions {
  /** Runtime 后端地址，如 'http://localhost:3002' */
  runtimeUrl: string;
  /** 工作区路径（可选，默认使用 Runtime 的 AGENT_DEFAULT_WORKSPACE） */
  workspace?: string;
  /** 悬浮按钮位置 */
  triggerPosition?: {
    bottom?: number;
    right?: number;
  };
}

/** Panel 位置与尺寸 */
export interface PanelGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** parseInspPath 解析结果 */
export interface InspPathResult {
  filePath: string;
  row: number;
  col: number;
  nodeType: string;
}

/** Session 创建响应 */
export interface CreateSessionResponse {
  sessionId: string;
  workspace: string;
}

/** read-file 响应 */
export interface ReadFileResponse {
  content?: string;
  error?: string;
}

/** WebSocket 消息 */
export interface WSMessage {
  type: 'data' | 'history' | 'session' | 'error';
  data?: string;
  source?: 'undo' | 'reconnect';
  event?: 'attached' | 'destroyed' | 'pty-exited';
  sessionId?: string;
  workspace?: string;
  message?: string;
  exitCode?: number;
}
