# Coding Agent — 浏览器 AI 开发助手

## 一句话概括

在**任何 Web 项目**中注入一个**悬浮 AI 终端**，与 Claude / pi 等 CLI Agent 实时对话，支持**点击页面元素 → 查看源码 → 发送修改指令**。

## 接入方式


| 方式             | 适用场景          | 代码量        |
| -------------- | ------------- | ---------- |
| **Script 标签**  | 任何项目（含非 Vite） | 3 行 HTML   |
| **Vite 插件**    | Vite 项目       | 1 行配置      |
| **ESM import** | 框架内编程调用       | 1 行 import |


详见 [接入指南](./usage.md)。

## 设计哲学

- **零侵入**：不修改业务代码结构，`<script>` 标签或 Vite 插件一键注入
- **框架无关**：纯 HTML + CSS + TypeScript，不依赖 React/Vue/Angular
- ***独立 Runtime**：PTY 进程与浏览器 WebSocket 解耦，刷新不中断 AI 会话*
- **Monorepo**：`@coding-agent/sdk` + `@coding-agent/runtime` 两个包，可通过 npm 按需引入

## 项目结构

```
coding-agent/
├── packages/
│   ├── runtime/        @coding-agent/runtime  ← 后端（node-pty + WS）
│   │   ├── bin/cli.js     npx 入口
│   │   ├── index.js       启动入口
│   │   └── src/
│   │       ├── create-server.js  编程接口
│   │       ├── session-manager.js
│   │       └── history-buffer.js
│   └── sdk/            @coding-agent/sdk      ← 前端 SDK
│       ├── dist/
│       │   ├── coding-agent-sdk.es.js    ESM
│       │   ├── coding-agent-sdk.iife.js  IIFE
│       │   └── index.d.ts
│       ├── src/
│       │   ├── vite-plugin.ts    Vite 自动接入
│       │   └── ...
│       └── docs/
└── package.json        workspaces
```



## 核心能力


| 能力    | 说明                                                |
| ----- | ------------------------------------------------- |
| 终端    | xterm.js + node-pty 完整 Web 终端，Catppuccin Mocha 主题 |
| 会话保持  | PTY 跨页面刷新存活，3000 行 History Buffer 自动回放            |
| 元素拾取  | 点击页面元素 → `data-insp-path` → 源码位置                  |
| 代码上下文 | ±8 行代码展示，当前行高亮，安全退格 (CJK)                         |
| 上下文注入 | `文件路径 + 代码上下文 + 用户指令` 拼接发送给 AI                    |
| 拖拽缩放  | 面板自由拖拽定位，右下角把手缩放 (最小 400×240)                     |
| 自动回收  | 30 分钟无 WS 连接自动销毁 Session                          |
| 过期恢复  | Runtime 重启后 Session ID 自动重建，无需手动清 localStorage    |




## 包说明



### `@coding-agent/runtime`

```bash
# CLI
npx @coding-agent/runtime --port 3002

# 编程
import { startRuntime } from '@coding-agent/runtime';
startRuntime({ port: 3002 });

# 自定义 Server
import { createRuntimeServer } from '@coding-agent/runtime/server';
const { server, sessions } = createRuntimeServer();
```



### `@coding-agent/sdk`

```html
<!-- Script 标签 -->
<script src="http://localhost:3002/coding-agent-sdk.iife.js"></script>
```

```ts
// ESM import
import { init } from '@coding-agent/sdk';
init({ runtimeUrl: 'http://localhost:3002', workspace: '/path/to/project' });

// Vite 插件（自动注入 workspace + SDK）
import { codingAgentPlugin } from '@coding-agent/sdk/vite-plugin';
```

