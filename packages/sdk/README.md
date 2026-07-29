# Coding Agent SDK

浏览器 AI 开发助手 — **零侵入、框架无关、可注入**的 Web UI 组件。

## 设计目标

- **零框架依赖**：纯 HTML + CSS + TypeScript，不依赖 React/Vue/Angular
- **零业务侵入**：业务系统仅需引入一个 `<script>` 标签 + 一行初始化代码
- **独立 Runtime**：PTY 生命周期与浏览器解耦，刷新页面不中断 AI 会话

## 快速开始

### 1. 启动 Runtime

```bash
cd coding-agent-runtime
AGENT_DEFAULT_WORKSPACE=/path/to/your/project npm start
```

Runtime 启动在 `http://localhost:3002`，提供 HTTP API + WebSocket + 静态文件服务。

### 2. 业务系统接入

在 `index.html` 的 `</body>` 前引入：

```html
<script src="http://localhost:3002/coding-agent-sdk.js"></script>
<script>
  CodingAgentSDK.init({
    runtimeUrl: 'http://localhost:3002',
    // workspace: '/optional/path',  // 默认使用 Runtime 的工作区
  });
</script>
```

完成！页面右下角会出现浮动按钮，点击即可打开 AI 终端。

## API

### `CodingAgentSDK.init(options)`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `runtimeUrl` | `string` | ✓ | Runtime 后端地址，如 `http://localhost:3002` |
| `workspace` | `string` | | 项目工作区路径（可选，默认使用 Runtime 的 `AGENT_DEFAULT_WORKSPACE`） |
| `triggerPosition` | `{ right, bottom }` | | 浮动按钮位置，默认 `{ right: 24, bottom: 24 }` |

返回 `{ destroy: () => void }`，调用 `destroy()` 可完全移除 SDK。

### `CodingAgentSDK.destroy()`

销毁 SDK 实例，移除所有 DOM 元素和样式。

## 架构

```
Browser
        │
        ▼
┌────────────────────────────┐
│ Business System            │
│ (React / Vue / Angular...) │
└──────────────┬─────────────┘
               │
    引入 coding-agent-sdk.js
               │
               ▼
┌────────────────────────────┐
│ Coding Agent UI Runtime    │
│                            │
│ • FloatingTrigger          │
│ • PanelUI (拖拽/缩放)      │
│ • TerminalView (xterm.js)  │
│ • PickerEngine (元素拾取)  │
│ • SessionClient (WS/HTTP)  │
└──────────────┬─────────────┘
               │ WebSocket + HTTP
               ▼
┌────────────────────────────┐
│ coding-agent-runtime       │
│                            │
│ • SessionManager           │
│ • node-pty (zsh/pwsh)     │
│ • History Buffer           │
└────────────────────────────┘
```

## 功能

| 功能 | 说明 |
|------|------|
| 🖥️ 伪终端 | 基于 xterm.js + node-pty 的完整 Web 终端 |
| 🔄 会话保持 | PTY 存活于 Runtime，刷新页面自动恢复 |
| 🎯 元素拾取 | 点击页面元素获取源码位置 + 代码上下文 |
| 📝 上下文输入 | 拾取后输入修改诉求，自动拼接上下文发给 AI |
| 🖱️ 拖拽缩放 | 面板自由拖拽定位，右下角把手缩放 |
| ⏱️ 自动回收 | 30 分钟无活动自动回收 Session |

## 文档

| 文档 | 说明 |
|------|------|
| [项目介绍](./docs/overview.md) | 设计哲学与能力全景 |
| [接入指南](./docs/usage.md) | 分步教程 + API 参考 + FAQ |
| [架构设计](./docs/architecture.md) | 模块划分、数据流、Runtime API |
| [技术实现](./docs/technical.md) | 核心实现细节与设计决策 |

## 构建

```bash
npm install
npm run build     # 输出到 dist/
```

构建产物：
- `dist/coding-agent-sdk.js` — 324KB（gzip 82KB），包含 xterm.js

## 与 Vue 组件版对比

| | Vue 组件版 | SDK 版 |
|---|---|---|
| 接入方式 | 修改 app.tsx 注册组件 | `<script>` 标签 + 一行 init |
| 框架依赖 | Vue 3 + TSX | 无 |
| 样式 | Less/SCSS（按项目） | 内嵌 CSS |
| 侵入性 | 需修改源代码 | 零侵入 |
| 跨项目复用 | 需复制组件文件 | 一个 JS 文件 |
