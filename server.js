/**
 * 练吧 (Lianba) —— 本地自学工作台
 * 零依赖 Node.js 服务：静态页面 + 状态持久化 + 资讯(RSS)聚合
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const NEWS_CACHE = path.join(DATA_DIR, 'news-cache.json');

const PORT = Number(process.env.PORT || 8848);
const HOST = '127.0.0.1';
const NEWS_TTL_MS = 30 * 60 * 1000; // 30 分钟缓存

// 公网访问密码：仓库中不含默认密码。
// 取值顺序：环境变量 LIANBA_PASSWORD → data/share-password.txt → 自动生成随机密码并写入该文件。
const AUTH_COOKIE = 'lianba_auth';
const SHARE_PASSWORD_FILE = path.join(DATA_DIR, 'share-password.txt');
function resolveSharePassword() {
  const fromEnv = String(process.env.LIANBA_PASSWORD || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const saved = String(fs.readFileSync(SHARE_PASSWORD_FILE, 'utf8')).trim();
    if (saved) return saved;
  } catch { /* 尚未生成 */ }
  const generated = String(crypto.randomInt(100000, 1000000));
  try { fs.writeFileSync(SHARE_PASSWORD_FILE, generated + '\n', 'utf8'); } catch { /* ignore */ }
  return generated;
}

// 保证单个请求出错不会拖垮整个服务
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e && e.message || e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e && e.message || e));

await fsp.mkdir(DATA_DIR, { recursive: true });

const SHARE_PASSWORD = resolveSharePassword();
const AUTH_TOKEN = crypto.createHash('sha256').update('lianba::' + SHARE_PASSWORD).digest('hex').slice(0, 24);

/* ------------------------------------------------------------------ */
/* 默认资讯源（人工智能 / 科技行业）。用户可在界面里增删。            */
/* ------------------------------------------------------------------ */
const DEFAULT_SOURCES = [
  { id: 'qbitai', name: '量子位', url: 'https://www.qbitai.com/feed', group: 'AI', enabled: true },
  { id: 'leiphone', name: '雷锋网', url: 'https://www.leiphone.com/feed', group: 'AI', enabled: true },
  { id: 'infoq', name: 'InfoQ 中文', url: 'https://www.infoq.cn/feed', group: '技术', enabled: true },
  { id: 'ifanr', name: '爱范儿', url: 'https://www.ifanr.com/feed', group: '科技', enabled: true },
  { id: 'sspai', name: '少数派', url: 'https://sspai.com/feed', group: '效率', enabled: true },
  { id: 'solidot', name: 'Solidot', url: 'https://www.solidot.org/index.rss', group: '科技', enabled: true },
  { id: 'tmtpost', name: '钛媒体', url: 'https://www.tmtpost.com/feed', group: '商业', enabled: true },
  { id: 'ruanyf', name: '阮一峰的网络日志', url: 'https://www.ruanyifeng.com/blog/atom.xml', group: '技术', enabled: true },
  { id: 'googleai', name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', group: 'AI', enabled: true },
  { id: 'deepmind', name: 'DeepMind Blog', url: 'https://deepmind.google/blog/rss.xml', group: 'AI', enabled: true },
  { id: 'mit', name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', group: 'AI', enabled: true },
  { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/', group: '商业', enabled: true },
  { id: 'verge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', group: '科技', enabled: true },
  { id: 'hn', name: 'Hacker News', url: 'https://hnrss.org/frontpage', group: '技术', enabled: true },
];

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */
function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(buf);
}
function sendJSON(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}
function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* --------- HTTP(S) 抓取，支持重定向 / gzip / 超时 --------- */
function fetchUrl(url, { timeout = 15000, redirects = 5, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(url); } catch (e) { return reject(new Error('无效 URL: ' + url)); }
    const mod = target.protocol === 'http:' ? http : https;
    const req = mod.request(target, {
      method: 'GET',
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...headers,
      },
    }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, target).toString();
        return fetchUrl(next, { timeout, redirects: redirects - 1, headers }).then(resolve, reject);
      }
      if (code < 200 || code >= 300) { res.resume(); return reject(new Error('HTTP ' + code)); }
      let stream = res;
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      if (enc.includes('gzip')) stream = res.pipe(zlib.createGunzip());
      else if (enc.includes('deflate')) stream = res.pipe(zlib.createInflate());
      else if (enc.includes('br')) stream = res.pipe(zlib.createBrotliDecompress());
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('请求超时')); });
    req.end();
  });
}

/* --------- 极简 RSS / Atom 解析 --------- */
function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
function stripHtml(s) {
  return decodeEntities(String(s || ''))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tag(block, names) {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`, 'i'));
    if (m && m[1] != null) return m[1];
  }
  return '';
}
function absUrl(u, base) { try { return new URL(u, base).toString(); } catch { return u; } }
function pickLink(block, base) {
  // Atom: <link rel="alternate" href="...">
  let m = block.match(/<link[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/i)
       || block.match(/<link[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']alternate["']/i);
  if (m) return absUrl(decodeEntities(m[1]).trim(), base);
  // RSS: <link>https://...</link>
  const inner = decodeEntities(tag(block, ['link'])).trim();
  if (inner && /^https?:\/\//i.test(inner)) return absUrl(inner, base);
  // 任意 <link href="...">
  m = block.match(/<link[^>]*\bhref=["']([^"']+)["']/i);
  if (m) return absUrl(decodeEntities(m[1]).trim(), base);
  // <guid isPermaLink="true">
  const g = block.match(/<guid[^>]*isPermaLink=["']true["'][^>]*>([\s\S]*?)<\/guid>/i);
  if (g) return absUrl(decodeEntities(g[1]).trim(), base);
  if (inner) return absUrl(inner, base);
  return '';
}
function parseFeed(xml, source) {
  const items = [];
  let blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  if (!blocks.length) blocks = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks.slice(0, 40)) {   // 每个源最多取 40 条，控制缓存体积
    const title = stripHtml(tag(b, ['title'])).slice(0, 300);
    if (!title) continue;
    const link = pickLink(b, source.url);
    if (!link || !/^https?:\/\//i.test(link)) continue;   // 无有效原文链接的条目直接跳过
    const dateRaw = stripHtml(tag(b, ['pubDate', 'published', 'updated', 'dc:date', 'date']));
    let ts = Date.parse(dateRaw);
    if (Number.isNaN(ts)) ts = Date.now();
    const summary = stripHtml(tag(b, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 600);
    items.push({
      id: crypto.createHash('sha1').update(source.id + '|' + link).digest('hex').slice(0, 16),
      title, link, summary, ts,
      source: source.name, sourceId: source.id, group: source.group || '资讯',
    });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* 状态读写                                                            */
/* ------------------------------------------------------------------ */
function defaultState() {
  return {
    version: 1,
    profile: { name: '', dailyMinutes: 120 },
    ws1: { config: {}, plan: [], tasksDone: {}, checkins: {} },
    ws2: { sources: DEFAULT_SOURCES.map((s) => ({ ...s })), saved: [], read: {}, notes: {} },
    ws3: { config: { targetWeight: 65, dailyMinutes: 45, dailyDeficit: 400, height: 172, age: 28, gender: 'male' }, records: {} },
  };
}
async function readState() {
  try {
    const txt = await fsp.readFile(STATE_FILE, 'utf8');
    const st = JSON.parse(txt);
    const base = defaultState();
    return {
      ...base, ...st,
      profile: { ...base.profile, ...(st.profile || {}) },
      ws1: { ...base.ws1, ...(st.ws1 || {}) },
      ws2: { ...base.ws2, ...(st.ws2 || {}) },
      ws3: { ...base.ws3, ...(st.ws3 || {}) },
    };
  } catch {
    return defaultState();
  }
}
let writeChain = Promise.resolve();
function writeState(obj) {
  writeChain = writeChain.then(() => fsp.writeFile(STATE_FILE, JSON.stringify(obj, null, 2), 'utf8'));
  return writeChain;
}

/* ------------------------------------------------------------------ */
/* 资讯聚合                                                            */
/* ------------------------------------------------------------------ */
let newsLock = null;
async function getNews(force) {
  let cached = null;
  try { cached = JSON.parse(await fsp.readFile(NEWS_CACHE, 'utf8')); } catch { /* ignore */ }
  const now = Date.now();
  const st = await readState();
  let sources = Array.isArray(st.ws2?.sources) && st.ws2.sources.length ? st.ws2.sources : DEFAULT_SOURCES;
  sources = sources.filter((s) => s && s.url && s.enabled !== false);

  const key = sources.map((s) => s.id + ':' + s.url).sort().join('|');
  const fresh = cached && cached.key === key && now - cached.fetchedAt < NEWS_TTL_MS;
  if (fresh && !force) return { ...cached, cached: true };

  if (newsLock) { try { return await newsLock; } catch { /* fall through */ } }
  newsLock = (async () => {
    const results = await Promise.allSettled(sources.map(async (s) => {
      const xml = await fetchUrl(s.url);
      return { source: s, items: parseFeed(xml, s) };
    }));
    const items = [];
    const errors = [];
    const perSource = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') { items.push(...r.value.items); perSource[sources[i].id] = r.value.items.length; }
      else { perSource[sources[i].id] = 0; errors.push({ id: sources[i].id, name: sources[i].name, error: String(r.reason?.message || r.reason) }); }
    });
    items.sort((a, b) => b.ts - a.ts);
    const payload = { fetchedAt: now, key, count: items.length, items, errors, perSource };
    await fsp.writeFile(NEWS_CACHE, JSON.stringify(payload), 'utf8');
    return { ...payload, cached: false };
  })();
  try { return await newsLock; } finally { newsLock = null; }
}

/* ------------------------------------------------------------------ */
/* 访问密码（仅对内网/公网访问生效，本机 127.0.0.1 免密）               */
/* ------------------------------------------------------------------ */
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isLocalHost(req) {
  const host = String(req.headers.host || '').toLowerCase();
  return host.startsWith('127.0.0.1') || host.startsWith('localhost') || host.startsWith('[::1]');
}
function isAuthed(req) {
  if (isLocalHost(req)) return true;
  return parseCookies(req)[AUTH_COOKIE] === AUTH_TOKEN;
}
function loginPage(res, error) {
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>练吧 · 需要访问密码</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;
  background:linear-gradient(120deg,#0f1524,#21337a 55%,#4b2f8f);color:#fff}
.card{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);padding:34px 32px;border-radius:18px;
  width:330px;max-width:92vw;box-shadow:0 24px 60px rgba(0,0,0,.38);text-align:center}
.logo{width:52px;height:52px;border-radius:14px;margin:0 auto 14px;display:grid;place-items:center;font-size:24px;font-weight:800;
  background:linear-gradient(135deg,#2f6bff,#6a4cff)}
h1{font-size:19px;margin:0 0 4px}
p{color:#b9c4dd;font-size:12.5px;margin:0 0 18px}
input{width:100%;padding:11px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.22);
  background:rgba(0,0,0,.28);color:#fff;font-size:16px;letter-spacing:3px;text-align:center;outline:none}
input:focus{border-color:#6a4cff;box-shadow:0 0 0 3px rgba(106,76,255,.3)}
button{width:100%;margin-top:12px;padding:11px;border:0;border-radius:10px;font-size:14px;font-weight:600;color:#fff;cursor:pointer;
  background:linear-gradient(135deg,#2f6bff,#6a4cff)}
.err{color:#ff9b93;font-size:12.5px;margin-top:10px;min-height:16px}
</style></head><body>
<form class="card" method="POST" action="/login">
  <div class="logo">练</div>
  <h1>练吧 · 自学工作台</h1>
  <p>该链接需要访问密码</p>
  <input type="password" name="password" inputmode="numeric" autocomplete="current-password" autofocus placeholder="请输入访问密码">
  <button type="submit">进入工作台</button>
  <div class="err">${error ? '密码不正确，请重试' : ''}</div>
</form></body></html>`;
  send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' });
}

/* ------------------------------------------------------------------ */
/* 静态文件                                                            */
/* ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const safe = path.normalize(rel).replace(/^([/\\])+/, '');
  const full = path.join(PUBLIC_DIR, safe);
  if (!full.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  try {
    const data = await fsp.readFile(full);
    send(res, 200, data, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' });
  } catch {
    send(res, 404, 'Not Found');
  }
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  const p = url.pathname;
  try {
    // ---- 访问密码校验（本机免密）----
    if (!isAuthed(req)) {
      if (p === '/login' && req.method === 'POST') {
        const params = new URLSearchParams(await readBody(req));
        if (params.get('password') === SHARE_PASSWORD) {
          return send(res, 302, '', {
            'Set-Cookie': `${AUTH_COOKIE}=${AUTH_TOKEN}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly`,
            'Location': '/',
          });
        }
        return loginPage(res, true);
      }
      if (p === '/login') return loginPage(res, false);
      if (p.startsWith('/api/')) return sendJSON(res, 401, { error: '需要访问密码' });
      return loginPage(res, false);
    }
    if (p === '/logout') {
      return send(res, 302, '', { 'Set-Cookie': `${AUTH_COOKIE}=; Path=/; Max-Age=0`, 'Location': '/login' });
    }
    if (p === '/api/state' && req.method === 'GET') {
      return sendJSON(res, 200, await readState());
    }
    if (p === '/api/state' && (req.method === 'PUT' || req.method === 'POST')) {
      const body = JSON.parse(await readBody(req) || '{}');
      const merged = { ...defaultState(), ...body };
      await writeState(merged);
      return sendJSON(res, 200, { ok: true });
    }
    if (p === '/api/sources' && req.method === 'GET') {
      const st = await readState();
      return sendJSON(res, 200, { defaults: DEFAULT_SOURCES, sources: st.ws2?.sources || DEFAULT_SOURCES });
    }
    if (p === '/api/news' && req.method === 'GET') {
      const force = url.searchParams.get('refresh') === '1';
      const data = await getNews(force);
      return sendJSON(res, 200, data);
    }
    if (p === '/api/health') return sendJSON(res, 200, { ok: true, t: Date.now() });
    if (p.startsWith('/api/')) return sendJSON(res, 404, { error: 'unknown api' });
    return await serveStatic(req, res, p);
  } catch (err) {
    return sendJSON(res, 500, { error: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  const link = `http://${HOST}:${PORT}/`;
  console.log('');
  console.log('  ==================================================');
  console.log('    练吧 · 本地自学工作台  正在运行 / Lianba is running');
  console.log('  ==================================================');
  console.log('');
  console.log('    工作台链接 (open this): ' + link);
  console.log('    公网访问密码 (share password): ' + SHARE_PASSWORD);
  console.log('    密码保存在 data/share-password.txt，可自行修改；本机 127.0.0.1 免密。');
  console.log('    保持本窗口开启；按 Ctrl+C 关闭。');
  console.log('');
  if (process.platform === 'win32' && !process.env.LIANBA_NO_OPEN) {
    try { spawn('cmd', ['/c', 'start', '', link], { detached: true, stdio: 'ignore' }).unref(); } catch { /* ignore */ }
  }
});
