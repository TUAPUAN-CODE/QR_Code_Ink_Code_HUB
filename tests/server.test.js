'use strict';
// รัน: npm test   (ใช้ node:test ในตัว Node — ไม่ต้องติดตั้งอะไร)
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const INDEX_NAME = 'Generate QR Code.html';
const PORT = 41000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
let child;

const rawGet = (rawPath, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: rawPath, method: 'GET', headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  });
  req.on('error', reject);
  req.end();
});

test.before(async () => {
  child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* ยังไม่พร้อม */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server ไม่ขึ้นภายใน 5 วินาที');
});
test.after(() => { if (child) child.kill(); });

test('/health ตอบ ok', async () => {
  const res = await fetch(`${BASE}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('หน้าแรกเสิร์ฟได้ พร้อม security header', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('หน้าเว็บไม่พึ่งอินเทอร์เน็ต (ไม่มี src/href/importScripts ไปโดเมนอื่น)', () => {
  const html = fs.readFileSync(path.join(ROOT, INDEX_NAME), 'utf8');
  const external = [...html.matchAll(/\b(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)/g)].map((m) => m[1]);
  assert.deepEqual(external, []);
  assert.doesNotMatch(html, /importScripts\(\s*['"`]https?:/, 'Web Worker ต้องไม่โหลดสคริปต์จากอินเทอร์เน็ต');
});

test('ลิงก์เดิม /Generate%20QR%20Code.html ยังใช้ได้ และมี worker-src สำหรับ Web Worker', async () => {
  const res = await fetch(`${BASE}/Generate%20QR%20Code.html`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /worker-src 'self' blob:/);
});

test('ทุกไฟล์ /vendor/ ที่ index.html และ css อ้างถึงมีอยู่จริง', async () => {
  const html = fs.readFileSync(path.join(ROOT, INDEX_NAME), 'utf8');
  const refs = new Set([...html.matchAll(/(?:src|href)="(\/vendor\/[^"?#]+)/g)].map((m) => m[1]));
  assert.ok(refs.size >= 3, 'ควรมีไฟล์ vendor อ้างถึงอย่างน้อย 3 ไฟล์');
  for (const ref of [...refs]) {
    if (ref.endsWith('.css')) {
      const css = fs.readFileSync(path.join(ROOT, ref), 'utf8');
      for (const m of css.matchAll(/url\(\s*["']?(\.[^"')\s]+)/g)) refs.add(path.posix.normalize(path.posix.join(path.posix.dirname(ref), m[1])));
    }
  }
  for (const ref of refs) {
    const res = await rawGet(ref);
    assert.equal(res.status, 200, `${ref} ต้องเปิดได้`);
    assert.ok(res.body.length > 0, `${ref} ต้องไม่ว่าง`);
  }
});

test('บีบอัด gzip และ ETag/304', async () => {
  const gz = await rawGet('/', { 'Accept-Encoding': 'gzip' });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.equal(zlib.gunzipSync(gz.body).toString('utf8'), fs.readFileSync(path.join(ROOT, INDEX_NAME), 'utf8'));
  const again = await rawGet('/', { 'If-None-Match': gz.headers.etag });
  assert.equal(again.status, 304);
});

test('เข้าถึงไฟล์นอกรายการอนุญาตไม่ได้ (path traversal)', async () => {
  for (const p of ['/server.js', '/package.json', '/package-lock.json', '/start_qr_tool_node.bat', '/node_modules/express/package.json', '/.git/config', '/logs/error.log', '/vendor/../server.js', '/vendor/%2e%2e/server.js', '/vendor/..%5cserver.js', '/vendor/phosphor/', '/%00']) {
    const res = await rawGet(p);
    assert.ok([400, 404].includes(res.status), `${p} ต้องถูกปฏิเสธ (ได้ ${res.status})`);
  }
});

test('method อื่นนอกจาก GET/HEAD ถูกปฏิเสธ', async () => {
  const res = await fetch(`${BASE}/`, { method: 'POST', body: 'x' });
  assert.equal(res.status, 405);
});
