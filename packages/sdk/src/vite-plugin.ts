/**
 * @coding-agent/sdk/vite-plugin
 *
 * Vite 插件：自动注入 workspace 路径 + Coding Agent SDK init 脚本
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { codingAgentPlugin } from '@coding-agent/sdk/vite-plugin';
 * export default defineConfig({
 *   plugins: [
 *     codingAgentPlugin({ runtimeUrl: 'http://localhost:3002' }),
 *   ],
 * });
 * ```
 */

import path from 'path';

export interface CodingAgentPluginOptions {
  /** Runtime 后端地址，默认 'http://localhost:3002' */
  runtimeUrl?: string;
  /** 是否仅在 DEV 环境注入，默认 true */
  devOnly?: boolean;
}

export function codingAgentPlugin(options: CodingAgentPluginOptions = {}): any {
  const { runtimeUrl = 'http://localhost:3002', devOnly = true } = options;

  return {
    name: 'coding-agent-sdk',
    apply: devOnly ? 'serve' : undefined,
    transformIndexHtml(html: string) {
      const workspace = JSON.stringify(path.resolve(process.cwd()));
      return html.replace(
        '</head>',
        `<script>window.__AGENT_WORKSPACE__ = ${workspace};</script>
<script src="${runtimeUrl}/coding-agent-sdk.iife.js"></script>
<script>
  CodingAgentSDK.init({ runtimeUrl: ${JSON.stringify(runtimeUrl)}, workspace: window.__AGENT_WORKSPACE__ });
</script>
</head>`
      );
    },
  };
}
