# 技术实现

## 构建系统

### Monorepo 构建

Vite `lib` 模式，一次构建输出两种格式：

```ts
// packages/sdk/vite.config.ts
build: {
  lib: {
    entry: 'src/index.ts',
    formats: ['es', 'iife'],
    name: 'CodingAgentSDK',
  },
  rollupOptions: {
    external: [],           // 全量打包（含 xterm.js）
    output: { inlineDynamicImports: true },
  },
}
```

| 产物 | 用途 | 大小 |
|------|------|------|
| `coding-agent-sdk.iife.js` | `<script>` 标签 | ~325KB (gzip ~82KB) |
| `coding-agent-sdk.es.js` | `import { init }` | ~445KB (gzip ~92KB) |
| `index.d.ts` | TypeScript 类型 | - |

IIFE 挂载 `window.CodingAgentSDK`，ESM 导出 `{ init, destroy }`。

### Runtime 无构建

Runtime 是纯 Node.js ESM 项目，无需编译。`bin/cli.js` 通过 shebang 注册为 `npx` 可执行入口。

## 包导出设计

### `@coding-agent/sdk`

```json
{
  "exports": {
    ".":           "./dist/coding-agent-sdk.es.js",
    "./iife":      "./dist/coding-agent-sdk.iife.js",
    "./vite-plugin": "./src/vite-plugin.ts"
  }
}
```

- `.` 主入口 → ESM，供 `import { init } from '@coding-agent/sdk'`
- `./iife` → 供 Runtime 静态服务
- `./vite-plugin` → 源码级导出，由 Vite 项目自行编译

### `@coding-agent/runtime`

```json
{
  "exports": {
    ".":         "./index.js",
    "./server":  "./src/create-server.js"
  },
  "bin": {
    "coding-agent-runtime": "./bin/cli.js"
  }
}
```

- `.` → `startRuntime()` 一键启动
- `./server` → `createRuntimeServer()` 返回 `http.Server`，可插入 Koa/Express 中间件
- `bin` → `npx @coding-agent/runtime --port 3002`

## 核心实现

### 1. Session 与 WebSocket 解耦

```
localStorage: _coding_agent_sessionId

┌─ 首次 ──────────────────────────────────────┐
│ ensureSession() → 无缓存                     │
│ createSession() → POST /session/create       │
│ persistSessionId() → localStorage            │
│ connect() → WS ?sessionId=xxx                │
└──────────────────────────────────────────────┘

┌─ 刷新/重连 ─────────────────────────────────┐
│ ensureSession() → localStorage 有缓存        │
│ connect() → WS ?sessionId=xxx                │
│ Runtime attach() → 找到 PTY → 回放 History   │
└──────────────────────────────────────────────┘
```

### 2. Session 过期自动恢复

```
WS onclose code=4000 ("Session not found")
  → _staleSession = true, _clearPersisted()
  → _recreateAndReconnect()
    → POST /session/create
    → connect() (新 sessionId)
```

唯一入口在 `onclose`，避免 `onmessage`/`onclose` 竞态导致死循环。

### 3. 双 rAF 终端同步

输入提交 → input bar 隐藏 → terminal resize → 滚动位置偏移。

```ts
// 1. 发送数据
this._client.send(combined + '\r');
// 2. ResizeObserver → fit()（异步）
// 3. rAF #1：布局完成
requestAnimationFrame(() => {
  // 4. rAF #2：fit 已执行
  requestAnimationFrame(() => {
    terminal.scrollToBottom();
  });
});
```

### 4. CJK 安全退格

不区分 `\x7f` (Delete) 和 `\b` (Backspace)，统一 `slice(0, -1)` 按字符删除：

```ts
} else if (data === '\x7f' || data === '\b') {
  if (inputBuffer.length > 0) {
    inputBuffer = inputBuffer.slice(0, -1);
    term.write('\r\x1b[K');
    term.write(`\x1b[36m❯ \x1b[0m${inputBuffer}`);
  }
}
```

### 5. 元素拾取可靠性

`mousemove` 仅用于视觉反馈，`click` 时用 `elementFromPoint()` 实时查询：

```ts
const el = document.elementFromPoint(e.clientX, e.clientY);
const rawPath = el?.getAttribute('data-insp-path') || '';
```

事件用 capture 阶段 (`addEventListener(..., true)`)，`preventDefault` + `stopPropagation` 阻止页面响应。

### 6. 拾取首次渲染时序

问题：拾取后终端 28 行 → input bar 显示 → 缩到 25 行 → 内容被挤乱。

修复：**先设 `awaitingInput = true` → 等 input bar 渲染 → `fit()` 校准 → 再写内容**。

```ts
// PickerEngine._onClick()
deactivatePicker();
awaitingInput.value = true;
nextTick(() => {
  fit();                 // 校准到最终尺寸
  scrollToBottom();
  writeln('📍 Picked...');
  fetchCodeContext();    // 异步读取
});
```

### 7. 拖拽/缩放

纯 DOM 事件，无第三方依赖：

- **拖拽**：`mousedown` on header → `mousemove` 更新位置 → `mouseup` 清理
- **缩放**：`mousedown` on handle → `mousemove` 更新宽高 + 反向移动左上角 → `mouseup` 清理
- **约束**：最小 400×240

```ts
// 缩放：反向移动保持右下角固定
this._width  = Math.max(400, initW + dX);
this._height = Math.max(240, initH + dY);
this._posX = initX - (this._width - initW);
this._posY = initY - (this._height - initH);
```

### 8. 环形历史缓冲区

Runtime 中 `HistoryBuffer` — 3000 行环形缓冲：

```js
class HistoryBuffer {
  constructor(capacity = 3000) {
    this._buffer = [];
    this._capacity = capacity;
  }
  append(data) {
    this._buffer.push(data);
    if (this._buffer.length > this._capacity) this._buffer.shift();
  }
  drain() {         // attach 回放（消费型）
    const data = this._buffer.join('');
    this._buffer = [];
    return data;
  }
  getAll() {        // undo 回放（只读型）
    return this._buffer.join('');
  }
}
```

### 9. CSS 注入策略

所有样式以模板字面量存储在 `styles.ts`（含 xterm.js core CSS），`injectStyles()` 时通过 `document.createElement('style')` 注入 `<head>`。无需独立 CSS 文件，真正的单文件接入。

### 10. Vite 插件实现

`codingAgentPlugin()` → `transformIndexHtml` hook：

```ts
transformIndexHtml(html) {
  return html.replace('</head>', `
    <script>window.__AGENT_WORKSPACE__ = "${process.cwd()}";</script>
    <script src="${runtimeUrl}/coding-agent-sdk.iife.js"></script>
    <script>CodingAgentSDK.init({...})</script>
  </head>`);
}
```

`apply: 'serve'` 确保仅开发环境生效。
