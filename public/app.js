/* =====================================================================
   练吧 (Lianba) · 本地自学工作台 — 前端应用逻辑
   三大工作台：1) 信息系统高项  2) AIIA 资讯  3) 健康猿
   ===================================================================== */
(() => {
'use strict';

const CUR = window.LIANBA_CURRICULUM || { chapters: [], resources: [], drill: [] };
const LS_KEY = 'lianba-state-v1';
const app = document.getElementById('app');
const mainEl = document.getElementById('main');
const navEl = document.getElementById('nav');
const sideStatEl = document.getElementById('sideStat');
const connEl = document.getElementById('conn');
const toastEl = document.getElementById('toast');
const modalEl = document.getElementById('modal');
const modalBox = document.getElementById('modalBox');

/* ------------------------------ utils ------------------------------ */
const enc = encodeURIComponent;
const pad = (n) => String(n).padStart(2, '0');
const h = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const uid = (p = 'id') => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

function d2(x) { return new Date(x + 'T00:00:00'); }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayISO() { return iso(new Date()); }
function addDays(s, n) { const d = d2(s); d.setDate(d.getDate() + n); return iso(d); }
function addMonths(s, n) { const d = d2(s); d.setMonth(d.getMonth() + n); return iso(d); }
function diffDays(a, b) { return Math.round((d2(b) - d2(a)) / 86400000); }
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function fmtDate(s) { const d = d2(s); return `${s.slice(5)} ${WD[d.getDay()]}`; }
function fmtLong(s) { const d = d2(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WD[d.getDay()]}`; }
function relTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
  if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
  if (s < 86400 * 30) return Math.floor(s / 86400) + ' 天前';
  return new Date(ts).toLocaleDateString('zh-CN');
}
function monthOf(s) { return s.slice(0, 7); }
function weekStart(s) { const d = d2(s); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return iso(d); }
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}
function copy(text, label = '已复制') {
  const done = () => toast(label);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done(); });
  } else { fallbackCopy(text); done(); }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  ta.remove();
}
function setConn(ok) {
  if (!connEl) return;
  connEl.textContent = ok ? '● 本地已连接' : '● 离线模式';
  connEl.className = 'conn ' + (ok ? 'ok' : 'bad');
}

/* --------------------------- state / store -------------------------- */
function defaultState() {
  return {
    version: 1,
    profile: { name: '', dailyMinutes: 120 },
    ws1: { config: {}, plan: [], tasksDone: {}, checkins: {} },
    ws2: { sources: [], saved: [], read: {}, cards: [], notes: {} },
    ws3: { config: { goal: '减脂塑形', sessionsPerWeek: 3, minutes: 40 }, plan: null, checkins: {}, records: {} },
  };
}
let state = defaultState();
let saveTimer = null;
let serverOK = false;

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushState, 350);
  renderSideStat();
}
async function pushState() {
  try {
    const r = await fetch('/api/state', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state),
    });
    if (!r.ok) throw new Error();
    serverOK = true;
  } catch (e) { serverOK = false; }
  setConn(serverOK);
}
async function loadState() {
  let loaded = null;
  try {
    const r = await fetch('/api/state');
    if (r.status === 401) { location.href = '/login'; return; }
    if (r.ok) { loaded = await r.json(); serverOK = true; }
  } catch (e) { serverOK = false; }
  if (!loaded) {
    try { loaded = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) {}
  }
  const base = defaultState();
  state = Object.assign({}, base, loaded || {});
  state.profile = Object.assign({}, base.profile, state.profile || {});
  state.ws1 = Object.assign({}, base.ws1, state.ws1 || {});
  state.ws2 = Object.assign({}, base.ws2, state.ws2 || {});
  const validTracks = AIIA_TRACKS.map((t) => t.id);
  if (!Array.isArray(state.ws2.tracks)) state.ws2.tracks = validTracks.slice();
  else {
    const kept = state.ws2.tracks.filter((id) => validTracks.includes(id));
    state.ws2.tracks = (state.ws2.tracks.length > 0 && kept.length === 0) ? validTracks.slice() : kept;
  }
  if (state.ws2._v2 !== true) { state.ws2._filter = 'week'; state.ws2._v2 = true; }
  if (state.ws2._v3 !== true) { state.ws2._filter = 'week'; state.ws2._v3 = true; }
  state.ws3 = Object.assign({}, base.ws3, state.ws3 || {});
  state.ws3.config = Object.assign({}, base.ws3.config, state.ws3.config || {});
  delete state.ws3.config.equipment;
  delete state.ws3.config.weekdays;
  const GOAL_MAP = { '增肌': '塑形增肌', '减脂': '减脂塑形', '塑形': '减脂塑形', '保持体能': '保持体能' };
  if (!GOALS.includes(state.ws3.config.goal)) state.ws3.config.goal = GOAL_MAP[state.ws3.config.goal] || '减脂塑形';
  if (!state.ws3.config.sessionsPerWeek) state.ws3.config.sessionsPerWeek = state.ws3.config.daysPerWeek || 3;
  delete state.ws3.config.daysPerWeek;
  state.ws1.config = Object.assign({}, state.ws1.config || {});
  state.ws1._ws = weekStart(todayISO());   // 每次进入都先看本周，避免停在大片空白的旧周

  // ---- 迁移各类旧打卡数据 → 主动式打卡（带 sessionKey）----
  if (!state.ws3.checkins) state.ws3.checkins = {};
  if (state.ws3.lightDays && Object.keys(state.ws3.lightDays).length) {
    for (const d of Object.keys(state.ws3.lightDays)) {
      if (!state.ws3.checkins[d]) state.ws3.checkins[d] = { done: true, at: Date.now(), sessionKey: 'light', sessionTitle: '轻量日 · 低冲击有氧 + 拉伸', note: '' };
    }
    state.ws3.lightDays = {};
  }
  const legacy = state.ws3.records || {};
  if (Object.keys(legacy).length && !Object.keys(state.ws3.checkins).length) {
    for (const [d, r] of Object.entries(legacy)) state.ws3.checkins[d] = { done: true, at: r.at || Date.now(), sessionKey: 'free', sessionTitle: '自主训练', note: r.note || '' };
  }
  for (const c of Object.values(state.ws3.checkins)) {
    if (c && !c.sessionKey) { c.sessionKey = 'free'; c.sessionTitle = c.sessionTitle || '自主训练'; }
  }
  if (!Array.isArray(state.ws3._ings)) state.ws3._ings = [];

  // ---- 计划：旧版按周几排的自动迁移为「每周 N 套」----
  let ws3Migrated = false;
  if (!state.ws3.plan) {
    state.ws3.plan = buildPlan(state.ws3.config);
  } else {
    if (!state.ws3.plan.startDate) state.ws3.plan.startDate = todayISO();
    if (!Array.isArray(state.ws3.plan.sessions)) {
      state.ws3.plan = buildPlan(Object.assign({}, state.ws3.config, {
        startDate: state.ws3.plan.startDate,
        sessionsPerWeek: state.ws3.plan.daysPerWeek || state.ws3.config.sessionsPerWeek,
      }));
      ws3Migrated = true;
    }
  }
  setConn(serverOK);
  // 首次：若服务端无资讯源，用内置默认；若含有已失效的旧源，则替换为新的默认源
  if (!state.ws2.sources || !state.ws2.sources.length) await loadDefaultSources();
  else if (state.ws2.sources.some((s) => DEAD_SOURCE_IDS.includes(s.id))) await syncNewSources();
  if (ws3Migrated) save();
}
async function loadDefaultSources() {
  try {
    const r = await fetch('/api/sources');
    if (r.ok) { const j = await r.json(); state.ws2.sources = j.defaults || []; save(); }
  } catch (e) {}
}
// 已失效的旧资讯源（RSS 返回网页/长期超时），加载时自动剔除并补上新的默认源
const DEAD_SOURCE_IDS = ['jiqizhixin', '36kr', 'huxiu'];
async function syncNewSources() {
  try {
    const r = await fetch('/api/sources');
    if (!r.ok) return;
    const j = await r.json();
    const cur = (state.ws2.sources || []).filter((s) => !DEAD_SOURCE_IDS.includes(s.id));
    const have = new Set(cur.map((s) => s.id));
    for (const d of (j.defaults || [])) if (!have.has(d.id)) cur.push(Object.assign({}, d));
    state.ws2.sources = cur;
    save();
  } catch (e) {}
}

/* ------------------------------ nav / router ------------------------ */
const NAV = [
  { route: '#/home', label: '首页总览', ico: '🏠' },
  { sep: '工作台' },
  { route: '#/ws1', label: '信息系统高项', ico: '📘', dot: 'var(--ws1)' },
  { route: '#/ws2', label: 'AIIA 求职雷达', ico: '📡', dot: 'var(--ws2)' },
  { route: '#/ws3', label: '健康猿', ico: '💪', dot: 'var(--ws3)' },
  { sep: '系统' },
  { route: '#/settings', label: '设置与数据', ico: '⚙️' },
];
function renderNav() {
  const cur = (location.hash || '#/home').split('?')[0];
  navEl.innerHTML = NAV.map((n) => {
    if (n.sep) return `<div class="nav-sep">${h(n.sep)}</div>`;
    return `<a class="nav-item ${cur === n.route ? 'active' : ''}" href="${n.route}">
      <span class="ico">${n.ico}</span><span>${h(n.label)}</span>
      ${n.dot ? `<span class="dot" style="background:${n.dot};margin-left:auto"></span>` : ''}
    </a>`;
  }).join('');
}
function renderSideStat() {
  if (!sideStatEl) return;
  const t = todayISO();
  const w1 = ws1Day(t); const w3 = ws3Check(t);
  sideStatEl.innerHTML =
    `今日打卡：<b>${(w1.done.length ? 1 : 0) + (w3 ? 1 : 0)}</b> / 2<br>` +
    `学习任务：<b>${w1.done.length}</b> / ${w1.tasks.length}　资讯源：<b>${(state.ws2.sources || []).filter(s => s.enabled !== false).length}</b>`;
}

let rendered = { route: null };
function render() {
  const route = (location.hash || '#/home').split('?')[0];
  renderNav();
  renderSideStat();
  try {
    if (route === '#/ws1') mainEl.innerHTML = viewWS1();
    else if (route === '#/ws2') mainEl.innerHTML = viewWS2();
    else if (route === '#/ws3') mainEl.innerHTML = viewWS3();
    else if (route === '#/settings') mainEl.innerHTML = viewSettings();
    else mainEl.innerHTML = viewHome();
  } catch (err) {
    mainEl.innerHTML = `<div class="card card-pad"><h3>页面渲染出错</h3><pre class="tiny muted" style="white-space:pre-wrap">${h(err && err.stack || err)}</pre></div>`;
  }
  rendered.route = route;
  if (route === '#/ws2') ensureNews();
  window.scrollTo(0, 0);
}
function go(route) { if (location.hash === route) render(); else location.hash = route; }

/* =====================================================================
   工作台1 · 信息系统高项
   ===================================================================== */
function ws1Day(date) {
  const tasks = (state.ws1.plan || []).filter((t) => t.date === date);
  const done = tasks.filter((t) => state.ws1.tasksDone[t.id]);
  const minutes = done.reduce((s, t) => s + (t.minutes || 0), 0);
  return { tasks, done, minutes, total: tasks.length };
}
function ws1Stats() {
  const plan = state.ws1.plan || [];
  const done = plan.filter((t) => state.ws1.tasksDone[t.id]);
  const pct = plan.length ? Math.round((done.length / plan.length) * 100) : 0;
  const cf = state.ws1.config || {};
  const examIn = cf.endDate ? diffDays(todayISO(), cf.endDate) : null;
  let streak = 0; let d = todayISO();
  const dateSet = new Set(Object.keys(state.ws1.checkins || {}).filter((k) => {
    const c = state.ws1.checkins[k]; return c && (c.done > 0);
  }));
  if (!dateSet.has(d)) d = addDays(d, -1);
  while (dateSet.has(d)) { streak++; d = addDays(d, -1); }
  return { total: plan.length, done: done.length, pct, examIn, streak, minutes: done.reduce((s, t) => s + (t.minutes || 0), 0) };
}
function chapterById(id) { return CUR.chapters.find((c) => c.id === id); }
function ws1TaskLinks(t) {
  const ch = chapterById(t.chapterId);
  const links = [];
  if (ch) {
    links.push({ label: '📺 B站精讲', url: 'https://search.bilibili.com/all?keyword=' + enc('信息系统项目管理师 ' + ch.title) });
    links.push({ label: '▶️ YouTube', url: 'https://www.youtube.com/results?search_query=' + enc('信息系统项目管理师 ' + ch.title) });
    const topic = (ch.res && ch.res[0]) || (ch.title + ' 知识点');
    links.push({ label: '🔎 ' + topic, url: 'https://www.bing.com/search?q=' + enc(topic + ' 软考 信息系统项目管理师') });
  } else if (t.type === 'drill') {
    links.push({ label: '🎯 打开刷题平台', url: 'https://www.cnitpm.com/onlinetest/' });
  }
  return links;
}
function taskRow(t, compact) {
  const on = !!state.ws1.tasksDone[t.id];
  const isDrill = t.type === 'drill';
  const isMock = t.type === 'mock';
  const typeBadge = isDrill ? '<span class="badge brand">巩固刷题</span>'
    : isMock ? '<span class="badge danger">冲刺</span>'
    : `<span class="badge">第${t.no}章</span>`;
  const title = (isDrill || isMock) ? h(t.title) : `<b>${h(t.chapterTitle)}</b> · ${h(t.point)}`;
  const links = ws1TaskLinks(t);
  if (compact) {
    return `<div class="lesson compact ${on ? 'done' : ''}">
      <div class="check ${on ? 'on' : ''}" data-action="ws1-toggle" data-id="${h(t.id)}" data-date="${h(t.date)}" title="打卡">${on ? '✓' : ''}</div>
      <div class="lbody">
        <div class="lmeta">${typeBadge}<span class="ltitle" style="font-weight:600">${title}</span><span class="tiny muted">${t.minutes || 0}′</span>
          ${links.slice(0, 2).map((l) => `<a class="res-link" href="${h(l.url)}" target="_blank" rel="noopener">${h(l.label)}</a>`).join('')}
        </div>
      </div>
    </div>`;
  }
  return `<div class="lesson ${on ? 'done' : ''}">
    <div class="check ${on ? 'on' : ''}" data-action="ws1-toggle" data-id="${h(t.id)}" data-date="${h(t.date)}" title="打卡">${on ? '✓' : ''}</div>
    <div class="lbody">
      <div class="ltitle">${title}</div>
      <div class="lmeta">${typeBadge}<span class="tiny muted">⏱ ${t.minutes || 0} 分钟</span></div>
      ${links.length ? `<div class="lres">${links.map((l) => `<a class="res-link" href="${h(l.url)}" target="_blank" rel="noopener">${h(l.label)}</a>`).join('')}</div>` : ''}
    </div>
  </div>`;
}
function getWeekNo(dateStr) {
  const start = (state.ws1.config && state.ws1.config.startDate) || dateStr;
  return Math.floor(diffDays(weekStart(start), weekStart(dateStr)) / 7) + 1;
}
function fmtMD(s) { const d = d2(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
function ws1WeekStart() { return state.ws1._ws || weekStart(todayISO()); }
function renderWeekPlan() {
  const plan = state.ws1.plan || [];
  if (!plan.length) return `<div class="empty"><span class="big">🗓️</span>还没有计划。点「计划设置」生成一份弹性学习计划。</div>`;
  const ws = ws1WeekStart();
  const thisWeek = weekStart(todayISO());
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(ws, i));
  const byDate = new Map();
  for (const t of plan) { if (!byDate.has(t.date)) byDate.set(t.date, []); byDate.get(t.date).push(t); }

  // ---- 本周目标卡 ----
  const weekTasks = days.flatMap((d) => byDate.get(d) || []);
  const content = weekTasks.filter((t) => t.type === 'content');
  const drills = weekTasks.filter((t) => t.type === 'drill');
  const mocks = weekTasks.filter((t) => t.type === 'mock');
  const doneCnt = weekTasks.filter((t) => state.ws1.tasksDone[t.id]).length;
  const totalMin = weekTasks.reduce((s, t) => s + (t.minutes || 0), 0);
  const doneMin = weekTasks.filter((t) => state.ws1.tasksDone[t.id]).reduce((s, t) => s + (t.minutes || 0), 0);
  const activeDays = days.filter((d) => (byDate.get(d) || []).length).length;
  const doneDays = days.filter((d) => { const it = byDate.get(d) || []; return it.length && it.every((x) => state.ws1.tasksDone[x.id]); }).length;
  const chs = [...new Set(content.map((t) => t.chapterId))].map(chapterById).filter(Boolean);
  const pct = weekTasks.length ? Math.round((doneCnt / weekTasks.length) * 100) : 0;
  const isThisWeek = ws === thisWeek;

  const planStart = (state.ws1.config && state.ws1.config.startDate) || null;
  const beforeStart = planStart && days[6] < planStart;

  const goal = beforeStart
    ? `<div class="wk-goal off">
        <div class="spread">
          <div class="row"><b>📅 ${fmtMD(days[0])} – ${fmtMD(days[6])}</b><span class="badge">计划开始前</span></div>
          <button class="btn xs" data-action="ws1-week" data-dir="0">回到本周</button>
        </div>
        <div class="tiny muted" style="margin-top:8px">本周在计划开始日（${planStart}）之前，还没有安排学习内容。</div>
      </div>`
    : `<div class="wk-goal">
    <div class="spread">
      <div class="row"><b>🎯 本周目标</b>${isThisWeek ? '<span class="badge brand">本周</span>' : '<span class="badge">非本周</span>'}
        <span class="tiny muted">${fmtMD(days[0])} – ${fmtMD(days[6])} · 第 ${getWeekNo(days[0])} 周</span></div>
      <span class="tiny muted">${doneCnt}/${weekTasks.length} 任务 · 约 ${totalMin} 分钟</span>
    </div>
    <div class="wg-metrics">
      <span class="badge">📖 知识点 ${content.length}</span>
      <span class="badge">🎯 刷题 ${drills.length} 次</span>
      ${mocks.length ? `<span class="badge danger">🚀 冲刺 ${mocks.length}</span>` : ''}
      <span class="badge">📅 打卡 ${doneDays}/${activeDays} 天</span>
      <span class="badge">⏱ 已投入 ${doneMin}/${totalMin} 分钟</span>
    </div>
    <div class="bar ok" style="margin-top:10px"><span style="width:${pct}%"></span></div>
    ${chs.length ? `<div class="wg-chs">本周章节 ${chs.map((c) => `<span class="badge">第${c.no}章 ${h(c.title)}</span>`).join('')}</div>` : ''}
  </div>`;

  // 把连续的空档 / 计划开始前的日子折叠成一行，避免大片空白
  const nodes = [];
  let run = [];
  const flushRun = () => {
    if (!run.length) return;
    const a = run[0], b = run[run.length - 1];
    const pre = planStart && b < planStart;
    const span = run.length === 1 ? `${WD[d2(a).getDay()]} ${a.slice(5)}` : `${a.slice(5)} ~ ${b.slice(5)}`;
    nodes.push(`<div class="wk-off${pre ? ' pre' : ''}">
      <span>${pre ? '⏳ 计划开始前' : '🌿 弹性空档'} · ${span}${run.length > 1 ? `（${run.length} 天）` : ''}${pre ? '' : ' · 可自由复习或休息'}</span>
    </div>`);
    run = [];
  };
  days.forEach((d) => {
    const items = byDate.get(d) || [];
    if (!items.length) { run.push(d); return; }
    flushRun();
    const done = items.filter((x) => state.ws1.tasksDone[x.id]).length;
    const mins = items.reduce((s, x) => s + (x.minutes || 0), 0);
    const isToday = d === todayISO();
    const allDone = done === items.length;
    nodes.push(`<div class="wk-day${isToday ? ' today' : ''}${d < todayISO() ? ' past' : ''}">
      <div class="day-head${isToday ? ' today' : ''}">
        <span class="d">${WD[d2(d).getDay()]} ${d.slice(5)}</span>
        <span class="line"></span>
        <span class="tiny muted">${done}/${items.length} · 约 ${mins} 分钟</span>
        ${allDone ? '<span class="badge ok">✓ 完成</span>' : isToday ? '<span class="badge brand">今天</span>' : ''}
      </div>
      <div class="stack">${items.map((x) => taskRow(x, true)).join('')}</div>
    </div>`);
  });
  flushRun();

  return goal + `<div class="stack wk-list">${nodes.join('')}</div>`;
}
/* ---------- 学习阶段：基础 → 强化 → 冲刺 ---------- */
function ws1Phases() {
  const cfg = state.ws1.config || {};
  if (!cfg.startDate || !cfg.endDate) return [];
  const total = diffDays(cfg.startDate, cfg.endDate);
  if (total <= 0) return [];
  const bounds = [0, 0.45, 0.92, 1];
  const defs = [
    { name: '基础期', ico: '🧱', desc: '通读考纲、建立框架：信息化与信息技术 + 项目管理十大领域' },
    { name: '强化期', ico: '⚙️', desc: '专项精练：进度/成本/风险计算题 + 绩效域、高级项目管理' },
    { name: '冲刺期', ico: '🚀', desc: '模拟卷 + 论文与案例分析专项，查漏补缺' },
  ];
  const plan = state.ws1.plan || [];
  const today = todayISO();
  const fromArr = bounds.map((b) => addDays(cfg.startDate, Math.floor(total * b)));
  return defs.map((d, i) => {
    const from = fromArr[i];
    const to = (i < defs.length - 1) ? addDays(fromArr[i + 1], -1) : addDays(cfg.startDate, total);
    const tasks = plan.filter((t) => t.date >= from && t.date <= to);
    const done = tasks.filter((t) => state.ws1.tasksDone[t.id]).length;
    const chapters = [...new Set(tasks.filter((t) => t.type === 'content').map((t) => t.chapterId))].map(chapterById).filter(Boolean);
    const minutes = tasks.reduce((s, t) => s + (t.minutes || 0), 0);
    const state_ = (today < from) ? 'future' : (today > to) ? 'past' : 'current';
    return Object.assign({}, d, { from, to, total: tasks.length, done, minutes, chapters, state: state_, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 });
  });
}
function renderPhases() {
  const phases = ws1Phases();
  if (!phases.length) return '<div class="empty tiny">设置周期后自动划分阶段。</div>';
  const cur = phases.find((p) => p.state === 'current');
  return `<div class="row" style="margin-bottom:12px">${cur ? `<span class="badge brand">当前阶段：${cur.ico} ${h(cur.name)}</span>` : '<span class="badge">未在计划周期内</span>'}
    <span class="tiny muted">按周期自动划分：基础 → 强化 → 冲刺</span></div>
    <div class="grid g3">${phases.map((p) => `
    <div class="phase-card ${p.state}">
      <div class="spread"><b>${p.ico} ${h(p.name)}</b>
        ${p.state === 'current' ? '<span class="badge brand">进行中</span>' : p.state === 'past' ? '<span class="badge ok">已结束</span>' : '<span class="badge">未开始</span>'}</div>
      <div class="tiny muted" style="margin:6px 0">${fmtMD(p.from)} – ${fmtMD(p.to)}</div>
      <div class="tiny muted">${h(p.desc)}</div>
      <div class="bar ok" style="margin:10px 0 6px"><span style="width:${p.pct}%"></span></div>
      <div class="tiny muted">${p.done}/${p.total} 任务 · 约 ${Math.round(p.minutes / 60)} 小时</div>
      <details class="phase-det"><summary>涉及章节（${p.chapters.length}）</summary>
        <div class="row" style="margin-top:8px">${p.chapters.map((c) => `<span class="badge">第${c.no}章 ${h(c.title)}</span>`).join('')}</div>
      </details>
    </div>`).join('')}</div>`;
}
function viewWS1() {
  const cfg = state.ws1.config || {};
  const s = ws1Stats();
  const t = todayISO();
  const today = ws1Day(t);
  const dayTasks = today.tasks.length ? today.tasks : nextDayTasks(t);
  const wd = cfg.weekdayMinutes || 45, we = cfg.weekendMinutes || 120;
  return `
  <div class="page-head">
    <div>
      <div class="eyebrow">工作台 1</div>
      <h1>信息系统高项</h1>
      <p>${h(CUR.subtitle || '')} · 弹性节奏：工作日约 ${wd} 分钟 / 周末约 ${we} 分钟</p>
    </div>
    <div class="actions">
      <button class="btn" data-action="ws1-open-config">⚙️ 计划设置</button>
      <button class="btn" data-action="ws1-open-drill">🎯 巩固刷题</button>
      <button class="btn primary" data-action="ws1-checkin">✅ 今日打卡</button>
    </div>
  </div>

  <div class="grid g4 section">
    <div class="stat"><div class="k">🎯 距离考试</div><div class="v">${s.examIn == null ? '—' : s.examIn}<small>${s.examIn == null ? '' : '天'}</small></div><div class="sub">${cfg.endDate ? h(cfg.endDate) : '未设置考试日期'}</div></div>
    <div class="stat"><div class="k">📈 计划完成度</div><div class="v">${s.pct}<small>%</small></div><div class="sub">${s.done} / ${s.total} 任务</div>
      <div class="bar" style="margin-top:8px"><span style="width:${s.pct}%"></span></div></div>
    <div class="stat"><div class="k">🔥 连续打卡</div><div class="v">${s.streak}<small>天</small></div><div class="sub">累计学习 ${Math.round(s.minutes/60)} 小时</div></div>
    <div class="stat"><div class="k">📅 今日任务</div><div class="v">${today.done.length}<small>/ ${today.tasks.length || dayTasks.length}</small></div><div class="sub">${today.tasks.length ? '今日安排' : '显示最近待办'}</div></div>
  </div>

  <div class="section">
    <div class="section-head">
      <h2>今日任务</h2>
      <button class="btn sm" data-action="ws1-open-quiz">🎯 去刷题（软考达人）</button>
    </div>
    <div class="stack">
      ${dayTasks.length ? dayTasks.map((x) => taskRow(x)).join('') : '<div class="empty">今天没有安排，弹性休息或自由复习。</div>'}
    </div>
  </div>

  <div class="section" id="ws1-plan">
    <div class="section-head">
      <h2>学习计划 · 一周一屏</h2>
      <div class="row">
        <button class="btn xs" data-action="ws1-week" data-dir="-1">◀ 上一周</button>
        <button class="btn xs" data-action="ws1-week" data-dir="0">本周</button>
        <button class="btn xs" data-action="ws1-week" data-dir="1">下一周 ▶</button>
      </div>
    </div>
    ${renderWeekPlan()}
  </div>

  <div class="section">
    <div class="section-head"><h2>学习阶段</h2></div>
    ${renderPhases()}
  </div>

  <div class="section">
    <div class="section-head"><h2>课程大纲</h2><span class="tiny muted">依据《信息系统项目管理师教程（第4版）》目录整理</span></div>
    <div class="stack">
      ${CUR.chapters.map(renderChapter).join('')}
    </div>
  </div>

  <div class="section">
    <div class="section-head"><h2>巩固 · 刷题与专项</h2></div>
    <div class="grid g3">${(CUR.drill || []).map(renderDrill).join('')}</div>
  </div>

  <div class="section">
    <div class="section-head"><h2>公开学习素材</h2></div>
    <div class="grid g2">${(CUR.resources || []).map(renderResCard).join('')}</div>
  </div>
  `;
}
function nextDayTasks(t) {
  const plan = state.ws1.plan || [];
  const future = plan.filter((x) => x.date > t).sort((a, b) => a.date < b.date ? -1 : 1);
  if (!future.length) return [];
  const d = future[0].date;
  const items = plan.filter((x) => x.date === d);
  return items;
}
function renderChapter(c) {
  const w = clamp(c.weight || 1, 1, 5);
  const weight = `<span class="weight" title="重要度 ${w}/5">${[1,2,3,4,5].map((i) => `<i class="${i <= w ? 'on' : ''}"></i>`).join('')}</span>`;
  return `<details class="chapter-card">
    <summary>
      <span class="no">${c.no}</span>
      <span style="flex:1"><b>${h(c.title)}</b> <span class="badge" style="margin-left:6px">${h(c.tag || '')}</span></span>
      ${weight}
      <span class="tiny muted">展开 ▾</span>
    </summary>
    <div class="cbody">
      <ul class="point-list">${c.points.map((p) => `<li>${h(p)}</li>`).join('')}</ul>
      <div class="lres" style="margin-top:12px">
        <a class="res-link" href="https://search.bilibili.com/all?keyword=${enc('信息系统项目管理师 ' + c.title)}" target="_blank" rel="noopener">📺 B站 · ${h(c.title)}</a>
        ${(c.res || []).map((r) => `<a class="res-link" href="https://search.bilibili.com/all?keyword=${enc(r)}" target="_blank" rel="noopener">🔎 ${h(r)}</a>`).join('')}
        <a class="res-link" href="https://www.bing.com/search?q=${enc('信息系统项目管理师 ' + c.title + ' 笔记')}" target="_blank" rel="noopener">📄 笔记/资料</a>
        <button class="res-link" data-action="ws1-open-quiz" style="cursor:pointer">🎯 本章刷题</button>
      </div>
    </div>
  </details>`;
}
function renderDrill(d) {
  return `<div class="card card-pad">
    <div class="spread"><h3 style="font-size:14px">${h(d.name)}</h3>
      ${d.kind === 'wechat' ? '<span class="badge ok">微信小程序</span>' : d.kind === 'video' ? '<span class="badge">视频</span>' : '<span class="badge brand">网页</span>'}</div>
    <p class="tiny muted" style="margin:8px 0 12px">${h(d.tip)}</p>
    ${d.kind === 'wechat'
      ? `<button class="btn sm primary" data-action="open-wechat" data-name="${h(d.name)}" data-search="${h(d.search)}">如何打开</button>`
      : `<a class="btn sm primary" href="${h(d.search)}" target="_blank" rel="noopener">打开 →</a>`}
  </div>`;
}
function renderResCard(r) {
  const ico = { video: '📺', official: '🏛️', portal: '🌐', quiz: '🎯' }[r.type] || '🔗';
  return `<a class="card card-pad" href="${h(r.search)}" target="_blank" rel="noopener" style="display:flex;gap:12px;align-items:center;color:inherit;text-decoration:none">
    <span style="font-size:22px">${ico}</span>
    <span><b>${h(r.name)}</b><br><span class="tiny muted">${h(r.desc)}</span></span>
  </a>`;
}

/* ---------- 计划生成（弹性节奏） ---------- */
function ws1Budget(cfg, date) {
  const wd = d2(date).getDay();
  return (wd === 0 || wd === 6) ? (cfg.weekendMinutes || 120) : (cfg.weekdayMinutes || 45);
}
function ws1DrillMin(cfg, date) { return clamp(Math.round(ws1Budget(cfg, date) * 0.25), 10, 25); }
function generatePlan(cfg) {
  const base = { 5: 420, 4: 320, 3: 230, 2: 170, 1: 120 };   // 各章总学时估计（分钟）
  const MAXP = 30;   // 单个任务最长 30 分钟，过长知识点自动拆分
  const raw = [];
  for (const c of CUR.chapters) {
    const per = Math.max(20, Math.round((base[c.weight] || 100) / Math.max(1, c.points.length)));
    for (const p of c.points) raw.push({ ch: c, point: p, minutes: per });
  }
  const items = [];
  for (const it of raw) {
    const parts = Math.max(1, Math.ceil(it.minutes / MAXP));
    const m = Math.round(it.minutes / parts);
    for (let i = 0; i < parts; i++) items.push({ ch: it.ch, point: it.point + (parts > 1 ? '（' + (i + 1) + '/' + parts + '）' : ''), minutes: m });
  }
  let days = [];
  for (let d = cfg.startDate; d <= cfg.endDate; d = addDays(d, 1)) days.push(d);
  if (!days.length) days = [cfg.startDate];

  const sprintN = days.length > 30 ? clamp(Math.round(days.length * 0.08), 5, 14) : 0;
  const tail = sprintN ? days.splice(days.length - sprintN, sprintN) : [];
  const study = days;
  const tasks = [];
  let n = 0;

  if (study.length) {
    // 按「当天容量」比例把内容铺满整个周期：工作日轻、周末重，压力自然分散
    const capOf = (d) => Math.max(20, ws1Budget(cfg, d) - ws1DrillMin(cfg, d));
    const caps = study.map(capOf);
    const totalCap = caps.reduce((a, b) => a + b, 0);
    const totalContent = items.reduce((s, i) => s + i.minutes, 0);
    const f = totalCap > 0 ? Math.min(1, totalContent / totalCap) : 1;
    let idx = 0;
    study.forEach((d, k) => {
      const cap = caps[k];
      const target = Math.max(20, cap * f);
      let used = 0;
      while (idx < items.length) {
        const it = items[idx];
        if (used > 0 && used + it.minutes > cap) break;   // 不超当天容量
        if (used > 0 && used >= target) break;            // 达到当天目标
        tasks.push({ id: 'c' + (++n), date: d, type: 'content', no: it.ch.no, chapterId: it.ch.id, chapterTitle: it.ch.title, point: it.point, minutes: it.minutes });
        used += it.minutes; idx++;
      }
    });
    if (idx < items.length) {   // 少量余量：从末尾往前每天补 1 个，避免堆在一天
      const from = Math.floor(study.length * 0.7);
      let guard = 0;
      while (idx < items.length && guard++ < 500) {
        for (let k = study.length - 1; k >= from && idx < items.length; k--) {
          const it = items[idx++];
          tasks.push({ id: 'c' + (++n), date: study[k], type: 'content', no: it.ch.no, chapterId: it.ch.id, chapterTitle: it.ch.title, point: it.point, minutes: it.minutes });
        }
      }
    }
    for (const d of study) tasks.push({ id: 'drill-' + d, date: d, type: 'drill', title: '巩固刷题 · 软考达人 / 每日一练', minutes: ws1DrillMin(cfg, d) });
  }
  tail.forEach((d, i) => tasks.push({ id: 'mock-' + d, date: d, type: 'mock', title: i === tail.length - 1 ? '考前冲刺 · 论文与案例分析专项' : '考前冲刺 · 模拟卷 第' + (i + 1) + ' 套', minutes: ws1Budget(cfg, d) }));
  tasks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  return tasks;
}
function openWs1Config() {
  const cfg = state.ws1.config || {};
  const defStart = cfg.startDate || todayISO();
  const defEnd = cfg.endDate || addMonths(defStart, 6);
  openModal(`
    <h3>📘 信息系统高项 · 计划设置</h3>
    <div class="modal-sub">内容按周期弹性铺开：工作日轻、周末重，整体压力更均匀</div>
    <div class="grid g2">
      <div class="field"><label>开始日期</label><input type="date" id="c-start" value="${defStart}"></div>
      <div class="field"><label>目标日期（建议考试日）</label><input type="date" id="c-end" value="${defEnd}"></div>
      <div class="field"><label>工作日时长（分钟）</label><input type="number" id="c-wd" min="20" max="240" step="5" value="${cfg.weekdayMinutes || 45}"><span class="hint">默认 45 分钟</span></div>
      <div class="field"><label>周末时长（分钟）</label><input type="number" id="c-we" min="30" max="480" step="15" value="${cfg.weekendMinutes || 120}"><span class="hint">默认 120 分钟（约 2 小时）</span></div>
    </div>
    <div class="field"><label>快速周期</label>
      <div class="row">
        <button class="pill" data-action="set-period" data-days="60">2 个月</button>
        <button class="pill" data-action="set-period" data-days="120">4 个月</button>
        <button class="pill" data-action="set-period" data-days="180">6 个月</button>
        <button class="pill" data-action="set-period" data-days="240">8 个月</button>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" data-action="close-modal">取消</button>
      <button class="btn primary" data-action="ws1-gen">生成学习计划</button>
    </div>`);
}
function openWechat(name, search) {
  openModal(`
    <h3>🎯 打开「${h(name)}」</h3>
    <div class="modal-sub">微信小程序无法从浏览器直接跳转，请按以下步骤：</div>
    <ol style="font-size:13.5px;line-height:2;padding-left:18px">
      <li>打开微信 → 顶部搜索框输入「<b>${h(name)}</b>」</li>
      <li>进入小程序 → 选择题库「<b>信息系统项目管理师</b>」</li>
      <li>开始「每日一练 / 章节练习」，错题自动归集</li>
    </ol>
    <p class="tiny muted">也可以在浏览器里搜索该小程序的入口页。</p>
    <div class="modal-actions">
      <button class="btn" data-action="copy" data-text="${h(name)}">复制名称</button>
      <a class="btn" href="${h(search)}" target="_blank" rel="noopener">浏览器搜索</a>
      <button class="btn primary" data-action="close-modal">知道了</button>
    </div>`);
}
function openQuiz() {
  openModal(`
    <h3>🎯 巩固刷题</h3>
    <div class="modal-sub">选一个入口开始今天的刷题巩固</div>
    <div class="stack">
      ${(CUR.drill || []).map((d) => `<div class="spread card card-pad" style="padding:12px">
        <div><b>${h(d.name)}</b><div class="tiny muted">${h(d.tip)}</div></div>
        ${d.kind === 'wechat'
          ? `<button class="btn sm primary" data-action="open-wechat" data-name="${h(d.name)}" data-search="${h(d.search)}">打开</button>`
          : `<a class="btn sm primary" href="${h(d.search)}" target="_blank" rel="noopener">打开</a>`}
      </div>`).join('')}
    </div>
    <div class="modal-actions"><button class="btn primary" data-action="close-modal">关闭</button></div>`);
}
function openWs1Checkin(date) {
  const d = date || todayISO();
  const sum = ws1Day(d);
  const totalMin = sum.done.reduce((s, t) => s + (t.minutes || 0), 0);
  const existing = (state.ws1.checkins || {})[d] || {};
  openModal(`
    <h3>✅ 学习打卡</h3>
    <div class="modal-sub">${fmtLong(d)} · 已完成 ${sum.done.length}/${sum.tasks.length} 个任务</div>
    <div class="field"><label>今日学习时长（分钟）</label><input type="number" id="ci-min" min="0" step="5" value="${totalMin || existing.minutes || state.profile.dailyMinutes || 120}"></div>
    <div class="field"><label>今日学习内容 / 心得</label><textarea id="ci-note" placeholder="例如：完成第9章WBS，错题3道已整理…">${h(existing.note || '')}</textarea></div>
    <div class="modal-actions">
      <button class="btn ghost" data-action="close-modal">取消</button>
      <button class="btn primary" data-action="ws1-do-checkin" data-date="${d}">确认打卡</button>
    </div>`);
}
function doWs1Checkin(date) {
  const mins = Number((document.getElementById('ci-min') || {}).value || 0);
  const note = (document.getElementById('ci-note') || {}).value || '';
  const sum = ws1Day(date);
  state.ws1.checkins = state.ws1.checkins || {};
  state.ws1.checkins[date] = { minutes: mins, done: sum.done.length, total: sum.tasks.length, note, at: Date.now() };
  save(); closeModal(); render(); toast('打卡成功 ✓ 连续 ' + ws1Stats().streak + ' 天');
}

/* =====================================================================
   工作台2 · AIIA 资讯
   ===================================================================== */
const AI_KB = {
  '大模型': {
    points: ['Transformer 是当代大模型的底座架构', '训练范式：预训练 → 指令微调 → 人类对齐', '推理成本与参数量、上下文长度、并发强相关'],
    questions: ['它解决的是"能力"问题还是"成本"问题？', '如果把这条技术用到你的行业，最先落地哪个场景？'],
  },
  'AIGC与创作': {
    points: ['生成式 AI 正从文本扩展到图像/音视频/3D', '版权与"人类创作贡献"是当前争议焦点', '人机协作的"提示—迭代"工作流正在标准化'],
    questions: ['生成内容的版权该归谁？', '这项能力会替代还是增强现有岗位？'],
  },
  '智能体Agent': {
    points: ['Agent = 大模型 + 规划 + 工具调用 + 记忆', '多智能体协作与"工作流编排"是落地重点', '可靠性、可控性是 Agent 商业化的关键门槛'],
    questions: ['它的自主边界在哪里？出错谁负责？', '相比传统 RPA/脚本，它强在哪一环？'],
  },
  '算力与芯片': {
    points: ['算力 = 芯片 × 集群 × 能耗 × 网络', '制程、显存带宽、互联是性能关键', '算力成本直接决定大模型的商业可行性'],
    questions: ['这条新闻里，瓶颈是算力还是电力？', '国产替代走到了哪一步？'],
  },
  '多模态': {
    points: ['多模态让模型同时理解文本/图像/语音/视频', '统一表征与跨模态对齐是核心技术难点', '多模态是"具身智能"的前提'],
    questions: ['多模态相比单模态，多解决了什么问题？', '数据从哪里来、如何标注？'],
  },
  '具身智能与机器人': {
    points: ['具身智能 = 感知 + 决策 + 执行 的闭环', '仿真到现实（Sim2Real）是主要挑战', '硬件成本与数据采集是规模化的关键'],
    questions: ['它离大规模商用还差什么？', '安全冗余如何设计？'],
  },
  'AI编程': {
    points: ['代码补全 → 对话式编程 → 自主编码 Agent', '评测基准常用 SWE-bench 等', '它改变的是"编码"还是"软件工程"？'],
    questions: ['AI 写的代码，谁来 review 和负责？', '对初级开发者的影响是什么？'],
  },
  '数据与合规': {
    points: ['数据是 AI 的"燃料"，质量 > 数量', '合规三件套：数据安全法、个保法、算法备案', '隐私计算在解决"数据可用不可见"'],
    questions: ['这条消息触碰了哪条监管红线？', '企业该如何设计数据合规流程？'],
  },
  '商业化与融资': {
    points: ['看商业模式：卖算力 / 卖模型 / 卖应用 / 卖服务', '关注毛利率、续费率、ARPU 等指标', 'AI 应用的护城河常来自数据与工作流'],
    questions: ['它的钱从哪里赚？成本结构如何？', '这门生意的护城河在哪？'],
  },
  '自动驾驶': {
    points: ['技术路线：纯视觉 vs 多传感器融合', '端到端大模型正成为新范式', 'L3 的关键是责任划分与法规'],
    questions: ['事故责任如何界定？', '端到端相比模块化，优势与风险？'],
  },
  '开源生态': {
    points: ['开源模型降低了应用门槛', '许可协议（商业可用性）需重点看', '社区活跃度决定生态寿命'],
    questions: ['这个开源项目的商业化路径是什么？', '许可协议对商用有何限制？'],
  },
  '安全与对齐': {
    points: ['对齐 = 让模型行为符合人类价值', '常见方法：RLHF、宪法 AI、红队测试', '安全与能力的权衡是长期议题'],
    questions: ['攻击面在哪里？如何防护？', '监管与创新如何平衡？'],
  },
};
const KW = [
  [/大模型|语言模型|LLM|\bGPT\b|Transformer|预训练|微调|推理/i, '大模型'],
  [/AIGC|生成式|文生图|文生视频|绘画|图像生成|音乐生成/i, 'AIGC与创作'],
  [/智能体|Agent|多智能体|智能助理|工作流/i, '智能体Agent'],
  [/算力|芯片|GPU|英伟达|NVIDIA|H100|国产芯片|数据中心|半导体/i, '算力与芯片'],
  [/多模态|视觉|语音|跨模态/i, '多模态'],
  [/具身|机器人|人形机器人|机械臂/i, '具身智能与机器人'],
  [/编程|代码|Copilot|IDE|软件开发/i, 'AI编程'],
  [/数据|合规|监管|隐私|安全法|个人信息|备案|立法/i, '数据与合规'],
  [/融资|估值|营收|商业化|上市|收购|IPO|盈利/i, '商业化与融资'],
  [/自动驾驶|智驾|无人驾驶|激光雷达|Robotaxi/i, '自动驾驶'],
  [/开源|GitHub|Llama|社区/i, '开源生态'],
  [/对齐|安全|越狱|红队|AI风险/i, '安全与对齐'],
];
/* ---------- 求职方向（AI 应用岗）---------- */
const AIIA_TRACKS = [
  {
    id: 'llmapp', group: '大模型应用', name: 'LLM 应用开发工程师', ico: '🧩', heat: '需求增长最快',
    desc: '基于大模型做产品：RAG 检索增强、Function Calling、工作流编排。',
    skills: ['RAG 检索增强', 'Function Calling', '向量数据库', 'LangChain 生态', '工作流编排', '上下文工程'],
    kw: /\bRAG\b|检索增强|向量数据库|知识库|大模型|LLM|语言模型|函数调用|工具调用|工作流|编排|LangChain|LlamaIndex|应用开发|上下文工程|提示工程|提示词|Prompt|微调|fine-?tun|\bGPT\b|生成式|AIGC|模型部署|推理服务|API 调用|多模态/i,
    res: [
      { n: '📺 B站 · RAG 实战', u: 'https://search.bilibili.com/all?keyword=' + enc('RAG 检索增强生成 实战') },
      { n: '📺 B站 · LangChain 教程', u: 'https://search.bilibili.com/all?keyword=' + enc('LangChain 大模型应用 教程') },
      { n: '▶️ YouTube · RAG from Scratch', u: 'https://www.youtube.com/results?search_query=RAG+from+scratch+langchain' },
      { n: '📖 LangChain 官方文档', u: 'https://python.langchain.com/docs/introduction/' },
    ],
  },
  {
    id: 'agent', group: '大模型应用', name: 'AI Agent 开发工程师', ico: '🤖', heat: '招聘量猛增',
    desc: '多智能体系统、工具调用、规划与记忆机制。',
    skills: ['多智能体协作', '工具调用 / MCP', '规划 Planning', '记忆 Memory', '工作流引擎', '评估与可靠性'],
    kw: /Agent|智能体|智能代理|代理|多智能体|multi-?agent|工具调用|\bMCP\b|编排|自主执行|AutoGPT|LangGraph|CrewAI|ReAct|规划与记忆|autonomous|机器人|具身/i,
    res: [
      { n: '📺 B站 · Agent 开发实战', u: 'https://search.bilibili.com/all?keyword=' + enc('AI Agent 开发 实战') },
      { n: '▶️ YouTube · Build AI Agents', u: 'https://www.youtube.com/results?search_query=build+AI+agent+langgraph' },
      { n: '📖 MCP 协议文档', u: 'https://modelcontextprotocol.io/' },
      { n: '📖 LangGraph 文档', u: 'https://langchain-ai.github.io/langgraph/' },
    ],
  },
  {
    id: 'pm', group: '数据与运营', name: 'AI 产品经理', ico: '🧭', heat: '非常抢手',
    desc: '懂模型能力边界 + 懂业务场景，是当前最缺的复合岗位之一。',
    skills: ['模型能力边界', '场景挖掘', '需求与优先级', '指标与验证', '跨团队协作'],
    kw: /AI 产品|产品经理|产品设计|用户体验|需求分析|用户调研|商业化|\bPMF\b|\bROI\b|产品运营|product manager|pricing|monetiz|user growth|上线|产品发布/i,
    res: [
      { n: '📺 B站 · AI 产品经理', u: 'https://search.bilibili.com/all?keyword=' + enc('AI 产品经理') },
      { n: '📖 人人都是产品经理', u: 'https://www.woshipm.com/' },
      { n: '📖 Lenny 的产品通讯', u: 'https://www.lennysnewsletter.com/' },
    ],
  },
  {
    id: 'arch', group: '数据与运营', name: 'AI 解决方案架构师', ico: '🏗️', heat: 'To B 售前',
    desc: '帮客户设计 AI 落地方案，偏 To B 售前 + 架构。',
    skills: ['行业方案设计', '架构与集成', '私有化部署', '成本与选型', '客户沟通'],
    kw: /解决方案|架构师|To ?B|售前|企业级|私有化部署|行业大模型|中台|落地实践|选型|solution architect|enterprise ai|on-?prem|系统集成|平台化/i,
    res: [
      { n: '📺 B站 · 大模型解决方案', u: 'https://search.bilibili.com/all?keyword=' + enc('大模型 解决方案 架构') },
      { n: '📖 阿里云百炼 · 实践文档', u: 'https://help.aliyun.com/zh/model-studio/' },
      { n: '📖 AWS · 生成式 AI 架构白皮书', u: 'https://docs.aws.amazon.com/whitepapers/latest/generative-ai-on-aws/' },
    ],
  },
];
function trackById(id) { return AIIA_TRACKS.find((t) => t.id === id); }
function enabledTracks() { return state.ws2.tracks || AIIA_TRACKS.map((t) => t.id); }
function matchTracks(item) {
  const text = (item.title || '') + ' ' + (item.summary || '');
  return AIIA_TRACKS.filter((t) => t.kw.test(text)).map((t) => t.id);
}
function detectCats(text) {
  const cats = [];
  for (const [re, cat] of KW) if (re.test(text) && !cats.includes(cat)) cats.push(cat);
  return cats;
}
function extractTerms(text) {
  const terms = new Set();
  for (const [re, cat] of KW) { const m = text.match(re); if (m) terms.add(m[0]); }
  return [...terms].slice(0, 6);
}
function makeCard(item) {
  const text = (item.title || '') + ' ' + (item.summary || '');
  let cats = detectCats(text);
  if (!cats.length) cats = ['大模型'];
  const primary = cats[0];
  const kb = AI_KB[primary] || AI_KB['大模型'];
  const points = [];
  for (const c of cats.slice(0, 2)) { const k = AI_KB[c]; if (k) points.push(...k.points); }
  const questions = [...kb.questions];
  const terms = extractTerms(text);
  const keyTerm = terms[0] || primary;
  const links = [
    { label: '📺 B站', url: 'https://search.bilibili.com/all?keyword=' + enc(keyTerm) },
    { label: '▶️ YouTube', url: 'https://www.youtube.com/results?search_query=' + enc(keyTerm) },
    { label: '📖 知乎', url: 'https://www.zhihu.com/search?type=content&q=' + enc(keyTerm) },
  ];
  return {
    id: uid('card'),
    title: '学习卡片 · ' + keyTerm,
    category: primary,
    from: { title: item.title, link: item.link, source: item.source },
    background: item.summary || item.title,
    points: [...new Set(points)].slice(0, 4),
    questions: questions.slice(0, 2),
    tags: [...new Set([primary, ...cats.slice(1, 3), ...terms])].slice(0, 6),
    links,
    at: Date.now(),
  };
}
let NEWS = { items: [], fetchedAt: 0, errors: [], perSource: {}, loaded: false, loading: false };
async function ensureNews(force) {
  if (NEWS.loading) return;
  if (!force && NEWS.loaded && Date.now() - NEWS.fetchedAt < 5 * 60 * 1000) return;
  NEWS.loading = true;
  if (rendered.route === '#/ws2' && !NEWS.loaded) mainEl.innerHTML = newsSkeleton();
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 90000);
    const r = await fetch('/api/news' + (force ? '?refresh=1' : ''), { signal: ac.signal }).finally(() => clearTimeout(timer));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    NEWS.items = j.items || []; NEWS.errors = j.errors || []; NEWS.perSource = j.perSource || {}; NEWS.fetchedAt = j.fetchedAt || Date.now(); NEWS.loaded = true;
  } catch (e) {
    NEWS.loaded = true; NEWS.items = NEWS.items || []; NEWS.error = String(e.message || e);
  } finally {
    NEWS.loading = false;
    if (rendered.route === '#/ws2') { mainEl.innerHTML = viewWS2(); }
  }
}
function newsSkeleton() {
  return `<div class="page-head"><div><div class="eyebrow">工作台 2</div><h1>AIIA 资讯</h1><p>正在抓取最新资讯…</p></div></div>
    <div class="empty"><span class="big">📡</span>正在从各资讯源抓取（约需 5–20 秒）…</div>`;
}
function newsFiltered() {
  const f = state.ws2._filter || 'week';
  const now = Date.now();
  let items = NEWS.items.slice();
  if (f === 'week') items = items.filter((i) => now - i.ts <= 7 * 86400000);
  else if (f === 'month') items = items.filter((i) => now - i.ts <= 31 * 86400000);
  else if (f === 'focus') {
    const on = enabledTracks();
    items = items.filter((i) => matchTracks(i).some((id) => on.includes(id)));
  } else if (f === 'saved') return [];
  return items;
}
function focusCount() {
  const on = enabledTracks();
  return NEWS.items.filter((i) => matchTracks(i).some((id) => on.includes(id))).length;
}
function newsItemRow(it) {
  const read = !!state.ws2.read[it.id];
  const on = enabledTracks();
  const tags = matchTracks(it).filter((id) => on.includes(id)).slice(0, 2)
    .map((id) => trackById(id)).filter(Boolean)
    .map((t) => `<span class="badge brand">${t.ico} ${h(t.name)}</span>`).join('');
  return `<div class="news-item">
    <h4><a href="${h(it.link)}" target="_blank" rel="noopener">${h(it.title)}</a></h4>
    <div class="nmeta">
      ${tags}
      <span class="badge violet">${h(it.group || '资讯')}</span>
      <span class="badge">${h(it.source)}</span>
      <span>🕒 ${relTime(it.ts)}</span>
      ${read ? '<span class="badge ok">已读</span>' : ''}
    </div>
    ${it.summary ? `<div class="nsum">${h(it.summary)}</div>` : ''}
    <div class="nact">
      <a class="btn xs" href="${h(it.link)}" target="_blank" rel="noopener">查看全文 ↗</a>
      <button class="btn xs" data-action="news-card" data-id="${h(it.id)}">✨ 生成学习卡片</button>
      <button class="btn xs ${read ? '' : 'primary'}" data-action="news-read" data-id="${h(it.id)}">${read ? '标记未读' : '标记已读'}</button>
      <button class="btn xs" data-action="news-copy" data-id="${h(it.id)}">🔗 复制链接</button>
    </div>
  </div>`;
}
function cardBlock(c) {
  return `<div class="mcard">
    <div class="spread">
      <b>${h(c.title)}</b>
      <div class="row">
        ${c.from && c.from.link ? `<a class="btn xs" href="${h(c.from.link)}" target="_blank" rel="noopener">来源 ↗</a>` : ''}
        <button class="btn xs danger" data-action="card-del" data-id="${h(c.id)}">删除</button>
      </div>
    </div>
    ${c.background ? `<div class="q">📌 ${h(c.background).slice(0, 200)}</div>` : ''}
    ${c.points && c.points.length ? `<ul class="point-list" style="margin-top:10px">${c.points.map((p) => `<li>${h(p)}</li>`).join('')}</ul>` : ''}
    ${c.questions && c.questions.length ? `<div style="margin-top:10px">${c.questions.map((q) => `<div class="q">💭 ${h(q)}</div>`).join('')}</div>` : ''}
    <div class="kw">${(c.tags || []).map((t) => `<span>#${h(t)}</span>`).join('')}</div>
    ${c.links && c.links.length ? `<div class="lres" style="margin-top:10px">${c.links.map((l) => `<a class="res-link" href="${h(l.url)}" target="_blank" rel="noopener">${h(l.label)}</a>`).join('')}</div>` : ''}
  </div>`;
}
function viewWS2() {
  const f = state.ws2._filter || 'week';
  const cards = state.ws2.cards || [];
  const list = newsFiltered();
  const on = enabledTracks();
  const counts = {
    focus: focusCount(),
    week: NEWS.items.filter((i) => Date.now() - i.ts <= 7 * 86400000).length,
    month: NEWS.items.filter((i) => Date.now() - i.ts <= 31 * 86400000).length,
    all: NEWS.items.length,
    saved: (state.ws2.saved || []).length,
  };
  const savedList = state.ws2.saved || [];
  return `
  <div class="page-head">
    <div><div class="eyebrow">工作台 2</div><h1>AIIA · AI 应用求职雷达</h1>
      <p>面向 AI 应用岗 · 按方向筛选资讯 · 自动延伸学习卡片</p></div>
    <div class="actions">
      <button class="btn" data-action="news-sources">📚 资讯源</button>
      <button class="btn primary" data-action="news-refresh" ${NEWS.loading ? 'disabled' : ''}>${NEWS.loading ? '抓取中…' : '🔄 刷新资讯'}</button>
    </div>
  </div>

  <div class="grid g4 section">
    <div class="stat"><div class="k">🎯 我的方向</div><div class="v">${counts.focus}<small>条</small></div><div class="sub">${on.length}/${AIIA_TRACKS.length} 个方向已关注</div></div>
    <div class="stat"><div class="k">📰 一周内</div><div class="v">${counts.week}<small>条</small></div><div class="sub">最新动态</div></div>
    <div class="stat"><div class="k">✨ 学习卡片</div><div class="v">${cards.length}<small>张</small></div><div class="sub">由资讯延伸</div></div>
    <div class="stat"><div class="k">📚 已收藏</div><div class="v">${counts.saved}<small>条</small></div><div class="sub">${NEWS.fetchedAt ? '更新于 ' + relTime(NEWS.fetchedAt) : '尚未抓取'}</div></div>
  </div>

  ${NEWS.error ? `<div class="card card-pad" style="border-color:#f6c9c6;background:var(--danger-soft)">
    <div class="spread"><span>⚠️ 抓取失败：${h(NEWS.error)}（网络或资讯源暂时不可用）</span>
    <button class="btn sm primary" data-action="news-refresh">重试</button></div></div>` : ''}
  ${NEWS.errors && NEWS.errors.length ? `<div class="card card-pad tiny muted">部分源不可达：${NEWS.errors.map((e) => h(e.name)).join('、')}（通常是网络或该站点 RSS 关闭，可忽略）</div>` : ''}

  <div class="section">
    <div class="section-head">
      <h2>🎯 求职方向</h2>
      <div class="row">
        <span class="tiny muted">点击切换 · 会打在资讯上作为标签</span>
        <button class="btn xs" data-action="track-all">全选</button>
        <button class="btn xs" data-action="track-none">清空</button>
      </div>
    </div>
    <div class="row">
      ${AIIA_TRACKS.map((t) => `<button class="pill ${on.includes(t.id) ? 'active' : ''}" data-action="track-toggle" data-id="${t.id}" title="${h(t.desc)}">${t.ico} ${h(t.name)}</button>`).join('')}
      <span class="tiny muted">已关注 ${on.length}/${AIIA_TRACKS.length} · 命中 ${counts.focus} 条</span>
    </div>
  </div>

  <div class="section">
    <div class="section-head">
      <div class="seg">
        ${[['focus', '🎯 我的方向'], ['week', '近一周'], ['month', '近一月'], ['all', '全部'], ['saved', '收藏']].map(([v, l]) => `<button data-action="news-filter" data-filter="${v}" class="${f === v ? 'active' : ''}">${l} (${counts[v]})</button>`).join('')}
      </div>
      <button class="btn sm" data-action="news-bulk-card">✨ 从当前列表批量生成卡片</button>
    </div>
    ${f === 'saved' ? renderSaved(savedList) : (list.length
      ? `<div class="grid g2">${list.slice(0, 60).map(newsItemRow).join('')}</div>
         ${list.length > 60 ? `<div class="tiny muted" style="margin-top:10px">仅显示前 60 条，共 ${list.length} 条。</div>` : ''}`
      : (NEWS.items.length === 0
        ? `<div class="empty"><span class="big">📭</span>暂无资讯。点右上角「🔄 刷新资讯」抓取。</div>`
        : f === 'focus'
          ? `<div class="empty"><span class="big">🔍</span>当前关注的方向暂无命中资讯，可多选方向或切到「近一周」。</div>`
          : `<div class="empty"><span class="big">📭</span>该筛选下暂无资讯。</div>`))}
  </div>

  <div class="section">
    <div class="section-head"><h2>✨ 学习卡片</h2>
      ${cards.length ? '<button class="btn sm danger" data-action="cards-clear">清空卡片</button>' : ''}</div>
    ${cards.length
      ? `<div class="grid g2">${cards.map(cardBlock).join('')}</div>`
      : `<div class="empty"><span class="big">🃏</span>还没有卡片。点击任意资讯的「生成学习卡片」，或使用批量生成。</div>`}
  </div>

  <div class="section">
    <div class="section-head"><h2>📚 方向学习入口</h2><span class="tiny muted">只显示已关注的方向</span></div>
    ${on.length === 0
      ? '<div class="empty tiny">还没有关注任何方向，先在上面选一个。</div>'
      : `<div class="stack">${AIIA_TRACKS.filter((t) => on.includes(t.id)).map((t) => `
      <div class="entry-row">
        <span class="entry-name">${t.ico} ${h(t.name)}</span>
        ${t.res.map((r) => `<a class="res-link" href="${r.u}" target="_blank" rel="noopener">${h(r.n)}</a>`).join('')}
      </div>`).join('')}</div>`}
  </div>
  `;
}
function renderSaved(list) {
  if (!list.length) return `<div class="empty"><span class="big">⭐</span>还没有收藏。点击资讯的「收藏」保存到此处。</div>`;
  return `<div class="grid g2">${list.map((s) => `<div class="news-item">
    <h4><a href="${h(s.link)}" target="_blank" rel="noopener">${h(s.title)}</a></h4>
    <div class="nmeta"><span class="badge violet">${h(s.group || '资讯')}</span><span class="badge">${h(s.source)}</span><span>🕒 ${relTime(s.ts)}</span></div>
    <div class="nact"><a class="btn xs" href="${h(s.link)}" target="_blank" rel="noopener">查看全文 ↗</a>
      <button class="btn xs danger" data-action="news-unsave" data-id="${h(s.id)}">取消收藏</button></div>
  </div>`).join('')}</div>`;
}
function openSources() {
  const src = state.ws2.sources || [];
  openModal(`
    <h3>📚 资讯源管理</h3>
    <div class="modal-sub">启用 / 停用资讯源；右侧显示最近一次抓取到的条数，「0 条 / 抓取失败」的建议停用或删除</div>
    <div class="scroll-y stack" style="max-height:300px">
      ${src.map((s, i) => {
        const n = NEWS.perSource ? NEWS.perSource[s.id] : undefined;
        const err = (NEWS.errors || []).find((e) => e.id === s.id);
        const badge = err ? '<span class="badge danger">抓取失败</span>'
          : (n === undefined ? '' : (n > 0 ? `<span class="badge ok">${n} 条</span>` : '<span class="badge warn">0 条</span>'));
        return `<div class="spread card card-pad" style="padding:10px 12px">
        <label class="checkbox" style="flex:1;align-items:flex-start">
          <input type="checkbox" data-action="src-toggle" data-i="${i}" ${s.enabled !== false ? 'checked' : ''}>
          <span><b>${h(s.name)}</b> <span class="badge" style="margin-left:4px">${h(s.group || '')}</span> ${badge}<br><span class="tiny muted">${h(s.url)}</span></span>
        </label>
        <button class="btn xs danger" data-action="src-del" data-i="${i}">删除</button>
      </div>`;
      }).join('') || '<div class="empty">暂无资讯源</div>'}
    </div>
    <hr class="hr">
    <div class="grid g2">
      <div class="field"><label>名称</label><input type="text" id="src-name" placeholder="例如：某某博客"></div>
      <div class="field"><label>分组</label><input type="text" id="src-group" placeholder="AI / 商业 / 评论"></div>
    </div>
    <div class="field"><label>RSS / Atom 地址</label><input type="url" id="src-url" placeholder="https://example.com/feed"></div>
    <div class="row">
      <button class="btn" data-action="src-add">➕ 添加</button>
      <button class="btn ghost" data-action="src-reset">恢复默认源</button>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" data-action="close-modal">关闭</button>
      <button class="btn primary" data-action="news-refresh">保存并刷新</button>
    </div>`);
}

/* =====================================================================
   工作台3 · 健康猿  —— 弱记录 · 强计划
   ===================================================================== */
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WD_NAME = { 0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六' };
const GOALS = ['减脂塑形', '塑形增肌', '保持体能'];
const REPS = { '减脂塑形': '12-15 次 × 3 组（下放 3 秒）', '塑形增肌': '10-12 次 × 3 组（下放 3 秒）', '保持体能': '10-12 次 × 3 组（下放 2 秒）' };

// 居家动作库：瑜伽垫 / 瑜伽球 / 瑜伽砖 / 哑铃（4–6kg）/ 弹力带 / 泡沫轴。全程低冲击，不安排任何跳类（跳绳不适合室内）
// kind: s=力量 c=核心（秒/次） d=低冲击有氧 r=放松拉伸
const EXLIB = {
  // ---- 热身（每次训练前必做）----
  warmup:       { muscle: '热身',   kind: 'r', name: '热身 3-5 分钟', how: '肩/髋/膝绕环各 10 次 + 原地快走或踏步 2 分钟' },
  // ---- 下肢 / 臀（大肌群，耗能高，塑形重点）----
  squat_box:    { muscle: '腿/臀',  kind: 's', name: '瑜伽球靠墙深蹲', how: '球垫背靠墙，蹲到大腿接近平行，膝对脚尖' },
  squat_sumo:   { muscle: '臀/内侧', kind: 's', name: '相扑深蹲', how: '脚略宽于肩、脚尖外展，臀部主导下蹲' },
  squat_wall:   { muscle: '腿',     kind: 'c', name: '靠墙静蹲', how: '背贴墙大腿平行，保持 30-45 秒' },
  lunge_back:   { muscle: '腿/臀',  kind: 's', name: '后撤弓步', how: '向后撤步下蹲，低冲击、不跳' },
  lunge_side:   { muscle: '臀中肌', kind: 's', name: '侧弓步', how: '向侧方屈膝下压，另一腿伸直' },
  glute_bridge: { muscle: '臀',     kind: 's', name: '臀桥', how: '脚跟发力顶髋，顶点停 2 秒' },
  glute_ball:   { muscle: '臀/腿后', kind: 's', name: '瑜伽球腿弯举', how: '俯卧脚踝压球，向臀部方向回收' },
  band_walk:    { muscle: '臀中肌', kind: 's', name: '弹力带侧走', how: '弹力带套膝上，半蹲横向走 10 步' },
  calf:         { muscle: '小腿',   kind: 's', name: '站姿提踵', how: '慢起慢落，顶点停 1 秒' },
  // ---- 上肢（哑铃 / 弹力带 / 自重）----
  db_press:     { muscle: '胸',     kind: 's', name: '哑铃卧推（垫上）', how: '屈膝仰卧，肘略低于肩，轻重量慢推' },
  db_fly:       { muscle: '胸',     kind: 's', name: '哑铃飞鸟', how: '小重量，肘微屈，感受胸部拉伸' },
  db_shoulder:  { muscle: '肩',     kind: 's', name: '哑铃肩推', how: '坐姿核心收紧，推起不锁死' },
  db_lateral:   { muscle: '肩',     kind: 's', name: '哑铃侧平举', how: '重量偏轻时放慢节奏、别耸肩' },
  db_row:       { muscle: '背',     kind: 's', name: '哑铃单臂划船', how: '手撑椅/垫，肘贴身后拉' },
  db_curl:      { muscle: '二头',   kind: 's', name: '哑铃弯举', how: '不甩动，顶峰收缩 1 秒' },
  db_tri:       { muscle: '三头',   kind: 's', name: '哑铃颈后臂屈伸', how: '肘夹紧不外张，慢放' },
  pu_incline:   { muscle: '胸/三头', kind: 's', name: '上斜俯卧撑', how: '手撑沙发/桌边，对关节更友好' },
  pu_knee:      { muscle: '胸/三头', kind: 's', name: '跪姿俯卧撑', how: '跪姿降负荷，身体成一条线' },
  band_row:     { muscle: '背',     kind: 's', name: '弹力带划船', how: '肩胛后夹，别耸肩' },
  band_pull:    { muscle: '背',     kind: 's', name: '弹力带下拉', how: '跪姿拉向锁骨，肘向下' },
  band_face:    { muscle: '后束',   kind: 's', name: '弹力带面拉', how: '拉向面部，肘高于腕' },
  // ---- 核心 ----
  plank:        { muscle: '核心',   kind: 'c', name: '平板支撑', how: '20-40 秒，腰别塌、臀别翘' },
  plank_side:   { muscle: '侧腹',   kind: 'c', name: '侧平板', how: '可跪姿，髋部不下沉' },
  dead_bug:     { muscle: '核心',   kind: 'c', name: '死虫式', how: '腰贴垫，对侧手脚缓慢伸出' },
  bird_dog:     { muscle: '核心/背', kind: 'c', name: '鸟狗式', how: '四点跪姿，对侧手脚伸展停 2 秒' },
  ball_roll:    { muscle: '腹',     kind: 'c', name: '瑜伽球卷腹', how: '腰贴球面，小幅度卷起' },
  russian:      { muscle: '侧腹',   kind: 'c', name: '俄罗斯转体', how: '徒手或持哑铃，控制幅度' },
  // ---- 久坐 / 碎片（站着或坐着就能做）----
  neck:         { muscle: '肩颈',   kind: 'r', name: '肩颈绕环', how: '耸肩 → 前后绕环各 10 次，动作放慢' },
  hip:          { muscle: '髋',     kind: 'r', name: '站姿提膝 / 髋绕环', how: '扶墙，左右各 10 次' },
  breath:       { muscle: '呼吸',   kind: 'r', name: '箱式呼吸', how: '吸 4 秒 - 停 4 秒 - 呼 4 秒 - 停 4 秒，做 5 轮' },
  // ---- 低冲击有氧 & 放松（一律不跳）----
  cardio_walk:  { muscle: '有氧',   kind: 'd', name: '原地快走 / 踏步', how: '30-40 分钟，微喘但能说话' },
  cardio_low:   { muscle: '有氧',   kind: 'd', name: '低冲击有氧组合', how: '踏步 + 侧点地 + 抬膝，双脚不跳' },
  ball_bounce:  { muscle: '有氧',   kind: 'd', name: '瑜伽球坐姿弹动', how: '坐球轻弹 20-30 秒，激活核心' },
  foam_roll:    { muscle: '恢复',   kind: 'r', name: '泡沫轴放松', how: '大腿 / 臀 / 背，每处滚 1 分钟' },
  stretch:      { muscle: '拉伸',   kind: 'r', name: '瑜伽垫拉伸', how: '下肢 + 肩背，各 30 秒' },
};
// 动作库分组（用于折叠展示）
const EX_GROUPS = [
  { name: '下肢 / 臀（重点）', keys: ['squat_box', 'squat_sumo', 'squat_wall', 'lunge_back', 'lunge_side', 'glute_bridge', 'glute_ball', 'band_walk', 'calf'] },
  { name: '上肢（哑铃 / 弹力带）', keys: ['db_press', 'db_fly', 'db_shoulder', 'db_lateral', 'db_row', 'db_curl', 'db_tri', 'pu_incline', 'pu_knee', 'band_row', 'band_pull', 'band_face'] },
  { name: '核心', keys: ['plank', 'plank_side', 'dead_bug', 'bird_dog', 'ball_roll', 'russian'] },
  { name: '有氧 · 热身 · 放松', keys: ['warmup', 'cardio_walk', 'cardio_low', 'ball_bounce', 'foam_roll', 'stretch', 'neck', 'hip', 'breath'] },
];
const SPLITS = {
  lower_glute: { title: '下肢臀塑形', keys: ['warmup', 'squat_sumo', 'glute_bridge', 'lunge_back', 'band_walk', 'glute_ball', 'calf', 'stretch'] },
  upper_back:  { title: '上肢背 + 核心', keys: ['warmup', 'band_row', 'band_pull', 'db_press', 'db_shoulder', 'plank', 'dead_bug', 'stretch'] },
  cardio_core: { title: '低冲击有氧 + 核心', keys: ['warmup', 'cardio_low', 'ball_roll', 'russian', 'plank_side', 'foam_roll'] },
  full_a:      { title: '全身循环 A', keys: ['warmup', 'squat_box', 'db_press', 'band_row', 'glute_bridge', 'plank', 'stretch'] },
  full_b:      { title: '全身循环 B', keys: ['warmup', 'lunge_side', 'db_row', 'band_face', 'glute_ball', 'bird_dog', 'foam_roll'] },
  arms_posture:{ title: '肩臂 + 体态', keys: ['warmup', 'db_lateral', 'db_curl', 'db_tri', 'band_face', 'bird_dog', 'stretch'] },
};
const SPLIT_BY_DAYS = {
  2: ['full_a', 'cardio_core'],
  3: ['lower_glute', 'upper_back', 'cardio_core'],
  4: ['lower_glute', 'upper_back', 'cardio_core', 'full_a'],
  5: ['lower_glute', 'upper_back', 'arms_posture', 'cardio_core', 'full_b'],
};
const AUTO_WD = { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6] };

/* ---------- 最小可执行版本（不想练时的低门槛选项） ---------- */
const MINI_SESSIONS = [
  { key: 'mini5', title: '5 分钟起步', minutes: 5, tag: '站立 · 不出汗', keys: ['squat_wall', 'calf', 'band_row', 'stretch'] },
  { key: 'mini10', title: '10 分钟站立', minutes: 10, tag: '站立 · 微汗', keys: ['squat_sumo', 'band_walk', 'pu_incline', 'calf', 'stretch'] },
  { key: 'desk3', title: '久坐救急 3 分钟', minutes: 3, tag: '肩颈 · 髋', keys: ['neck', 'hip', 'breath'] },
];
const MICRO_HABITS = [
  '等水开：靠墙静蹲 30 秒 × 2',
  '刷手机时：站姿提踵 20 次',
  '久坐 1 小时：肩颈绕环 10 次 + 站起走 1 分钟',
  '看剧广告：弹力带划船 15 次',
  '睡前：垫上拉伸 3 分钟',
  '刷牙时：单腿站立 30 秒（练平衡）',
];

/* ---------- 4 周渐进编排：3 周进阶 + 1 周减载，循环 ---------- */
const WK_STAGES = [
  { name: '适应周', sets: 2, ecc: 3, note: '2 组起步，重点是把动作做标准、找到发力感' },
  { name: '累积周', sets: 3, ecc: 3, note: '加到 3 组，重量不变，保持节奏' },
  { name: '强化周', sets: 3, ecc: 4, note: '组数不变，离心放慢到 4 秒 / 每组多做 2 次' },
  { name: '减载周', sets: 2, ecc: 3, note: '主动减载：2 组、强度降低，让身体恢复' },
];
function weekStage(date) {
  const base = planStart() || (state.ws3.plan && state.ws3.plan.startDate) || todayISO();
  const d = date || todayISO();
  const w = Math.floor(diffDays(base, d) / 7);
  const idx = ((w % 4) + 4) % 4;
  return Object.assign({ cycleWeek: w + 1, stageNo: idx + 1 }, WK_STAGES[idx]);
}
function exSchemeFor(e, st) {
  if (!e || !e.scheme) return '';
  if (e.kind === 'd' || e.kind === 'r') return e.scheme;
  let s = e.scheme.replace(/3 组/, st.sets + ' 组');
  if (e.kind === 's') s = s.replace(/下放 \d 秒/, '下放 ' + st.ecc + ' 秒');
  return s;
}
/* ---------- 动作简笔示意（内联 SVG，离线可用） ---------- */
const PATTERNS = {
  squat:  '<circle cx="26" cy="9" r="4"/><path d="M26 13v11"/><path d="M26 24l-7 6v10"/><path d="M26 24l7 6v10"/><path d="M26 16h11"/>',
  lunge:  '<circle cx="26" cy="9" r="4"/><path d="M26 13v12"/><path d="M26 25l-8 6v8"/><path d="M26 25l9 4v10"/><path d="M26 17h10"/>',
  bridge: '<circle cx="13" cy="25" r="4"/><path d="M17 25h9"/><path d="M26 25l7-7"/><path d="M33 18l6 7"/><path d="M39 25v7"/><path d="M18 32h21"/>',
  plank:  '<circle cx="12" cy="21" r="4"/><path d="M16 23l14 3"/><path d="M30 26l6 6"/><path d="M14 32h25"/><path d="M17 25l-3-7"/>',
  row:    '<circle cx="32" cy="12" r="4"/><path d="M32 16l-6 8"/><path d="M26 24l-9 3"/><path d="M26 24l6 8v6"/><path d="M17 27v6"/><path d="M26 20l9 2"/>',
  press:  '<circle cx="34" cy="24" r="4"/><path d="M30 24h-14"/><path d="M16 24v8"/><path d="M16 32l-5 8"/><path d="M16 32l6 8"/><path d="M22 19v9"/>',
  raise:  '<circle cx="24" cy="10" r="4"/><path d="M24 14v14"/><path d="M24 20l-10 3"/><path d="M24 20l10 3"/><path d="M24 28l-5 12"/><path d="M24 28l5 12"/>',
  calf:   '<circle cx="24" cy="9" r="4"/><path d="M24 13v18"/><path d="M24 31l-4 8"/><path d="M24 31l5 6"/><path d="M24 16h9"/><path d="M20 39h9"/>',
  core:   '<circle cx="13" cy="24" r="4"/><path d="M17 24l11 2"/><path d="M28 26l7 6"/><path d="M19 31h16"/><path d="M17 21l-5-5"/>',
  stretch:'<circle cx="16" cy="11" r="4"/><path d="M16 15l9 10"/><path d="M25 25l-7 6-6 2"/><path d="M25 25l9 2"/><path d="M16 19l-9 0"/>',
  cardio: '<circle cx="27" cy="9" r="4"/><path d="M27 13v11"/><path d="M27 24l-8 5v9"/><path d="M27 24l8 4v10"/><path d="M27 16l-8 3"/><path d="M27 16l8-3"/>',
};
const PATTERN_OF = {
  warmup: 'cardio', squat_box: 'squat', squat_sumo: 'squat', squat_wall: 'squat', lunge_back: 'lunge', lunge_side: 'lunge',
  glute_bridge: 'bridge', glute_ball: 'bridge', band_walk: 'lunge', calf: 'calf',
  db_press: 'press', db_fly: 'press', db_shoulder: 'press', db_lateral: 'raise', db_row: 'row', db_curl: 'raise', db_tri: 'raise',
  pu_incline: 'press', pu_knee: 'press', band_row: 'row', band_pull: 'row', band_face: 'row',
  plank: 'plank', plank_side: 'plank', dead_bug: 'core', bird_dog: 'core', ball_roll: 'core', russian: 'core',
  cardio_walk: 'cardio', cardio_low: 'cardio', ball_bounce: 'core', foam_roll: 'stretch', stretch: 'stretch',
};
function exIcon(key) {
  const p = PATTERNS[PATTERN_OF[key]];
  if (!p) return '';
  return `<svg class="ex-icon" viewBox="0 0 48 48" aria-hidden="true">${p}</svg>`;
}

function exScheme(key, goal) {
  const e = EXLIB[key];
  if (!e) return '';
  if (e.kind === 'c') return '20-45 秒 × 3 组';
  if (e.kind === 'd') return '20-40 分钟';
  if (e.kind === 'r') return '各 30 秒';
  return REPS[goal] || REPS['减脂塑形'];
}
function pastDate(d) { return d < todayISO(); }

function buildPlan(cfg) {
  const n = clamp(cfg.sessionsPerWeek || cfg.daysPerWeek || 3, 2, 5);
  const keys = SPLIT_BY_DAYS[n] || SPLIT_BY_DAYS[3];
  const sessions = keys.map((sk) => {
    const sp = SPLITS[sk] || SPLITS.full_a;
    return {
      key: sk, title: sp.title, minutes: cfg.minutes || 40,
      exercises: sp.keys.map((k) => ({ key: k, name: EXLIB[k].name, muscle: EXLIB[k].muscle, scheme: exScheme(k, cfg.goal), how: EXLIB[k].how, kind: EXLIB[k].kind })),
    };
  });
  return { goal: cfg.goal || '减脂塑形', minutes: cfg.minutes || 40, sessionsPerWeek: n, startDate: cfg.startDate || todayISO(), sessions, builtAt: Date.now() };
}
function lightSession() {
  const goal = ws3Plan() ? ws3Plan().goal : '减脂塑形';
  return {
    key: 'light', title: '轻量日 · 低冲击有氧 + 拉伸', minutes: 20,
    exercises: SPLITS.cardio_core.keys.map((k) => ({ key: k, name: EXLIB[k].name, muscle: EXLIB[k].muscle, scheme: exScheme(k, goal), how: EXLIB[k].how, kind: EXLIB[k].kind })),
  };
}

/* ---------- 餐饮推荐（只做早 / 晚 · 减脂 + 消炎 · 备菜连续、品类精简） ---------- */
const MEALS = {
  breakfast: [
    { t: '无糖酸奶 + 燕麦 40g + 蓝莓 + 水煮蛋 1 个', tag: '5 分钟', ing: ['酸奶', '燕麦', '蓝莓', '鸡蛋'] },
    { t: '全麦面包 2 片 + 煎蛋 1 个 + 番茄 + 牛奶', tag: '8 分钟', ing: ['全麦面包', '鸡蛋', '番茄', '牛奶'] },
    { t: '杂粮粥 + 卤蛋 1 个 + 凉拌菠菜', tag: '10 分钟', ing: ['杂粮饭', '鸡蛋', '菠菜'] },
    { t: '玉米半根 + 水煮蛋 2 个 + 无糖豆浆', tag: '8 分钟', ing: ['玉米', '鸡蛋', '豆浆'] },
    { t: '隔夜燕麦杯（前一晚泡好）+ 香蕉 + 坚果', tag: '0 分钟', ing: ['燕麦', '酸奶', '香蕉', '坚果'] },
  ],
  dinner: [
    { t: '清蒸鲈鱼 + 西兰花 + 杂粮饭', tag: '消炎', ing: ['鱼', '西兰花', '杂粮饭'] },
    { t: '番茄豆腐 + 蒜蓉菠菜 + 红薯', tag: '消炎', ing: ['番茄', '豆腐', '菠菜', '红薯'] },
    { t: '白灼虾 + 凉拌黄瓜 + 玉米', tag: '高蛋白', ing: ['虾', '黄瓜', '玉米'] },
    { t: '去皮鸡腿 + 彩椒西兰花 + 杂粮饭', tag: '减脂', ing: ['鸡肉', '彩椒', '西兰花', '杂粮饭'] },
    { t: '菌菇豆腐汤 + 清炒时蔬 + 紫薯', tag: '清淡', ing: ['菌菇', '豆腐', '时蔬', '紫薯'] },
  ],
};
const MEAL_STAPLES = ['鸡蛋', '无糖酸奶 / 牛奶', '燕麦', '全麦面包', '玉米 / 红薯 / 紫薯', '杂粮饭', '鸡胸 / 鸡腿', '鲈鱼 / 虾', '豆腐', '西兰花 / 菠菜 / 彩椒', '番茄 / 黄瓜', '蓝莓 / 香蕉', '坚果', '橄榄油 / 姜蒜'];
const MEAL_TIPS = [
  '每餐一掌心蛋白：蛋 / 鱼虾 / 鸡胸 / 豆腐',
  '主食一拳头，选粗粮（燕麦 / 玉米 / 红薯 / 杂粮饭）',
  '蔬菜占半盘，深色为主（西兰花 / 菠菜 / 彩椒）',
  '消炎加分：深海鱼、蓝莓、坚果、姜蒜、番茄',
  '用橄榄油低温炒或凉拌，少油炸、少糖',
  '少加工：戒含糖饮料、糕点、腌制品',
];
const PREP_TIPS = [
  '周末 30 分钟：煮 6-8 个水煮蛋（冷藏可放 5 天）',
  '蒸一锅杂粮饭 + 红薯 / 紫薯，分装冷冻，吃前微波 2 分钟',
  '西兰花、彩椒切好装盒；菠菜焯水后沥干',
  '鸡胸 / 鸡腿分装，用黑胡椒 + 蒜 + 少许橄榄油腌好冷冻',
  '黄瓜、番茄洗净即食；蓝莓冷冻保存',
  '常备：无糖酸奶、燕麦、坚果、橄榄油',
];

/* ---------- 「我买的菜」→ 菜品推荐 ---------- */
const ING_ALIAS = {
  '西红柿': '番茄', '圣女果': '番茄',
  '鸡胸肉': '鸡肉', '鸡胸': '鸡肉', '鸡腿肉': '鸡肉', '鸡腿': '鸡肉', '鸡肉': '鸡肉',
  '西蓝花': '西兰花', '花椰菜': '西兰花',
  '虾仁': '虾', '大虾': '虾', '基围虾': '虾', '鲜虾': '虾',
  '地瓜': '红薯', '番薯': '红薯',
  '蛋': '鸡蛋', '水煮蛋': '鸡蛋', '土鸡蛋': '鸡蛋',
  '生菜': '时蔬', '油麦菜': '时蔬', '小白菜': '时蔬', '青菜': '时蔬', '蔬菜': '时蔬', '绿叶菜': '时蔬', '时蔬': '时蔬',
  '燕麦片': '燕麦', '麦片': '燕麦',
  '面包': '全麦面包', '全麦吐司': '全麦面包', '吐司': '全麦面包',
  '糙米饭': '杂粮饭', '米饭': '杂粮饭', '糙米': '杂粮饭', '杂粮': '杂粮饭',
  '嫩豆腐': '豆腐', '老豆腐': '豆腐',
  '蘑菇': '菌菇', '香菇': '菌菇', '金针菇': '菌菇', '杏鲍菇': '菌菇', '菌菇': '菌菇',
  '鱼': '鱼', '鲈鱼': '鱼', '三文鱼': '鱼', '鳕鱼': '鱼', '鱼片': '鱼',
  '青瓜': '黄瓜', '甜椒': '彩椒', '灯笼椒': '彩椒',
  '酸奶': '酸奶', '牛奶': '牛奶', '豆浆': '豆浆', '豆奶': '豆浆',
};
const QUICK_INGS = ['鸡蛋', '鸡肉', '西兰花', '番茄', '豆腐', '虾', '菠菜', '杂粮饭'];
function parseIngs(text) {
  return String(text || '')
    .split(/[\s,，、;；/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ING_ALIAS[s] || s)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 20);
}
function recommendMeals(ings) {
  const pool = [
    ...MEALS.breakfast.map((m) => ({ ...m, slot: '早餐' })),
    ...MEALS.dinner.map((m) => ({ ...m, slot: '晚餐' })),
  ];
  return pool
    .map((m) => {
      const need = m.ing || [];
      const hit = need.filter((i) => ings.includes(i));
      const miss = need.filter((i) => !ings.includes(i));
      return { ...m, hit, miss, score: hit.length / need.length + hit.length * 0.2 };
    })
    .filter((m) => m.hit.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
function renderIngredientBox() {
  const ings = state.ws3._ings || [];
  const recs = ings.length ? recommendMeals(ings) : [];
  return `<div class="ing-box">
    <div class="spread">
      <b class="tiny">🧺 我买的菜 → 能做什么</b>
      ${ings.length ? '<button class="btn xs ghost" data-action="ws3-ing-clear">清空</button>' : ''}
    </div>
    <div class="row" style="margin-top:6px;flex-wrap:nowrap">
      <input type="text" id="ing-input" placeholder="输入菜名，如 鸡胸 西兰花 番茄" style="flex:1;min-width:0">
      <button class="btn xs primary" data-action="ws3-ing-add">推荐</button>
    </div>
    ${ings.length
      ? `<div class="row" style="margin-top:8px">${ings.map((i) => `<span class="ing-tag">${h(i)}<i data-action="ws3-ing-del" data-name="${h(i)}">×</i></span>`).join('')}</div>`
      : `<div class="row" style="margin-top:8px">${QUICK_INGS.map((q) => `<button class="ing-quick" data-action="ws3-ing-quick" data-name="${h(q)}">+ ${h(q)}</button>`).join('')}</div>`}
    ${ings.length
      ? (recs.length
        ? `<div class="rec-list">${recs.map((r) => `<div class="rec-row">
            <span class="rec-slot">${r.slot}</span>
            <span class="rec-t"><b>${h(r.t)}</b>
              <span class="tiny muted">用到：${r.hit.map((x) => h(x)).join('、')}${r.miss.length ? ` · 还差：${r.miss.slice(0, 2).map((x) => h(x)).join('、')}` : ''}</span>
            </span>
          </div>`).join('')}</div>`
        : '<div class="tiny muted" style="margin-top:8px">这些食材暂时没匹配到菜谱，可补充常见主料（鸡蛋 / 鸡肉 / 豆腐 / 杂粮饭），或点上方「换一换」看今日推荐。</div>')
      : ''}
  </div>`;
}

/* ---------- 训练须知（居家 · 低冲击 · 减脂塑形） ---------- */
const TRAIN_TIPS = [
  '每次先热身 3-5 分钟，结束拉伸 5 分钟',
  '哑铃较轻时 → 用「慢速离心」：下放数 3 秒、顶点停 1 秒',
  '多做单侧动作（后撤弓步 / 单臂划船），单侧强度更高',
  '组间休息 45-60 秒；觉得轻松就缩短休息，而不是硬加重量',
  '每组做到「还能再做 2-3 次」就停，别硬拼到力竭',
  '减脂靠节奏不靠饿：配合每天 6000-8000 步即可',
  '每周留 1 天完全休息；睡够 7 小时比多练一次更有效',
];
const LIGHT_TIP = '轻量日适合身体不适、睡眠不足或状态不佳时使用：把力量日改成「低冲击有氧 + 拉伸」、强度减半即可，不用停练；恢复后再回到正常组数。';

/* ---------- 教学 / 跟练来源：官方优先 → 高收藏跟练 → 偏好 UP 主 ---------- */
const FIT_GUIDES = [
  {
    group: '① 国家体育总局 · 居家健身（官方，优先看）',
    items: [
      { n: '🔥 科学热身操', d: '训练前必看', u: 'https://www.sport.gov.cn/n4/n24581921/n24581874/n24581878/c24582643/content.html' },
      { n: '🧘 拉伸操组合', d: '训练后放松', u: 'https://www.sport.gov.cn/n4/n24581921/n24581874/n24581878/c24582622/content.html' },
      { n: '🦵 下肢力量练习', d: '臀腿基础', u: 'https://www.sport.gov.cn/n4/n24581921/n24581874/n24581960/c24583111/content.html' },
      { n: '🌈 垫上拉伸练习', d: '垫上放松', u: 'https://www.sport.gov.cn/n4/n24581921/n24581874/n24581946/c24583290/content.html' },
      { n: '🏅 减脂塑形（韩聪 / 隋文静）', d: '告别腰肩肥油小粗腿', u: 'https://www.sport.gov.cn/n4/n24581921/n24581874/n24581876/c25476546/content.html' },
      { n: '🌱 零基础健身（惠若琪）', d: '完全没基础先看这个', u: 'https://www.sport.gov.cn/n4/n24581921/n24581874/n24581876/c25476562/content.html' },
      { n: '💆 肩颈养护有妙招', d: '久坐党', u: 'https://www.sport.gov.cn/n4/n24581921/n24581874/n24581960/c24583058/content.html' },
      { n: '📚 更多居家健身微视频', d: '总局科学健身专栏', u: 'https://www.sport.gov.cn/n4/n24581921/n24581874/index.html' },
    ],
  },
  {
    group: '② 热门跟练（B站 · 按收藏量排序）',
    items: [
      { n: '居家无跑跳跟练', d: '初学者友好', u: 'https://search.bilibili.com/all?keyword=' + enc('居家 无跑跳 跟练') + '&order=stow' },
      { n: '站立燃脂跟练', d: '不占地方', u: 'https://search.bilibili.com/all?keyword=' + enc('站立 燃脂 跟练') + '&order=stow' },
      { n: '塑形 / 普拉提跟练', d: '体态与线条', u: 'https://search.bilibili.com/all?keyword=' + enc('普拉提 塑形 跟练') + '&order=stow' },
    ],
  },
  {
    group: '③ 多种动作一起的跳操合集（想一次练完就点这里）',
    items: [
      { n: '无跑跳 · 居家跳操 30 分钟', d: '低冲击', u: 'https://search.bilibili.com/all?keyword=' + enc('无跑跳 居家跳操 30分钟') + '&order=stow' },
      { n: '站立 · 低冲击燃脂跟练', d: '关节友好', u: 'https://search.bilibili.com/all?keyword=' + enc('站立 低冲击 燃脂跟练') + '&order=stow' },
      { n: '轻量日 · 舒缓跟练', d: '配合轻量日', u: 'https://search.bilibili.com/all?keyword=' + enc('轻量 舒缓 拉伸 跟练') + '&order=stow' },
    ],
  },
];
function renderGuides() {
  return FIT_GUIDES.map((g) => `
    <div class="card card-pad" style="margin-bottom:12px">
      <b>${h(g.group)}</b>
      <div class="stack" style="margin-top:8px">
        ${g.items.map((it) => `<div class="entry-row">
          <span class="entry-name">${h(it.n)}</span>
          ${it.d ? `<span class="badge">${h(it.d)}</span>` : ''}
          <a class="res-link" href="${it.u}" target="_blank" rel="noopener">打开 ↗</a>
        </div>`).join('')}
      </div>
    </div>`).join('');
}


function mealOf(date, shift) {
  const seed = [...date].reduce((s, c) => s + c.charCodeAt(0), 0) + (shift || 0);
  const pick = (arr, k) => arr[((seed * (k + 3)) % arr.length + arr.length) % arr.length];
  return { breakfast: pick(MEALS.breakfast, 1), dinner: pick(MEALS.dinner, 2) };
}
function renderMeals() {
  const m = mealOf(todayISO(), state.ws3._meal || 0);
  const rows = [['🌅 早餐', m.breakfast], ['🌙 晚餐', m.dinner]];
  return `${rows.map(([t, v]) => `<div class="meal-row">
      <span class="meal-t">${t}<span class="badge" style="margin-left:6px">${h(v.tag)}</span></span>
      <span class="tiny">${h(v.t)}</span>
    </div>`).join('')}`;
}
function ws3Cfg() { return state.ws3.config || {}; }
function ws3Plan() { return state.ws3.plan || null; }
function ws3Sessions() { const p = ws3Plan(); return (p && p.sessions) || []; }
function sessionByKey(key) {
  if (key === 'light') return lightSession();
  return ws3Sessions().find((s) => s.key === key) || miniSession(key);
}
function miniSession(key) {
  const def = MINI_SESSIONS.find((m) => m.key === key);
  if (!def) return null;
  const goal = ws3Plan() ? ws3Plan().goal : '减脂塑形';
  return {
    key: def.key, title: def.title, minutes: def.minutes, tag: def.tag,
    exercises: def.keys.map((k) => ({ key: k, name: EXLIB[k].name, muscle: EXLIB[k].muscle, scheme: exScheme(k, goal), how: EXLIB[k].how, kind: EXLIB[k].kind })),
  };
}
function planStart() { const p = ws3Plan(); return p && p.startDate ? p.startDate : null; }
function ws3Check(dateStr) { return (state.ws3.checkins || {})[dateStr] || null; }
function ws3Done(dateStr) { return !!ws3Check(dateStr); }
function weekDates(dateStr) { const s = weekStart(dateStr); return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(s, i)); }
function ws3WeekStat(dateStr) {
  const ds = weekDates(dateStr);
  const target = ws3Plan() ? ws3Plan().sessionsPerWeek : 0;
  return { done: ds.filter((d) => ws3Done(d)).length, target, dates: ds };
}
function ws3MonthStat(ym) {
  let done = 0, light = 0;
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  for (let i = 1; i <= last; i++) {
    const c = ws3Check(`${ym}-${pad(i)}`);
    if (c) { done++; if (c.sessionKey === 'light') light++; }
  }
  return { done, light };
}
function monthCal(ym) {
  const [y, m] = ym.split('-').map(Number);
  const startWd = (new Date(y, m - 1, 1).getDay() + 6) % 7; // 周一为一周起点
  const last = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let i = 1; i <= last; i++) cells.push(`${ym}-${pad(i)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
function calCell(d) {
  if (!d) return '<span class="cal-cell blank"></span>';
  const t = todayISO();
  const c = ws3Check(d);
  const s = planStart();
  let cls = 'cal-cell', mark = '';
  if (c) {
    if (c.sessionKey === 'light') { cls += ' light'; mark = '🌸'; }
    else { cls += ' done'; mark = '✓'; }
  } else if (s && d < s) { cls += ' pre'; }
  else if (d === t) { cls += ' today'; }
  else if (d > t) { cls += ' upcoming'; }
  else { cls += ' idle'; }
  const title = `${d}${c ? ' · ' + (c.sessionTitle || '已打卡') : ''}`;
  return `<button class="${cls}" data-action="ws3-day" data-date="${d}" title="${title}">
    <span class="d">${Number(d.slice(8))}</span><span class="m">${mark}</span></button>`;
}
function exRow(e, i, date) {
  const st = weekStage(date);
  return `<div class="ex-row">
    ${exIcon(e.key)}
    <span class="ex-i">${i + 1}</span>
    <span class="ex-name">${h(e.name)}<span class="badge" style="margin-left:6px">${h(e.muscle)}</span>
      ${e.how ? `<span class="ex-how">${h(e.how)}</span>` : ''}</span>
    <span class="ex-scheme">${h(exSchemeFor(e, st))}</span>
    <a class="res-link" href="https://search.bilibili.com/all?keyword=${enc(e.name + ' 动作教学')}&order=stow" target="_blank" rel="noopener">▶ 教学视频</a>
  </div>`;
}
function viewWS3() {
  const t = todayISO();
  const plan = ws3Plan();
  const sessions = ws3Sessions();
  const today = ws3Check(t);
  const wk = ws3WeekStat(t);
  const ym = state.ws3._cal || monthOf(t);
  const mstat = ws3MonthStat(ym);
  const total = Object.keys(state.ws3.checkins || {}).length;
  const stg = weekStage(t);
  const wkPct = wk.target ? Math.min(100, Math.round((wk.done / wk.target) * 100)) : 0;

  let todayCard;
  if (!plan) {
    todayCard = '<div class="empty"><span class="big">💪</span>还没有训练计划，点右上角「调整计划」生成一套。</div>';
  } else if (today) {
    const s = sessionByKey(today.sessionKey);
    todayCard = `<div class="today-head">
        <div class="today-title"><span class="today-emoji">✅</span><b>今日已完成</b><span class="badge ok">${h(today.sessionTitle || (s ? s.title : '自主训练'))}</span></div>
        <button class="btn xs ghost" data-action="ws3-undo" data-date="${t}">撤销</button>
      </div>
      ${today.note ? `<div class="tiny muted" style="margin-bottom:8px">📝 ${h(today.note)}</div>` : ''}
      <div class="ex-list">${(s ? s.exercises : []).map((e, i) => exRow(e, i, t)).join('')}</div>`;
  } else {
    todayCard = `<div class="today-head">
        <div class="today-title"><span class="today-emoji">🔥</span><b>今天练哪套？</b><span class="badge">本周 ${wk.done}/${wk.target}</span></div>
        <button class="btn xs ghost" data-action="ws3-light" data-date="${t}">🌸 今天轻量</button>
      </div>
      <div class="tiny muted" style="margin-bottom:10px">选一套 → 看动作 → 练完点「完成打卡」。也可以直接点日历补记。</div>
      <div class="session-grid">
        ${sessions.map((s) => `<button class="session-card" data-action="ws3-session" data-key="${s.key}" data-date="${t}">
          <b>${h(s.title)}</b>
          <span class="tiny muted">${s.exercises.length} 个动作 · 约 ${s.minutes} 分钟</span>
          <span class="tiny">${s.exercises.slice(1, 4).map((e) => h(e.name)).join(' · ')}…</span>
        </button>`).join('')}
      </div>
      <div class="mini-row">
        <span class="tiny muted">没状态？先做最小版（做完也算打卡）：</span>
        ${MINI_SESSIONS.map((m) => `<button class="mini-btn" data-action="ws3-session" data-key="${m.key}" data-date="${t}">
          <b>⚡ ${h(m.title)}</b><span>${m.minutes} 分钟 · ${h(m.tag)}</span>
        </button>`).join('')}
      </div>`;
  }

  return `
  <div class="page-head">
    <div><div class="eyebrow">工作台 3</div><h1>健康猿</h1>
      <p>${plan ? `目标「${h(plan.goal)}」 · 每周 ${plan.sessionsPerWeek} 次 · 每次约 ${plan.minutes} 分钟 · 不限周几` : '先设置目标，生成每周训练建议'}</p></div>
    <div class="actions">
      <button class="btn" data-action="ws3-config">⚙️ 调整计划</button>
      <button class="btn primary ok" data-action="ws3-check" data-date="${t}">✅ 打卡</button>
    </div>
  </div>

  <div class="ws3-top">
    <div class="ws3-progress">
      <div class="ring" style="--p:${wkPct};--c:var(--ws3)"><b>${wkPct}%</b></div>
      <div>
        <b>本周完成</b>
        <div class="tiny muted">${wk.done}/${wk.target} 次 · 第 ${stg.cycleWeek} 周 ${h(stg.name)}</div>
      </div>
    </div>
    <div class="ws3-metrics">
      <div class="metric"><span class="m-v">${wk.done}<small>/${wk.target}</small></span><span class="m-k">本周</span></div>
      <div class="metric"><span class="m-v">${mstat.done}<small>次</small></span><span class="m-k">本月</span></div>
      <div class="metric"><span class="m-v">${total}<small>次</small></span><span class="m-k">累计</span></div>
      <div class="metric"><span class="m-v">${plan ? plan.sessionsPerWeek : 0}<small>次/周</small></span><span class="m-k">当前频率</span></div>
    </div>
  </div>

  <div class="ws3-grid">
    <div class="ws3-main">
      <section class="panel panel-hero">
        <div class="panel-head">
          <h2>今日训练</h2>
          <span class="badge brand">第 ${stg.cycleWeek} 周 · ${h(stg.name)}</span>
        </div>
        ${todayCard}
      </section>

      <section class="panel">
        <div class="panel-head"><h2>本周建议</h2><span class="tiny muted">每周 ${plan ? plan.sessionsPerWeek : 0} 次 · 不限定周几，按状态安排</span></div>
        <div class="suggest-list">
          ${sessions.map((s, i) => `<div class="suggest-row">
            <span class="sug-i">${i + 1}</span>
            <span class="sug-t"><b>${h(s.title)}</b><span class="tiny muted"> · ${s.exercises.length} 个动作 · 约 ${s.minutes} 分钟</span></span>
            <button class="btn xs" data-action="ws3-session" data-key="${s.key}" data-date="${t}">查看 / 打卡</button>
          </div>`).join('')}
        </div>
        <div class="week-dots">
          ${wk.dates.map((d) => {
            const c = ws3Check(d);
            return `<span class="wd-dot${c ? (c.sessionKey === 'light' ? ' light' : ' on') : ''}${d === t ? ' today' : ''}" title="${d}${c ? ' · ' + h(c.sessionTitle || '已打卡') : ''}">${WD[d2(d).getDay()].replace('周', '')}</span>`;
          }).join('')}
        </div>
        <div class="bar ok" style="margin-top:10px"><span style="width:${wkPct}%"></span></div>
      </section>
    </div>

    <div class="ws3-side">
      <section class="panel">
        <div class="panel-head"><h2>打卡日历</h2>
          <div class="row">
            <button class="btn xs" data-action="ws3-cal" data-dir="-1">◀</button>
            <b class="tiny">${ym.replace('-', ' 年 ')} 月</b>
            <button class="btn xs" data-action="ws3-cal" data-dir="1">▶</button>
          </div>
        </div>
        <div class="cal-head">${['一', '二', '三', '四', '五', '六', '日'].map((x) => `<span>${x}</span>`).join('')}</div>
        <div class="cal-grid">${monthCal(ym).map(calCell).join('')}</div>
        <div class="cal-legend tiny muted">✓ 已打卡　🌸 轻量　点日期可补记</div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>🍽️ 今日餐饮</h2>
          <button class="btn xs" data-action="meal-shuffle">🔄 换一换</button>
        </div>
        ${renderMeals()}
        ${renderIngredientBox()}
        <details class="mini-det">
          <summary>饮食原则（减脂 + 消炎）</summary>
          <div class="row" style="margin-top:8px">${MEAL_TIPS.map((x) => `<span class="badge">${h(x)}</span>`).join('')}</div>
        </details>
        <details class="mini-det">
          <summary>周末备菜清单（30 分钟，吃一周）</summary>
          <div class="stack" style="margin-top:8px">${PREP_TIPS.map((x) => `<div class="tiny">· ${h(x)}</div>`).join('')}</div>
          <div class="tiny muted" style="margin-top:8px">常备主料：${MEAL_STAPLES.map((x) => `<span class="badge">${h(x)}</span>`).join('')}</div>
        </details>
      </section>

      <details class="panel">
        <summary class="panel-head"><h2>📌 训练须知</h2><span class="tiny muted">组数 / 离心 / 减量日</span></summary>
        <div class="stack">${TRAIN_TIPS.map((x) => `<div class="entry-row"><span class="tiny">· ${h(x)}</span></div>`).join('')}</div>
        <hr class="hr">
        <div class="tiny" style="color:var(--ink-2)">💡 ${h(LIGHT_TIP)}</div>
        <details class="mini-det">
          <summary>碎片动作（等水开 / 刷手机时做）</summary>
          <div class="stack" style="margin-top:8px">${MICRO_HABITS.map((x) => `<div class="tiny">· ${h(x)}</div>`).join('')}</div>
        </details>
      </details>
    </div>
  </div>

  <details class="panel">
    <summary class="panel-head"><h2>🎬 教学 / 跟练</h2><span class="tiny muted">官方优先 · 高收藏跟练</span></summary>
    <div class="panel-body">${renderGuides()}</div>
  </details>

  <details class="panel">
    <summary class="panel-head"><h2>📚 训练动作库</h2><span class="tiny muted">${Object.keys(EXLIB).length} 个动作 · 下肢 / 上肢 / 核心 / 有氧</span></summary>
    <div class="panel-body">
      ${EX_GROUPS.map((gp) => `
        <div class="lib-group">
          <b class="tiny">${h(gp.name)}</b>
          <div class="grid g3" style="margin-top:8px">
            ${gp.keys.map((k) => { const e = EXLIB[k]; return `<div class="lib-card">
              ${exIcon(k)}
              <div class="lib-txt"><b>${h(e.name)}</b><span class="tiny muted">${h(e.muscle)} · ${h(e.how)}</span></div>
              <a class="res-link" href="https://search.bilibili.com/all?keyword=${enc(e.name + ' 动作教学')}&order=stow" target="_blank" rel="noopener">▶ 教学</a>
            </div>`; }).join('')}
          </div>
        </div>`).join('')}
    </div>
  </details>
  `;
}

function openWs3Config() {
  const cfg = ws3Cfg();
  const plan = ws3Plan();
  const n = plan ? plan.sessionsPerWeek : (cfg.sessionsPerWeek || 3);
  openModal(`
    <h3>⚙️ 健康猿 · 训练设置</h3>
    <div class="modal-sub">只定「每周几次 + 每次多久」，不限定周几，按状态安排</div>
    <div class="grid g2">
      <div class="field"><label>训练目标</label><select id="g-goal">
        ${GOALS.map((g) => `<option ${g === (plan ? plan.goal : cfg.goal) ? 'selected' : ''}>${h(g)}</option>`).join('')}
      </select></div>
      <div class="field"><label>每周建议次数</label><select id="g-days">
        ${[2, 3, 4, 5].map((d) => `<option value="${d}" ${d === n ? 'selected' : ''}>${d} 次</option>`).join('')}
      </select></div>
      <div class="field"><label>单次时长（分钟）</label><input type="number" id="g-mins" min="20" max="150" step="5" value="${plan ? plan.minutes : (cfg.minutes || 40)}"></div>
    </div>
    <div class="hint" style="margin:-4px 0 10px">居家器械：瑜伽垫 / 瑜伽球 / 瑜伽砖 / 哑铃（4–6kg）/ 弹力带 / 泡沫轴。全程低冲击，不安排跑跳。</div>
    <div class="modal-actions"><button class="btn ghost" data-action="close-modal">取消</button>
      <button class="btn primary" data-action="ws3-gen">生成 / 更新建议</button></div>`);
}

function openWs3Session(key, date) {
  const d = date || todayISO();
  const s = sessionByKey(key) || ws3Sessions()[0];
  if (!s) return;
  const ck = ws3Check(d) || {};
  const isLight = s.key === 'light';
  const stg = weekStage(d);
  const already = ck.sessionKey === s.key;
  openModal(`
    <h3>${isLight ? '🌸 ' : ''}${h(s.title)}</h3>
    <div class="modal-sub">${fmtLong(d)} · 第 ${stg.cycleWeek} 周 ${h(stg.name)} · ${s.exercises.length} 个动作 · 约 ${s.minutes} 分钟</div>
    ${isLight ? '<div class="row" style="margin-bottom:8px"><span class="badge">强度减半</span><span class="tiny muted">低冲击有氧 + 放松，不练力量</span></div>' : `<div class="tiny muted" style="margin-bottom:8px">📈 ${h(stg.note)}</div>`}
    <div class="ex-list">${s.exercises.map((e, i) => exRow(e, i, d)).join('')}</div>
    <hr class="hr">
    <div class="field"><label>备注（选填）</label><textarea id="d-note" placeholder="例如：状态不错，今天腿有点酸">${h(ck.note || '')}</textarea></div>
    <div class="modal-actions">
      <button class="btn ghost" data-action="close-modal">关闭</button>
      ${already ? `<button class="btn danger" data-action="ws3-undo" data-date="${d}">撤销打卡</button>` : ''}
      <button class="btn primary ok" data-action="ws3-save-day" data-date="${d}" data-key="${s.key}">${already ? '保存备注' : '完成打卡'}</button>
    </div>`);
}

function openWs3Day(date) {
  const ck = ws3Check(date);
  const stg = weekStage(date);
  if (ck) {
    const s = sessionByKey(ck.sessionKey);
    openModal(`
      <h3>${WD_NAME[d2(date).getDay()]} · 已打卡</h3>
      <div class="modal-sub">${fmtLong(date)} · ${h(ck.sessionTitle || (s ? s.title : '自主训练'))}</div>
      ${ck.note ? `<div class="tiny muted" style="margin-bottom:8px">📝 ${h(ck.note)}</div>` : ''}
      ${s ? `<div class="ex-list">${s.exercises.map((e, i) => exRow(e, i, date)).join('')}</div>` : ''}
      <hr class="hr">
      <div class="field"><label>备注（选填）</label><textarea id="n-note">${h(ck.note || '')}</textarea></div>
      <div class="modal-actions">
        <button class="btn ghost" data-action="close-modal">关闭</button>
        <button class="btn" data-action="ws3-save-note" data-date="${date}">保存备注</button>
        <button class="btn danger" data-action="ws3-undo" data-date="${date}">撤销打卡</button>
      </div>`);
    return;
  }
  openModal(`
    <h3>${WD_NAME[d2(date).getDay()]} · 补记打卡</h3>
    <div class="modal-sub">${fmtLong(date)} · 第 ${stg.cycleWeek} 周 ${h(stg.name)} · 选今天实际练的那套</div>
    <div class="session-grid">
      ${ws3Sessions().map((s) => `<button class="session-card" data-action="ws3-session" data-key="${s.key}" data-date="${date}">
        <b>${h(s.title)}</b>
        <span class="tiny muted">${s.exercises.length} 个动作 · 约 ${s.minutes} 分钟</span>
        <span class="tiny">${s.exercises.slice(1, 4).map((e) => h(e.name)).join(' · ')}…</span>
      </button>`).join('')}
      <button class="session-card light" data-action="ws3-session" data-key="light" data-date="${date}">
        <b>🌸 轻量日</b>
        <span class="tiny muted">低冲击有氧 + 拉伸 · 约 20 分钟</span>
        <span class="tiny">没时间 / 状态不佳时选这个</span>
      </button>
    </div>
    <div class="modal-actions"><button class="btn ghost" data-action="close-modal">关闭</button></div>`);
}

function ws3Checkin(date, key, note) {
  const s = sessionByKey(key);
  state.ws3.checkins = state.ws3.checkins || {};
  const prev = state.ws3.checkins[date] || {};
  state.ws3.checkins[date] = {
    done: true,
    at: prev.at || Date.now(),
    sessionKey: key,
    sessionTitle: s ? s.title : '自主训练',
    note: note != null ? note : (prev.note || ''),
  };
  save();
}
function ws3SaveDay(date, key) {
  const note = (document.getElementById('d-note') || {}).value || '';
  ws3Checkin(date, key || (ws3Check(date) || {}).sessionKey, note);
}
function saveWs3Plan() {
  const g = (id) => document.getElementById(id);
  const cfg = {
    goal: g('g-goal').value,
    sessionsPerWeek: Number(g('g-days').value) || 3,
    minutes: clamp(Number(g('g-mins').value) || 40, 20, 180),
  };
  cfg.startDate = (state.ws3.plan && state.ws3.plan.startDate) || todayISO();
  state.ws3.config = cfg;
  state.ws3.plan = buildPlan(cfg);
  save(); closeModal(); render();
  toast('已更新：每周建议 ' + cfg.sessionsPerWeek + ' 次');
}

/* =====================================================================
   首页 / 设置
   ===================================================================== */
function viewHome() {
  const t = todayISO();
  const w1 = ws1Day(t); const s1 = ws1Stats();
  const today3 = ws3Check(t);
  const wk3 = ws3WeekStat(t);
  const newsN = NEWS.items.filter((i) => Date.now() - i.ts <= 7 * 86400000).length;
  const name = state.profile.name ? h(state.profile.name) + '，' : '';
  const cards = [
    { route: '#/ws1', icon: '📘', color: 'var(--ws1)', bg: 'var(--brand-soft)', title: '信息系统高项', desc: '软考高级考纲 · 计划打卡 · 跳转公开课与刷题小程序', stat: w1.tasks.length ? `${w1.done.length}/${w1.tasks.length} 今日` : '尚未生成计划' },
    { route: '#/ws2', icon: '📡', color: 'var(--ws2)', bg: '#f1ebff', title: 'AIIA 求职雷达', desc: 'AI 应用岗方向筛选 · 一周新闻 · 自动延伸学习卡片', stat: NEWS.loaded ? `${newsN} 条一周内` : '点击进入并刷新' },
    { route: '#/ws3', icon: '💪', color: 'var(--ws3)', bg: 'var(--ok-soft)', title: '健康猿', desc: '居家低冲击训练建议 · 主动打卡 · 餐饮推荐', stat: today3 ? '今日已打卡 ✓' : `本周 ${wk3.done}/${wk3.target} 次` },
  ];
  const todos = [];
  w1.tasks.filter((x) => !state.ws1.tasksDone[x.id]).slice(0, 4).forEach((x) => todos.push({ ws: '高项', text: x.type === 'content' ? `第${x.no}章 ${x.point}` : x.title, route: '#/ws1' }));
  if (!today3) todos.push({ ws: '健康猿', text: `训练打卡（本周 ${wk3.done}/${wk3.target} 次，任选一套）`, route: '#/ws3' });
  return `
  <div class="dash-hero section">
    <div class="glow"></div>
    <div class="eyebrow" style="color:#9fb2e8">LIANBA · 自学工作台</div>
    <h1>${name}今天也要练一练 👋</h1>
    <p>${fmtLong(t)} · 面向跨专业初学者 · 日均学习 ${state.profile.dailyMinutes || 120} 分钟</p>
    <div class="quick">
      <button class="qbtn" data-action="nav" data-route="#/ws1">📘 开始学习高项</button>
      <button class="qbtn" data-action="news-refresh">📡 刷新 AIIA 资讯</button>
      <button class="qbtn" data-action="ws3-check" data-date="${t}">💪 今日训练打卡</button>
    </div>
  </div>

  <div class="grid g3 section">
    ${cards.map((c) => `<div class="ws-card" data-action="nav" data-route="${c.route}">
      <div class="wi" style="background:${c.bg};color:${c.color}">${c.icon}</div>
      <h3>${h(c.title)}</h3>
      <p>${h(c.desc)}</p>
      <span class="badge brand">${h(c.stat)}</span>
    </div>`).join('')}
  </div>

  <div class="grid g2 section">
    <div class="card card-pad">
      <div class="section-head"><h2>今日待办</h2><span class="badge">${todos.length} 项</span></div>
      ${todos.length ? `<div class="stack">${todos.map((x) => `<div class="spread" style="padding:8px 0;border-bottom:1px dashed var(--line)">
        <span><span class="badge">${h(x.ws)}</span> ${h(x.text)}</span>
        <button class="btn xs" data-action="nav" data-route="${x.route}">前往</button></div>`).join('')}</div>`
        : '<div class="empty"><span class="big">🎉</span>今天待办都完成了，休息一下！</div>'}
    </div>
    <div class="card card-pad">
      <div class="section-head"><h2>学习概览</h2><button class="btn sm ghost" data-action="nav" data-route="#/settings">设置 →</button></div>
      <div class="kv"><span class="k">高项 · 计划完成度</span><b>${s1.pct}%（${s1.done}/${s1.total}）</b></div>
      <div class="kv"><span class="k">高项 · 距离考试</span><b>${s1.examIn == null ? '未设置' : s1.examIn + ' 天'}</b></div>
      <div class="kv"><span class="k">高项 · 连续打卡</span><b>${s1.streak} 天</b></div>
      <div class="kv"><span class="k">健康猿 · 本周完成</span><b>${wk3.done} / ${wk3.target} 次</b></div>
      <div class="kv"><span class="k">资讯 · 一周内</span><b>${newsN} 条</b></div>
      <div class="kv"><span class="k">数据存储</span><b>${serverOK ? '本地文件' : '浏览器缓存'}</b></div>
    </div>
  </div>
  `;
}
function viewSettings() {
  const src = state.ws2.sources || [];
  return `
  <div class="page-head"><div><div class="eyebrow">系统</div><h1>设置与数据</h1><p>本地运行 · 数据保存在 data/state.json</p></div></div>

  <div class="section card card-pad">
    <div class="section-head"><h2>个人偏好</h2></div>
    <div class="grid g2">
      <div class="field"><label>昵称</label><input type="text" id="p-name" value="${h(state.profile.name || '')}" placeholder="例如：小明"></div>
      <div class="field"><label>每日学习时长（分钟）</label><input type="number" id="p-mins" value="${state.profile.dailyMinutes || 120}"></div>
    </div>
    <button class="btn primary" data-action="save-profile">保存</button>
  </div>

  <div class="section card card-pad">
    <div class="section-head"><h2>资讯源</h2><button class="btn sm" data-action="news-sources">管理 / 添加</button></div>
    <div class="grid g3">${src.map((s) => `<div class="spread" style="padding:6px 0"><span><b>${h(s.name)}</b><br><span class="tiny muted">${h(s.url)}</span></span><span class="badge ${s.enabled !== false ? 'ok' : ''}">${s.enabled !== false ? '启用' : '停用'}</span></div>`).join('') || '<div class="empty">暂无</div>'}</div>
  </div>

  <div class="section card card-pad">
    <div class="section-head"><h2>数据管理</h2></div>
    <p class="tiny muted">所有学习记录、打卡、卡片都保存在本地。可导出备份或导入恢复。</p>
    <div class="row" style="margin-top:10px">
      <button class="btn" data-action="export">⬇️ 导出 JSON</button>
      <label class="btn">⬆️ 导入 JSON<input type="file" accept="application/json" id="import-file" style="display:none"></label>
      <button class="btn danger" data-action="reset">🗑️ 重置全部数据</button>
    </div>
    <hr class="hr">
    <div class="kv"><span class="k">状态</span><b>${serverOK ? '✅ 已连接本地服务' : '⚠️ 离线（仅浏览器缓存）'}</b></div>
    <div class="kv"><span class="k">资讯条数</span><b>${NEWS.items.length}</b></div>
    <div class="kv"><span class="k">资讯源</span><b>${src.filter((s) => s.enabled !== false).length} 启用 / ${src.length} 总数</b></div>
    <div class="kv"><span class="k">高项计划任务</span><b>${(state.ws1.plan || []).length}</b></div>
    <div class="kv"><span class="k">学习卡片</span><b>${(state.ws2.cards || []).length}</b></div>
    <div class="kv"><span class="k">健身打卡</span><b>${Object.keys(state.ws3.checkins || {}).length} 次</b></div>
  </div>
  `;
}

/* =====================================================================
   事件委托
   ===================================================================== */
const ACTIONS = {
  nav: (el) => go(el.dataset.route),
  'close-modal': () => closeModal(),
  copy: (el) => copy(el.dataset.text || '', '已复制：' + (el.dataset.text || '')),
  'set-period': (el) => {
    const days = Number(el.dataset.days);
    const start = document.getElementById('c-start').value || todayISO();
    document.getElementById('c-end').value = addDays(start, days);
  },
  'ws1-open-config': openWs1Config,
  'ws1-week': (el) => {
    const dir = Number(el.dataset.dir);
    if (dir === 0) { state.ws1._ws = weekStart(todayISO()); }
    else {
      const cfg = state.ws1.config || {};
      const minWs = cfg.startDate ? weekStart(cfg.startDate) : null;
      let next = addDays(ws1WeekStart(), dir * 7);
      if (minWs && next < minWs) next = minWs;   // 不翻到计划开始之前
      state.ws1._ws = next;
    }
    render();
    const sec = document.getElementById('ws1-plan');
    if (sec && dir !== 0) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  'ws1-toggle': (el) => {
    const id = el.dataset.id, date = el.dataset.date;
    state.ws1.tasksDone[id] = !state.ws1.tasksDone[id];
    if (!state.ws1.tasksDone[id]) delete state.ws1.tasksDone[id];
    const sum = ws1Day(date);
    state.ws1.checkins = state.ws1.checkins || {};
    if (sum.done.length) state.ws1.checkins[date] = Object.assign({}, state.ws1.checkins[date], { minutes: sum.done.reduce((s, x) => s + (x.minutes || 0), 0), done: sum.done.length, total: sum.tasks.length, auto: true, at: Date.now() });
    else delete state.ws1.checkins[date];
    save(); render();
  },
  'ws1-checkin': () => openWs1Checkin(todayISO()),
  'ws1-do-checkin': (el) => doWs1Checkin(el.dataset.date),
  'ws1-open-quiz': openQuiz,
  'ws1-open-drill': openQuiz,
  'ws1-gen': () => {
    const start = document.getElementById('c-start').value;
    let end = document.getElementById('c-end').value;
    const wd = clamp(Number(document.getElementById('c-wd').value) || 45, 20, 240);
    const we = clamp(Number(document.getElementById('c-we').value) || 120, 30, 480);
    if (!start || !end) return toast('请填写开始与结束日期');
    if (end <= start) end = addDays(start, 120);
    state.ws1.config = { startDate: start, endDate: end, weekdayMinutes: wd, weekendMinutes: we };
    state.ws1.plan = generatePlan(state.ws1.config);
    state.ws1.tasksDone = {};
    state.ws1._ws = weekStart(todayISO());
    save(); closeModal(); render();
    toast('已按弹性节奏生成 ' + state.ws1.plan.length + ' 个任务');
  },
  'open-wechat': (el) => openWechat(el.dataset.name, el.dataset.search),

  // WS2
  'news-refresh': () => { save(); closeModal(); NEWS.loaded = false; ensureNews(true); if (rendered.route === '#/ws2') mainEl.innerHTML = newsSkeleton(); },
  'news-filter': (el) => { state.ws2._filter = el.dataset.filter; render(); },
  'track-toggle': (el) => {
    const id = el.dataset.id;
    const set = new Set(enabledTracks());
    if (set.has(id)) set.delete(id); else set.add(id);
    state.ws2.tracks = AIIA_TRACKS.map((t) => t.id).filter((x) => set.has(x));
    save(); render();
  },
  'track-all': () => { state.ws2.tracks = AIIA_TRACKS.map((t) => t.id); save(); render(); },
  'track-none': () => { state.ws2.tracks = []; save(); render(); },
  'news-sources': openSources,
  'news-read': (el) => { const id = el.dataset.id; if (state.ws2.read[id]) delete state.ws2.read[id]; else state.ws2.read[id] = Date.now(); save(); render(); },
  'news-copy': (el) => { const it = NEWS.items.find((i) => i.id === el.dataset.id); if (it) copy(it.link, '链接已复制'); },
  'news-save': (el) => { const it = NEWS.items.find((i) => i.id === el.dataset.id); if (it) { state.ws2.saved = state.ws2.saved || []; if (!state.ws2.saved.find((s) => s.id === it.id)) state.ws2.saved.unshift(it); save(); render(); toast('已收藏'); } },
  'news-unsave': (el) => { state.ws2.saved = (state.ws2.saved || []).filter((s) => s.id !== el.dataset.id); save(); render(); },
  'news-card': (el) => { const it = NEWS.items.find((i) => i.id === el.dataset.id); if (!it) return; state.ws2.cards = state.ws2.cards || []; state.ws2.cards.unshift(makeCard(it)); save(); render(); toast('已生成学习卡片 ✨'); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); },
  'news-bulk-card': () => { const list = newsFiltered().slice(0, 5); if (!list.length) return toast('当前列表为空'); state.ws2.cards = state.ws2.cards || []; list.forEach((it) => state.ws2.cards.unshift(makeCard(it))); save(); render(); toast('已生成 ' + list.length + ' 张卡片 ✨'); },
  'cards-clear': () => { if (confirm('确定清空全部学习卡片？')) { state.ws2.cards = []; save(); render(); } },
  'card-del': (el) => { state.ws2.cards = (state.ws2.cards || []).filter((c) => c.id !== el.dataset.id); save(); render(); },
  'src-toggle': (el) => { const i = Number(el.dataset.i); if (state.ws2.sources[i]) state.ws2.sources[i].enabled = el.checked; save(); },
  'src-del': (el) => { state.ws2.sources.splice(Number(el.dataset.i), 1); save(); openSources(); toast('已删除'); },
  'src-add': () => {
    const name = document.getElementById('src-name').value.trim();
    const url = document.getElementById('src-url').value.trim();
    const group = document.getElementById('src-group').value.trim() || '自定义';
    if (!name || !url) return toast('请填写名称与 RSS 地址');
    state.ws2.sources = state.ws2.sources || [];
    state.ws2.sources.push({ id: uid('src'), name, url, group, enabled: true });
    save(); openSources(); toast('已添加，点击「保存并刷新」生效');
  },
  'src-reset': async () => { await loadDefaultSources(); openSources(); toast('已恢复默认资讯源'); },

  // WS3
  'ws3-config': openWs3Config,
  'ws3-gen': saveWs3Plan,
  'ws3-check': (el) => openWs3Day(el.dataset.date || todayISO()),
  'ws3-undo': (el) => { state.ws3.checkins = state.ws3.checkins || {}; delete state.ws3.checkins[el.dataset.date]; save(); closeModal(); render(); toast('已撤销打卡'); },
  'ws3-day': (el) => openWs3Day(el.dataset.date),
  'ws3-session': (el) => openWs3Session(el.dataset.key, el.dataset.date),
  'ws3-light': (el) => openWs3Session('light', el.dataset.date || todayISO()),
  'ws3-save-day': (el) => { ws3SaveDay(el.dataset.date, el.dataset.key); closeModal(); render(); toast('打卡成功 ✓'); },
  'ws3-save-note': (el) => {
    const d = el.dataset.date;
    const note = (document.getElementById('n-note') || {}).value || '';
    state.ws3.checkins = state.ws3.checkins || {};
    state.ws3.checkins[d] = Object.assign({ done: true, at: Date.now() }, state.ws3.checkins[d], { note });
    save(); closeModal(); render(); toast('已保存');
  },
  'meal-shuffle': () => { state.ws3._meal = (state.ws3._meal || 0) + 1; save(); render(); toast('换一批推荐 🍽️'); },
  'ws3-ing-add': () => {
    const el = document.getElementById('ing-input');
    const ings = parseIngs(el ? el.value : '');
    if (!ings.length) return toast('先输入菜名，比如「鸡胸 西兰花」');
    state.ws3._ings = Array.from(new Set([...(state.ws3._ings || []), ...ings])).slice(0, 20);
    save(); render();
    const n = recommendMeals(state.ws3._ings).length;
    toast(n ? `按你的食材找到 ${n} 个做法 🍳` : '已记录，暂时没匹配到菜谱');
  },
  'ws3-ing-quick': (el) => {
    const name = el.dataset.name;
    state.ws3._ings = Array.from(new Set([...(state.ws3._ings || []), name])).slice(0, 20);
    save(); render();
  },
  'ws3-ing-del': (el) => {
    state.ws3._ings = (state.ws3._ings || []).filter((x) => x !== el.dataset.name);
    save(); render();
  },
  'ws3-ing-clear': () => { state.ws3._ings = []; save(); render(); },
  'ws3-cal': (el) => {
    const dir = Number(el.dataset.dir);
    const ym = state.ws3._cal || monthOf(todayISO());
    const [y, m] = ym.split('-').map(Number);
    const nd = new Date(y, m - 1 + dir, 1);
    state.ws3._cal = nd.getFullYear() + '-' + pad(nd.getMonth() + 1);
    render();
  },
  'save-profile': () => {
    state.profile.name = document.getElementById('p-name').value.trim();
    state.profile.dailyMinutes = Number(document.getElementById('p-mins').value) || 120;
    save(); toast('已保存');
  },
  export: () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lianba-backup-' + todayISO() + '.json';
    a.click(); URL.revokeObjectURL(a.href); toast('已导出');
  },
  reset: () => {
    if (!confirm('确定重置全部数据？此操作不可撤销。')) return;
    state = defaultState(); loadDefaultSources(); save(); render(); toast('已重置');
  },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  // checkbox 由 change 处理
  if (el.tagName === 'INPUT' && el.type === 'checkbox') return;
  e.preventDefault();
  try { fn(el, e); } catch (err) { console.error(err); toast('操作失败：' + err.message); }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.tagName === 'INPUT' && el.type === 'checkbox') { const fn = ACTIONS[el.dataset.action]; if (fn) fn(el, e); }
  if (el.id === 'import-file' && el.files && el.files[0]) {
    const fr = new FileReader();
    fr.onload = () => { try { state = Object.assign(defaultState(), JSON.parse(fr.result)); save(); render(); toast('导入成功'); } catch (err) { toast('导入失败：文件格式错误'); } };
    fr.readAsText(el.files[0]);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && e.target && e.target.id === 'ing-input') {
    e.preventDefault();
    const fn = ACTIONS['ws3-ing-add'];
    if (fn) fn({ dataset: {} });
  }
});

/* ---------------- modal ---------------- */
function openModal(html) { modalBox.innerHTML = html; modalEl.classList.remove('hidden'); }
function closeModal() { modalEl.classList.add('hidden'); modalBox.innerHTML = ''; }
modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeModal(); });

/* ---------------- boot ---------------- */
window.addEventListener('hashchange', render);
(async function boot() {
  const lk = document.getElementById('logoutLink');
  if (lk && !['127.0.0.1', 'localhost', ''].includes(location.hostname)) lk.classList.remove('hidden');
  await loadState();
  if (!location.hash) location.hash = '#/home';
  render();
  // 预热资讯（后台）
  ensureNews(false);
})();
})();
