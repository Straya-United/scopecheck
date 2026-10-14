import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzeRules, LIMITS, validateInput } from './analysis.mjs';
import { analyzeNebius, getProviderConfig, PROVIDER_LIMITS } from './nebius.mjs';
import { AppError } from './errors.mjs';
import demo from './demo.mjs';
import scenarios from './scenarios.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const API_LIMITS = Object.freeze({ maxBodyBytes: 200_000, liveRequestsPerMinute: 5, liveRequestsPerSession: 20, liveConcurrentRequests: 1 });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.pdf': 'application/pdf' };

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function readJson(req) {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(req.headers['content-type'] || '')) throw new AppError(415, 'JSON_REQUIRED', 'Send application/json.');
  if (Number(req.headers['content-length']) > API_LIMITS.maxBodyBytes) throw new AppError(413, 'BODY_TOO_LARGE', 'The request body is too large.');
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > API_LIMITS.maxBodyBytes) throw new AppError(413, 'BODY_TOO_LARGE', 'The request body is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError(400, 'INVALID_JSON', 'The request body must be valid JSON.'); }
}
function hostnameOf(host) {
  try { return new URL(`http://${host}`).hostname.toLowerCase(); } catch { return null; }
}
function validLocalHost(host) { return ['127.0.0.1', 'localhost', '[::1]'].includes(hostnameOf(host)); }

/** Hosted mode: PUBLIC_HOSTS lists the exact public hostnames (e.g. "scopecheck.onrender.com"). Empty = local-only. */
export function getHostingConfig(env = process.env) {
  const publicHosts = String(env.PUBLIC_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter((h) => /^[a-z0-9.-]+$/.test(h));
  const hosted = publicHosts.length > 0;
  const int = (value, fallback) => (Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback);
  return {
    hosted, publicHosts,
    liveProcessCap: int(env.LIVE_PROCESS_CAP, hosted ? 500 : API_LIMITS.liveRequestsPerSession),
    liveDailyCap: int(env.LIVE_DAILY_CAP, hosted ? 150 : API_LIMITS.liveRequestsPerSession),
    livePerIpPerHour: int(env.LIVE_PER_IP_PER_HOUR, hosted ? 6 : API_LIMITS.liveRequestsPerSession),
  };
}

function checkRequestOrigin(req, hosting) {
  // Prevent DNS-rebinding and cross-site requests to the credential-bearing server.
  const allowedHost = (host) => validLocalHost(host) || (hosting.hosted && hosting.publicHosts.includes(hostnameOf(host)));
  if (!req.headers.host || !allowedHost(req.headers.host)) throw new AppError(403, 'INVALID_HOST', hosting.hosted ? 'Unknown host.' : 'This local app accepts only loopback hostnames.');
  // Following a link from another site (e.g. Devpost) is a top-level GET navigation and must be allowed;
  // cross-site background requests (fetches, form posts, API calls) are still rejected.
  const topLevelNavigation = ['GET', 'HEAD'].includes(req.method) && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document';
  if (req.headers['sec-fetch-site'] === 'cross-site' && !topLevelNavigation) throw new AppError(403, 'INVALID_ORIGIN', 'Cross-site requests are not allowed.');
  if (req.headers.origin) {
    let origin;
    try { origin = new URL(req.headers.origin); } catch { throw new AppError(403, 'INVALID_ORIGIN', 'Origin is not allowed.'); }
    const local = validLocalHost(origin.host) && (origin.host === req.headers.host || ['5173', '4173'].includes(origin.port));
    const publicSame = hosting.hosted && origin.protocol === 'https:' && hosting.publicHosts.includes(origin.hostname.toLowerCase()) && origin.hostname.toLowerCase() === hostnameOf(req.headers.host);
    if (!['http:', 'https:'].includes(origin.protocol) || !(local || publicSame)) throw new AppError(403, 'INVALID_ORIGIN', 'Origin is not allowed.');
  }
}
function clientKey(req, hosting) {
  // Behind the hosting proxy the client address is the first X-Forwarded-For entry; locally use the socket.
  const forwarded = hosting.hosted ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return forwarded || req.socket.remoteAddress || 'unknown';
}

export function createAppServer({ env = process.env, fetchImpl = globalThis.fetch, distDir = path.join(ROOT, 'dist'), nowMs = Date.now, providerTimeoutMs } = {}) {
  let liveInFlight = 0; let liveTotal = 0; let liveWindow = [];
  const hosting = getHostingConfig(env);
  let day = ''; let dayCount = 0; const perIp = new Map();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (hosting.hosted) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url, 'http://localhost');
      // The health probe exposes no secrets or documents; platform health checks may use an internal hostname.
      if (!(hosting.hosted && req.method === 'GET' && url.pathname === '/api/health')) checkRequestOrigin(req, hosting);
      if (req.method === 'GET' && url.pathname === '/api/health') {
        const { enabled, configured, available, model } = getProviderConfig(env);
        return json(res, 200, { ok: true, hosted: hosting.hosted, nebius: { enabled, configured, available, model }, limits: { ...LIMITS, ...API_LIMITS, maxOutputTokens: PROVIDER_LIMITS.maxOutputTokens } });
      }
      if (req.method === 'GET' && url.pathname === '/api/demo') return json(res, 200, demo);
      if (req.method === 'GET' && url.pathname === '/api/demos') return json(res, 200, scenarios);
      if (req.method === 'POST' && url.pathname === '/api/analyze') {
        const { scope, quote, mode } = validateInput(await readJson(req));
        if (mode === 'rules') return json(res, 200, analyzeRules(scope, quote));
        const config = getProviderConfig(env);
        // Let the adapter return the actionable disabled/configuration error without counting a call.
        if (!config.available) return json(res, 200, await analyzeNebius(scope, quote, { env, fetchImpl }));
        const currentTime = nowMs();
        liveWindow = liveWindow.filter((timestamp) => currentTime - timestamp < 60_000);
        if (liveTotal >= hosting.liveProcessCap) throw new AppError(429, 'SESSION_LIMIT', 'The server-session live-call cap has been reached. Review usage and budget before restarting the server.');
        const today = new Date(currentTime).toISOString().slice(0, 10);
        if (today !== day) { day = today; dayCount = 0; perIp.clear(); }
        if (dayCount >= hosting.liveDailyCap) throw new AppError(429, 'DAILY_LIMIT', 'Today\'s live-analysis allowance has been used. Rules mode is still available, and live analysis resets at 00:00 UTC.');
        const who = clientKey(req, hosting);
        const mine = (perIp.get(who) || []).filter((timestamp) => currentTime - timestamp < 3_600_000);
        if (mine.length >= hosting.livePerIpPerHour) throw new AppError(429, 'CLIENT_LIMIT', 'You have reached the live-analysis limit for this hour. Rules mode is still available.');
        if (liveInFlight >= API_LIMITS.liveConcurrentRequests) throw new AppError(429, 'LIVE_BUSY', 'One live analysis is already running. Wait for it to finish.');
        if (liveWindow.length >= API_LIMITS.liveRequestsPerMinute) throw new AppError(429, 'RATE_LIMIT', 'The local live-analysis rate limit has been reached. Wait at least a minute.');
        liveInFlight += 1; liveTotal += 1; liveWindow.push(currentTime); dayCount += 1; mine.push(currentTime); perIp.set(who, mine);
        try {
          return json(res, 200, await analyzeNebius(scope, quote, { env, fetchImpl, timeoutMs: providerTimeoutMs }));
        } finally { liveInFlight -= 1; }
      }
      if (url.pathname.startsWith('/api/')) throw new AppError(req.method === 'GET' ? 404 : 405, 'API_NOT_FOUND', 'Unknown API route or method.');
      if (!['GET', 'HEAD'].includes(req.method)) throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      let decoded;
      try { decoded = decodeURIComponent(url.pathname); } catch { throw new AppError(400, 'INVALID_PATH', 'Invalid path.'); }
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some((part) => part.startsWith('.'))) throw new AppError(404, 'NOT_FOUND', 'File not found.');
      let root;
      try { root = await realpath(distDir); } catch { throw new AppError(404, 'BUILD_NOT_FOUND', 'Frontend build not found. Start the development UI or run npm run build.'); }
      let file = path.resolve(root, `.${decoded}`);
      if (!file.startsWith(`${root}${path.sep}`) && file !== root) throw new AppError(404, 'NOT_FOUND', 'File not found.');
      if (!path.extname(file)) file = path.join(root, 'index.html');
      if (!MIME[path.extname(file)]) throw new AppError(404, 'NOT_FOUND', 'File not found.');
      try {
        file = await realpath(file);
        if (!file.startsWith(`${root}${path.sep}`) || !(await stat(file)).isFile()) throw new Error();
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)], 'Cache-Control': path.basename(file) === 'index.html' ? 'no-store' : 'public, max-age=3600' });
        return res.end(req.method === 'HEAD' ? undefined : body);
      } catch { throw new AppError(404, 'NOT_FOUND', 'File not found.'); }
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      const known = error instanceof AppError;
      // Never send or log arbitrary provider errors, document text, keys, or stack traces.
      json(res, known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'The analysis could not be completed.' } });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  const hosting = getHostingConfig();
  // Hosted mode listens on all interfaces behind the platform's HTTPS proxy; local mode stays on loopback.
  createAppServer().listen(port, hosting.hosted ? '0.0.0.0' : '127.0.0.1', () => {
    console.log(hosting.hosted ? `ScopeCheck hosted mode for ${hosting.publicHosts.join(', ')} on port ${port}` : `ScopeCheck local server: http://127.0.0.1:${port}`);
    console.log('Live inference is opt-in, capped, and disabled unless NEBIUS_ENABLED=true.');
  });
}
