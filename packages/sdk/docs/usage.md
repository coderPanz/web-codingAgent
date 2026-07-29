# 接入指南

## 前置条件

1. **Runtime 已启动**：

```bash
cd coding-agent/packages/runtime && node index.js
# 或
npx @coding-agent/runtime --port 3002
# 或在 yk 项目中: npm run agent-runtime
```

Runtime 监听 `:3002`，自动从 `../sdk/dist/` 提供 SDK 静态文件。

2. 项目使用 Vite（元素拾取依赖 `data-insp-path`，由 code-inspector-plugin 注入）

## 接入方式

### 方式 A：Vite 插件（推荐，零配置）

```bash
npm install -D @coding-agent/sdk code-inspector-plugin
```

```ts
// vite.config.ts
import { codingAgentPlugin } from '@coding-agent/sdk/vite-plugin';
import { CodeInspectorPlugin } from 'code-inspector-plugin';

export default defineConfig({
  plugins: [
    CodeInspectorPlugin({ bundler: 'vite' }),
    codingAgentPlugin({ runtimeUrl: 'http://localhost:3002' }),
  ],
});
```

插件自动完成：
- 注入 `window.__AGENT_WORKSPACE__`
- 注入 SDK IIFE script 标签
- 执行 `CodingAgentSDK.init(...)`

无需修改 HTML。

### 方式 B：Script 标签（任意项目）

```html
<script src="http://localhost:3002/coding-agent-sdk.iife.js"></script>
<script>
  CodingAgentSDK.init({
    runtimeUrl: 'http://localhost:3002',
    workspace: '/absolute/path/to/project',
  });
</script>
```

Vite 项目可配合 `transformIndexHtml` 插件自动注入 workspace 路径（参见 yk 项目 `vite.config.ts`）。

### 方式 C：ESM import（框架内编程调用）

```bash
npm install @coding-agent/sdk
```

```ts
import { init } from '@coding-agent/sdk';

init({
  runtimeUrl: 'http://localhost:3002',
  workspace: import.meta.dirname,  // Vite / Node 22+
});
```

> 注意：ESM 方式仍需 Runtime 独立运行，SDK 只负责浏览器端 UI。

## API 参考

### `CodingAgentSDK.init(options): Promise<{ destroy }>`

```ts
interface SDKOptions {
  runtimeUrl: string;          // 必填，Runtime 地址
  workspace?: string;          // 项目绝对路径
  triggerPosition?: {
    right?: number;            // 默认 24
    bottom?: number;           // 默认 24
  };
}
```

### `codingAgentPlugin(options?): VitePlugin`

```ts
interface CodingAgentPluginOptions {
  runtimeUrl?: string;         // 默认 'http://localhost:3002'
  devOnly?: boolean;           // 默认 true，仅 dev 环境启用
}
```

## 使用流程

### 1. 打开终端

点击右下角 `</>` 按钮 → 面板弹出，自动创建/复用 Session。

标题栏显示当前工作区路径。

### 2. 元素拾取

点击标题栏 **📍** 图标 → 鼠标划过元素蓝色高亮 → 点击。

终端显示：
- 元素信息 `<tag.class>text`
- 文件路径 + 行号
- ±8 行代码上下文（当前行绿色高亮）

### 3. 输入修改指令

在提示符后输入描述 → Enter 或点击 Send。

SDK 自动拼接上下文发给 AI CLI：

```
文件: src/pages/home.tsx:42
```ts
// ±8 行代码...
```

把按钮颜色改成蓝色
```

### 4. 撤销/取消

| 操作 | 方式 |
|------|------|
| 撤销上下文 | 点击输入栏 "清空" 按钮 |
| 取消拾取 | `Esc` |
| 取消输入 | `Esc` 或 `Ctrl+C` |
| 关闭面板 | 再次点击浮动按钮 |

## 快捷键

| 键 | 场景 | 行为 |
|----|------|------|
| `Esc` | 拾取模式 | 取消拾取 |
| `Esc` | 上下文输入 | 取消输入 |
| `Enter` | 上下文输入 | 发送指令 |
| `Backspace` | 上下文输入 | 删除（CJK 安全） |
| `Ctrl+C` | 上下文输入 | 取消输入 |

## FAQ

**Q: 第一次打开要等几秒？**

首次创建 Session 需要 spawn zsh，后续秒开。

**Q: 刷新页面终端还在吗？**

在。3000 行 History Buffer 自动回放。PTY 不中断。

**Q: Runtime 重启了怎么办？**

SDK 检测到 "Session not found"（WebSocket close code 4000），自动创建新 Session 重连。无需手动清 localStorage。

**Q: 多个项目能共享一个 Runtime 吗？**

能。每个项目通过 `workspace` 参数创建独立 Session，互不干扰。

**Q: 如何在生产环境禁用？**

Vite 插件默认仅 dev 生效（`apply: 'serve'`）。Script 标签方式可包裹环境判断。
