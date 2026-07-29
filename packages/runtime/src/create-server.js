/**
 * Coding Agent Runtime — 可编程导入的 Server 工厂
 *
 * @example
 * ```js
 * import { createRuntimeServer } from '@coding-agent/runtime/server';
 * const { server, sessions } = createRuntimeServer({ port: 3002 });
 * ```
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { SessionManager } from './session-manager.js';

// SDK dist 路径（相对于 runtime 包根目录）
const SDK_DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sdk', 'dist');

const MIME_TYPES = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

const serveStatic = (res, filePath) => {
  try {
    if (!filePath.startsWith(SDK_DIST_DIR)) return false;
    if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;
    const ext = extname(filePath).toLowerCase();
    const content = readFileSync(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(content);
    return true;
  } catch {
    return false;
  }
};

const jsonReply = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const getBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try { resolve(JSON.parse(body)); } catch { resolve({}); }
  });
  req.on('error', reject);
});

const getSessionId = (url, body = {}) => {
  try {
    const u = new URL(url, 'http://localhost');
    return u.searchParams.get('sessionId') || body.sessionId || '';
  } catch {
    return body.sessionId || '';
  }
};

const RECYCLE_TIMEOUT_MIN = 30;

/**
 * 创建 Runtime Server 实例
 * @param {{ port?: number, workspace?: string }} options
 * @returns {{ server: http.Server, sessions: SessionManager }}
 */
export function createRuntimeServer(options = {}) {
  const sessions = new SessionManager();
  sessions.startRecycle();

  const server = createServer(async (req, res) => {
    const url = req.url || '';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const parsedUrl = new URL(url, 'http://localhost');
    const pathname = parsedUrl.pathname.replace(/^\/__agent/, '');

    // ── 静态文件服务 ──
    if (req.method === 'GET') {
      const safePath = resolve(SDK_DIST_DIR, '.' + parsedUrl.pathname.replace(/\.\./g, ''));
      if (serveStatic(res, safePath)) return;
    }

    // ── Session API ──
    if (pathname === '/session/create' && (req.method === 'GET' || req.method === 'POST')) {
      let workspace = parsedUrl.searchParams.get('workspace') || '';
      if (req.method === 'POST') {
        const body = await getBody(req);
        workspace = body.workspace || workspace;
      }
      workspace = workspace || options.workspace || process.env.AGENT_DEFAULT_WORKSPACE || process.cwd();
      jsonReply(res, 201, sessions.create(workspace));
      return;
    }

    const deleteMatch = pathname.match(/^\/session\/(.+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      jsonReply(res, sessions.destroy(deleteMatch[1]) ? 200 : 404, { success: sessions.destroy(deleteMatch[1]) });
      return;
    }

    if (pathname === '/session/list' && req.method === 'GET') {
      const list = [];
      for (const [id, s] of sessions.sessions) {
        list.push({ sessionId: id, workspace: s.workspace, createdAt: s.createdAt, lastActive: s.lastActive, status: s.status, clientCount: s.clients.size });
      }
      jsonReply(res, 200, list);
      return;
    }

    if (pathname === '/cwd' && req.method === 'GET') {
      const sid = parsedUrl.searchParams.get('sessionId') || '';
      const session = sid ? sessions.get(sid) : null;
      jsonReply(res, 200, { cwd: session ? session.workspace : process.cwd() });
      return;
    }

    if (pathname === '/read-file' && req.method === 'POST') {
      const body = await getBody(req);
      const sid = getSessionId(url, body);
      const session = sid ? sessions.get(sid) : null;
      const rootDir = session ? session.workspace : process.cwd();
      const filePath = body.path || '';
      if (!filePath) { jsonReply(res, 400, { error: 'path is required' }); return; }
      const absolutePath = resolve(rootDir, filePath);
      if (!absolutePath.startsWith(rootDir)) { jsonReply(res, 403, { error: 'Access denied' }); return; }
      try {
        jsonReply(res, 200, { content: readFileSync(absolutePath, 'utf-8') });
      } catch (err) {
        jsonReply(res, 500, { error: err.message });
      }
      return;
    }

    if (pathname === '/write-file' && req.method === 'POST') {
      const body = await getBody(req);
      const sid = getSessionId(url, body);
      const session = sid ? sessions.get(sid) : null;
      const rootDir = session ? session.workspace : process.cwd();
      const filePath = body.path || '';
      const content = body.content || '';
      if (!filePath) { jsonReply(res, 400, { error: 'path is required' }); return; }
      const absolutePath = resolve(rootDir, filePath);
      if (!absolutePath.startsWith(rootDir)) { jsonReply(res, 403, { error: 'Access denied' }); return; }
      try {
        mkdirSync(dirname(absolutePath), { recursive: true });
        writeFileSync(absolutePath, content, 'utf-8');
        jsonReply(res, 200, { success: true });
      } catch (err) {
        jsonReply(res, 500, { error: err.message });
      }
      return;
    }

    res.statusCode = 404;
    res.end('Not found');
  });

  // ─── WebSocket ───
  const wss = new WebSocketServer({ server });

  wss.shouldHandle = (req) => (req.url || '').startsWith('/__agent/ws');

  wss.on('connection', (ws, req) => {
    const url = req.url || '';
    let sessionId = '';
    try { sessionId = new URL(url, 'http://localhost').searchParams.get('sessionId') || ''; } catch { /* */ }

    if (!sessionId) {
      ws.send(JSON.stringify({ type: 'error', data: 'Missing sessionId' }));
      ws.close(4000, 'Missing sessionId');
      return;
    }

    const result = sessions.attach(sessionId, ws);
    if (!result.success) {
      ws.send(JSON.stringify({ type: 'error', data: result.reason }));
      ws.close(4000, result.reason);
      return;
    }

    console.log(`[WS] ${sessionId.slice(0, 8)} connected`);

    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'input') sessions.write(sessionId, parsed.data);
        else if (parsed.type === 'resize') sessions.resize(sessionId, parsed.cols, parsed.rows);
        else if (parsed.type === 'requestHistory') {
          const session = sessions.get(sessionId);
          if (session) {
            const history = session.history.getAll();
            if (history.length > 0) ws.send(JSON.stringify({ type: 'history', data: history, source: 'undo' }));
          }
        }
      } catch { sessions.write(sessionId, msg.toString()); }
    });

    ws.on('close', () => sessions.detach(sessionId, ws));
    ws.on('error', () => sessions.detach(sessionId, ws));
  });

  return { server, sessions, wss };
}

/**
 * 启动 Runtime Server（CLI / 编程通用）
 */
export function startRuntime(options = {}) {
  const port = options.port || process.env.AGENT_PORT || 3002;
  const { server, sessions } = createRuntimeServer(options);

  server.listen(port, () => {
    console.log(`\n🧠 Coding Agent Runtime V1.0`);
    console.log(`   HTTP    : http://localhost:${port}`);
    console.log(`   WS      : ws://localhost:${port}/__agent/ws`);
    console.log(`   Session : timeout ${RECYCLE_TIMEOUT_MIN}min auto-recycle\n`);
  });

  const shutdown = () => {
    console.log('\nShutting down...');
    sessions.stopRecycle();
    for (const [id] of sessions.sessions) sessions.destroy(id);
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, sessions };
}
