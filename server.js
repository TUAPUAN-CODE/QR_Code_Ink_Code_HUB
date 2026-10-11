'use strict';
// เซิร์ฟเวอร์ไฟล์สถิตของ QR Code Tool — ใบแจ้งพิมพ์รหัสผลิตภัณฑ์ — ไม่มี dependency (รันได้เลยโดยไม่ต้อง npm install บนเครื่อง production)
// เสิร์ฟเฉพาะหน้า Generate QR Code.html, /vendor/*, /health และ /favicon.ico — ไฟล์อื่นในโฟลเดอร์ (server.js, .git, logs ฯลฯ) เข้าถึงไม่ได้
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');
const pkg = require('./package.json');

const PORT = Number(process.env.PORT) || 81;
const HOST = process.env.HOST || '0.0.0.0';
const ACCESS_LOG = process.env.ACCESS_LOG === '1';
const ROOT = __dirname;
const VENDOR_DIR = path.join(ROOT, 'vendor');
const INDEX_NAME = 'Generate QR Code.html'; // ชื่อไฟล์เดิม (มีเว้นวรรค) — ลิงก์/บุ๊กมาร์กเดิม /Generate%20QR%20Code.html ยังใช้ได้
const INDEX_FILE = path.join(ROOT, INDEX_NAME);
const STARTED_AT = Date.now();
const MAX_URL_LENGTH = 2048;
const MIN_COMPRESS_BYTES = 1024;
const MAX_CACHE_ENTRIES = 100;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt']);

// หน้านี้อ่าน/เขียนไฟล์ Excel และสร้าง/ตรวจ QR Code ในเบราว์เซอร์เท่านั้น ไม่เรียกเซิร์ฟเวอร์อื่นเลย จึงปิดทุกอย่างที่ไม่จำเป็น
// ('unsafe-inline' เพราะ index.html มี script/style ฝังอยู่ในไฟล์)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:", // หน้า "ตรวจสอบ QR Code" รัน Web Worker จาก Blob
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const log = (level, event, extra) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, pid: process.pid, ...extra });
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
};

const securityHeaders = (res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', CSP);
};

const sendText = (req, res, status, body, type = 'text/plain; charset=utf-8', extra = {}) => {
  securityHeaders(res);
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...extra });
  res.end(req.method === 'HEAD' ? undefined : body);
};

// แคชไฟล์ในหน่วยความจำ (ไฟล์ทั้งหมดรวมไม่ถึง 2 MB) พร้อมเวอร์ชันบีบอัด gzip/br — ตรวจ mtime ทุกคำขอ แก้ไฟล์แล้วมีผลทันทีไม่ต้อง restart
const cache = new Map();
const loadEntry = async (filePath, stat) => {
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const hit = cache.get(filePath);
  if (hit && hit.etag === etag) return hit;
  const raw = await fs.promises.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const entry = { etag, raw, gzip: null, br: null };
  if (COMPRESSIBLE.has(ext) && raw.length >= MIN_COMPRESS_BYTES) {
    entry.gzip = zlib.gzipSync(raw, { level: 9 });
    entry.br = zlib.brotliCompressSync(raw);
  }
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(filePath, entry);
  return entry;
};

const sendFile = async (req, res, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext];
  let stat;
  try { stat = await fs.promises.stat(filePath); } catch { return sendText(req, res, 404, 'Not Found'); }
  if (!type || !stat.isFile()) return sendText(req, res, 404, 'Not Found');

  const entry = await loadEntry(filePath, stat);
  // html/css/js ตรวจกับเซิร์ฟเวอร์ทุกครั้ง (304 ถ้าไม่เปลี่ยน) · ฟอนต์เก็บในเบราว์เซอร์ได้ 1 วัน
  const cacheControl = ext === '.woff2' ? 'public, max-age=86400' : 'no-cache';
  securityHeaders(res);
  res.setHeader('ETag', entry.etag);
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Vary', 'Accept-Encoding');
  if (req.headers['if-none-match'] === entry.etag) { res.writeHead(304); return res.end(); }

  const accept = String(req.headers['accept-encoding'] || '');
  let body = entry.raw;
  const headers = { 'Content-Type': type };
  if (entry.br && /\bbr\b/.test(accept)) { body = entry.br; headers['Content-Encoding'] = 'br'; }
  else if (entry.gzip && /\bgzip\b/.test(accept)) { body = entry.gzip; headers['Content-Encoding'] = 'gzip'; }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
};

const route = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendText(req, res, 405, 'Method Not Allowed', 'text/plain; charset=utf-8', { Allow: 'GET, HEAD' });
  }
  if (!req.url || req.url.length > MAX_URL_LENGTH) return sendText(req, res, 414, 'URI Too Long');

  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return sendText(req, res, 400, 'Bad Request'); }
  if (pathname.includes('\0') || pathname.includes('\\')) return sendText(req, res, 400, 'Bad Request');

  if (pathname === '/health') {
    return sendText(req, res, 200, JSON.stringify({
      status: 'ok', app: pkg.name, version: pkg.version, uptime_s: Math.round((Date.now() - STARTED_AT) / 1000), node: process.version,
    }), 'application/json; charset=utf-8');
  }
  if (pathname === '/' || pathname === '/index.html' || pathname === '/' + INDEX_NAME) return sendFile(req, res, INDEX_FILE);
  if (pathname === '/favicon.ico') { securityHeaders(res); res.writeHead(204, { 'Cache-Control': 'public, max-age=86400' }); return res.end(); }
  if (pathname.startsWith('/vendor/')) {
    const filePath = path.resolve(VENDOR_DIR, '.' + path.sep + pathname.slice('/vendor/'.length));
    if (!filePath.startsWith(VENDOR_DIR + path.sep)) return sendText(req, res, 404, 'Not Found');
    return sendFile(req, res, filePath);
  }
  return sendText(req, res, 404, 'Not Found');
};

const server = http.createServer((req, res) => {
  const started = ACCESS_LOG ? process.hrtime.bigint() : 0n;
  if (ACCESS_LOG) {
    res.on('finish', () => log('info', 'access', {
      method: req.method, url: String(req.url).slice(0, 200), status: res.statusCode, ms: Number((process.hrtime.bigint() - started) / 1000000n), ip: req.socket.remoteAddress,
    }));
  }
  route(req, res).catch((err) => {
    log('error', 'request_failed', { url: String(req.url).slice(0, 200), message: err.message });
    if (!res.headersSent) sendText(req, res, 500, 'Internal Server Error'); else res.destroy();
  });
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') log('error', 'port_in_use', { port: PORT, hint: 'มีโปรแกรมอื่นใช้พอร์ตนี้อยู่ — เปลี่ยน PORT ใน ecosystem.config.js' });
  else log('error', 'server_error', { code: err.code, message: err.message });
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const urls = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${PORT}/`);
  log('info', 'server_ready', { app: pkg.name, version: pkg.version, host: HOST, port: PORT, urls });
  if (process.send) process.send('ready'); // PM2 wait_ready
});

let closing = false;
const shutdown = (signal) => {
  if (closing) return;
  closing = true;
  log('info', 'shutdown', { signal });
  server.close(() => process.exit(0));
  if (server.closeIdleConnections) server.closeIdleConnections();
  setTimeout(() => process.exit(0), 4000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('message', (msg) => { if (msg === 'shutdown') shutdown('pm2-message'); }); // PM2 บน Windows
process.on('uncaughtException', (err) => { log('error', 'uncaught_exception', { message: err.message, stack: err.stack }); process.exit(1); });
process.on('unhandledRejection', (reason) => { log('error', 'unhandled_rejection', { message: String(reason && reason.message || reason) }); process.exit(1); });
