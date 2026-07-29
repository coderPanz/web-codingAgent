# Coding Agent

浏览器 AI 开发助手 — 零侵入、框架无关。一键将 AI 终端注入任何 Web 项目。

## Monorepo 结构

```
coding-agent/
├── packages/
│   ├── runtime/          @coding-agent/runtime   后端服务
│   └── sdk/              @coding-agent/sdk        前端 SDK
├── package.json          根脚本 + workspaces
└── README.md
```

## 包说明

### `@coding-agent/sdk`

前端 SDK，构建产物支持两种使用方式：

| 方式 | 文件 | 场景 |
|------|------|------|
| **ESM import** | `dist/coding-agent-sdk.es.js` | `import { init } from '@coding-agent/sdk'` |
| **Script 标签** | `dist/coding-agent-sdk.iife.js` | `<script src="...">` |

```ts
// 方式一：ESM import
import { init } from '@coding-agent/sdk';
init({ runtimeUrl: 'http://localhost:3002', workspace: '/path/to/project' });
```

```ts
// 方式二：Vite 插件（自动注入）
import { codingAgentPlugin } from '@coding-agent/sdk/vite-plugin';
// vite.config.ts → plugins: [codingAgentPlugin({ runtimeUrl: 'http://localhost:3002' })]
```

### `@coding-agent/runtime`

后端 Runtime 服务，支持两种启动方式：

```bash
# 方式一：CLI
npx @coding-agent/runtime --port 3002
```

```js
// 方式二：编程导入
import { startRuntime } from '@coding-agent/runtime';
startRuntime({ port: 3002 });
```

```js
// 方式三：仅创建 server（自定义中间件）
import { createRuntimeServer } from '@coding-agent/runtime/server';
const { server, sessions } = createRuntimeServer();
// server 是 http.Server 实例，可自行 .listen()
```

## 快速开始

```bash
# 1. 安装
cd coding-agent && npm install

# 2. 构建 SDK
npm run build

# 3. 启动 Runtime
npm start
```

Runtime → `http://localhost:3002`，自动提供 SDK 文件。

## 文档

- [项目介绍](./packages/sdk/docs/overview.md)
- [接入指南](./packages/sdk/docs/usage.md)
- [架构设计](./packages/sdk/docs/architecture.md)
- [技术实现](./packages/sdk/docs/technical.md)
