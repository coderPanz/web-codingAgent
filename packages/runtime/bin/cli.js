#!/usr/bin/env node

/**
 * Coding Agent Runtime — CLI
 *
 * 用法:
 *   npx @coding-agent/runtime [--port 3002] [--workspace /path/to/project]
 */

import { startRuntime } from '../src/create-server.js';

const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    options.port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--workspace' && args[i + 1]) {
    options.workspace = args[i + 1];
    i++;
  }
}

startRuntime(options);
