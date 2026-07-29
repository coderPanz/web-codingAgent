# 架构设计

## 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                        Browser                            │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │               Business App                         │  │
│  │          (React / Vue / Angular / ...)             │  │
│  └────────────────────┬───────────────────────────────┘  │
│                       │                                   │
│     @coding-agent/sdk (ESM import / IIFE script / Plugin) │
│                       │                                   │
│  ┌────────────────────┴───────────────────────────────┐  │
│  │  AgentSDK                                           │  │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────┐     │  │
│  │  │Floating  │  │ PanelUI  │  │ PickerEngine  │     │  │
│  │  │Trigger   │  │(drag/    │  │(overlay +     │     │  │
│  │  │          │  │ resize)  │  │ insp-path)    │     │  │
│  │  └──────────┘  └────┬─────┘  └───────┬───────┘     │  │
│  │                     │               │               │  │
│  │                ┌────┴────┐          │               │  │
│  │                │Terminal │◄─────────┘               │  │
│  │                │View     │                           │  │
│  │                │(xterm)  │                           │  │
│  │                └────┬────┘                           │  │
│  │                     │                                │  │
│  │                ┌────┴───────────┐                   │  │
│  │                │SessionClient   │                   │  │
│  │                │(HTTP + WS)     │                   │  │
│  │                └───────┬────────┘                   │  │
│  └────────────────────────┼────────────────────────────┘  │
│                           │                                │
└───────────────────────────┼────────────────────────────────┘
                            │  HTTP + WebSocket
                            ▼
┌──────────────────────────────────────────────────────────┐
│              @coding-agent/runtime  :3002                  │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐       │
│  │HTTP API  │  │ WS Relay │  │ Static (SDK dist) │       │
│  └────┬─────┘  └────┬─────┘  └──────────────────┘       │
│       └──────┬──────┘                                    │
│              ▼                                           │
│  ┌──────────────────────────┐                           │
│  │     SessionManager        │                           │
│  │  ┌────────┐ ┌────────┐   │                           │
│  │  │Session1│ │Session2│…  │                           │
│  │  │ ┌────┐ │ │ ┌────┐ │   │                           │
│  │  │ │PTY │ │ │ │PTY │ │   │                           │
│  │  │ │zsh │ │ │ │zsh │ │   │                           │
│  │  │ └────┘ │ │ └────┘ │   │                           │
│  │  └────────┘ └────────┘   │                           │
│  │  30min idle → auto kill   │                           │
│  └──────────────────────────┘                           │
└──────────────────────────────────────────────────────────┘
```

## SDK 模块职责

| 模块 | 文件 | 职责 |
|------|------|------|
| **index** | `index.ts` | 入口，导出 `init`/`destroy`，IIFE 下挂载 `window.CodingAgentSDK` |
| **AgentSDK** | `agent-sdk.ts` | 主调度器，组装所有模块，暴露 `init()`/`destroy()` |
| **SessionClient** | `session-client.ts` | HTTP 请求 + WebSocket 连接，Session 创建/复用/过期恢复 |
| **TerminalView** | `terminal-view.ts` | xterm.js 封装，Catppuccin 主题，上下文输入处理 |
| **PickerEngine** | `picker-engine.ts` | 拾取覆盖层、`data-insp-path` 解析、文件上下文读取 |
| **PanelUI** | `panel-ui.ts` | 面板 DOM、拖拽/缩放、输入栏、键盘事件 |
| **FloatingTrigger** | `floating-trigger.ts` | 浮动按钮 DOM 注入 |
| **styles** | `styles.ts` | CSS 模板字面量 + `<style>` 注入 |
| **vite-plugin** | `vite-plugin.ts` | Vite 插件，自动注入 workspace + SDK init |

### 依赖图

```
index.ts
  └── AgentSDK
        ├── SessionClient ──── (HTTP/WS, 底层通信)
        │     └── TerminalView ──── (xterm.js)
        │           ├── PickerEngine ──── (拾取)
        │           └── PanelUI ──────── (面板 DOM)
        ├── FloatingTrigger
        └── styles.ts
```

SessionClient → TerminalView → PickerEngine/PanelUI 形成单向依赖链，无循环引用。

## 核心数据流

### 打开面板

```
Trigger.click → AgentSDK.toggle()
  → PanelUI.show()                创建面板 DOM
  → TerminalView.mount()          挂载 xterm.js
  → SessionClient.ensureSession() 检查 localStorage
  → SessionClient.createSession() POST /session/create
  → SessionClient.connect()       WS ?sessionId=xxx
  → SessionClient.getCwd()        GET /cwd → 显示 workpace
```

### 拾取 → 上下文 → 发送

```
Picker activated
  → mousemove: 蓝色高亮 + 文件路径
  → click: elementFromPoint() → data-insp-path
  → parseInspPath() → { filePath, row }
  → deactivate() → 移除覆盖层
  → enterAwaitingMode() → input bar 显示
  → fit() → 终端校准
  → SessionClient.readFile() → 展示代码上下文
  → 用户输入 → Enter
    → 拼接 context + input
    → SessionClient.send() → WS → PTY stdin
    → exitAwaitingMode() → 隐藏 input bar
    → 双 rAF scrollToBottom → 视口回底
```

### Session 过期恢复

```
WS onclose code=4000
  → _staleSession = true
  → _clearPersisted()
  → _recreateAndReconnect()
    → POST /session/create  (新 session)
    → connect()  WS 重连
```

单一入口（`onclose`），避免 `onmessage` 竞态。

## Session 生命周期

```
create()  →  Session { id, workspace, pty: null }
attach()  →  spawn PTY (首次), 回放 History, WS relay
detach()  →  WS 断开, PTY 继续运行
destroy() →  kill PTY, 通知所有 WS 客户端
recycle   →  30min 无 WS → auto destroy()
```

## Runtime API

### HTTP

| 方法 | 路径 | 说明 |
|------|------|------|
| POST/GET | `/session/create` | 创建 Session，body `{ workspace }` |
| DELETE | `/session/:id` | 销毁 Session |
| GET | `/session/list` | 列表 |
| GET | `/cwd?sessionId=` | 工作区路径 |
| POST | `/read-file?sessionId=` | 读文件 `{ path }` |
| POST | `/write-file?sessionId=` | 写文件 `{ path, content }` |
| GET | `/*` | 静态文件（`../sdk/dist/`） |

### WebSocket (`/__agent/ws?sessionId=`)

| 消息 | 方向 | 说明 |
|------|------|------|
| `{ type:'input', data }` | → | PTY stdin |
| `{ type:'resize', cols, rows }` | → | PTY resize |
| `{ type:'requestHistory' }` | → | 请求回放 |
| `{ type:'data', data }` | ← | PTY 实时输出 |
| `{ type:'history', data }` | ← | 历史回放 |
| `{ type:'session', event }` | ← | attached/destroyed/pty-exited |
| `{ type:'error', data }` | ← | 错误消息 |
