// popup.js
'use strict';

const IC = {
  play:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  pause:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  muted:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`,
  unmuted: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
  skipB:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z"/></svg>`,
  skipF:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>`,
  prevV:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>`,
  nextV:   `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`,
  autoOn:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>`,
  autoOff: `<svg viewBox="0 0 24 24" fill="currentColor" opacity=".4"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>`,
  yt:      `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 7s-.3-1.8-1-2.6c-1-.9-2-.9-2.5-1C15.1 3.2 12 3.2 12 3.2s-3.1 0-5.5.2C6 3.5 5 3.5 4 4.4 3.3 5.2 3 7 3 7S2.7 9.1 2.7 11.2v1.9c0 2.1.3 4.2.3 4.2S3.3 19 4 19.8c1 .9 2.2.9 2.8 1 2 .2 8.5.2 8.5.2s3.1 0 5.5-.3c.5-.1 1.5-.1 2.5-1 .7-.8 1-2.6 1-2.6s.3-2.1.3-4.2v-1.9C21.3 9.1 21 7 21 7zm-12.5 8.5V9l6.5 3.3-6.5 3.2z"/></svg>`,
};

function fmt(sec) {
  if (!isFinite(sec) || isNaN(sec) || sec === 0) return '--:--';
  const s = Math.floor(sec), m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h > 0
    ? `${h}:${String(m % 60).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`
    : `${m}:${String(s % 60).padStart(2,'0')}`;
}
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function thumbUrl(url) {
  try { const v = new URL(url).searchParams.get('v'); return v ? `https://i.ytimg.com/vi/${v}/mqdefault.jpg` : null; }
  catch { return null; }
}

// ── 탭 통신 ──────────────────────────────────

async function sendMsg(tabId, payload) {
  try { return await chrome.tabs.sendMessage(tabId, payload); }
  catch { return null; }
}

async function getWatchTabs() {
  return chrome.tabs.query({ url: 'https://www.youtube.com/watch*' });
}

// 일반 inject
async function ensureInjected(tabId) {
  const pong = await sendMsg(tabId, { action: 'ping' });
  if (pong?.pong) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 200));
      const r = await sendMsg(tabId, { action: 'ping' });
      if (r?.pong) return true;
    }
  } catch {}
  return false;
}

// 탭 상태 조회
// content.js inject에 성공하면 실제 상태 반환,
// 실패하면(지연 복원 탭 등) URL에서 title만 뽑아서 "미로드" 상태로 반환
// → 탭을 한 번도 클릭하지 않아도 팝업에 표시됨
async function fetchState(tab) {
  const injected = await ensureInjected(tab.id);
  if (injected) {
    const r = await sendMsg(tab.id, { action: 'getState' });
    if (r?.found) return r;
  }
  // inject 실패 = 지연 복원 탭 → URL에서 제목 추출해서 표시만
  const title = decodeURIComponent(
    tab.title?.replace(/ - YouTube$/, '') || '로딩 전 탭'
  );
  return {
    found:       true,
    ready:       false,   // 컨트롤 비활성
    paused:      true,
    muted:       false,
    currentTime: 0,
    duration:    0,
    autoResume:  false,
    title,
  };
}

// ── 진행 바 틱 ───────────────────────────────
const registry = new Map();
let ticker = null;

function startTick() {
  stopTick();
  ticker = setInterval(async () => {
    if (!registry.size) return;
    await Promise.all([...registry.entries()].map(async ([id, { refs }]) => {
      if (!refs) return; // 미로드 탭 건너뜀
      const r = await sendMsg(id, { action: 'getTime' });
      if (r?.found && r.duration > 0) {
        refs.fill.style.width = Math.min(100, r.currentTime / r.duration * 100).toFixed(3) + '%';
        refs.cur.textContent  = fmt(r.currentTime);
      }
    }));
  }, 250);
}
function stopTick() {
  if (ticker) { clearInterval(ticker); ticker = null; }
}

// ── DOM 패치 ─────────────────────────────────
function patchCard(refs, state) {
  if (!refs) return; // 미로드 탭은 패치 불필요
  const playing    = !!state.ready && !state.paused;
  const muted      = !!state.muted;
  const autoResume = !!state.autoResume;
  const disabled   = !state.ready; // video 미로드 시 컨트롤 비활성

  refs.playBtn.innerHTML      = playing ? IC.pause : IC.play;
  refs.playBtn.disabled       = disabled;
  if (refs.titleEl && state.title) refs.titleEl.textContent = state.title;
  refs.dot.className          = playing ? 'dot playing' : 'dot';
  refs.statusText.textContent = !state.ready ? '로딩 중...' : (playing ? '재생 중' : '일시정지');
  refs.muteBtn.innerHTML      = muted ? IC.muted : IC.unmuted;
  refs.muteBtn.className      = muted ? 'btn btn-mute is-muted' : 'btn btn-mute';
  refs.muteBtn.disabled       = disabled;
  refs.autoBtn.innerHTML      = autoResume ? IC.autoOn : IC.autoOff;
  refs.autoBtn.className      = autoResume ? 'btn btn-auto is-on' : 'btn btn-auto';
  refs.autoBtn.title          = autoResume ? '자동재생 ON' : '자동재생 OFF';
  refs.dur.textContent        = fmt(state.duration);
  refs.duration               = state.duration;
}

// ── 카드 생성 ─────────────────────────────────
function createCard(tab, state) {
  const playing    = !!state.ready && !state.paused;
  const muted      = !!state.muted;
  const autoResume = !!state.autoResume;
  const disabled   = !state.ready;
  const pct        = (state.duration > 0)
    ? Math.min(100, state.currentTime / state.duration * 100) : 0;
  const thumb      = thumbUrl(tab.url);

  const card = document.createElement('div');
  card.className = 'tab-card';
  card.innerHTML = `
    <div class="tab-top">
      <div class="thumb-wrap">
        ${thumb ? `<img src="${esc(thumb)}" alt="" onerror="this.remove()">` : ''}
        <div class="thumb-fallback">${IC.yt}</div>
      </div>
      <div class="tab-meta">
        <div class="tab-title">${esc(state.title)}</div>
        <div class="tab-status">
          <div class="dot${playing ? ' playing' : ''}"></div>
          <span class="status-text">${!state.ready ? '로딩 중...' : (playing ? '재생 중' : '일시정지')}</span>
        </div>
      </div>
    </div>
    <div class="progress">
      <div class="times">
        <span class="cur">${fmt(state.currentTime)}</span>
        <span class="dur">${fmt(state.duration)}</span>
      </div>
      <div class="bar-bg">
        <div class="bar-fill" style="width:${pct.toFixed(3)}%"></div>
      </div>
    </div>
    <div class="controls">
      <button class="btn btn-auto${autoResume ? ' is-on' : ''}" title="${autoResume ? '자동재생 ON' : '자동재생 OFF'}">${autoResume ? IC.autoOn : IC.autoOff}</button>
      <button class="btn btn-prev-v" title="이전 영상" ${disabled ? 'disabled' : ''}>${IC.prevV}</button>
      <button class="btn btn-skip-b" title="-10초" ${disabled ? 'disabled' : ''}>${IC.skipB}</button>
      <button class="btn btn-play" ${disabled ? 'disabled' : ''}>${playing ? IC.pause : IC.play}</button>
      <button class="btn btn-skip-f" title="+10초" ${disabled ? 'disabled' : ''}>${IC.skipF}</button>
      <button class="btn btn-next-v" title="다음 영상" ${disabled ? 'disabled' : ''}>${IC.nextV}</button>
      <button class="btn btn-mute${muted ? ' is-muted' : ''}" ${disabled ? 'disabled' : ''}>${muted ? IC.muted : IC.unmuted}</button>
    </div>
  `;

  const refs = {
    playBtn:    card.querySelector('.btn-play'),
    dot:        card.querySelector('.dot'),
    statusText: card.querySelector('.status-text'),
    titleEl:    card.querySelector('.tab-title'),
    muteBtn:    card.querySelector('.btn-mute'),
    autoBtn:    card.querySelector('.btn-auto'),
    fill:       card.querySelector('.bar-fill'),
    cur:        card.querySelector('.cur'),
    dur:        card.querySelector('.dur'),
    barBg:      card.querySelector('.bar-bg'),
    duration:   state.duration,
  };

  card.querySelector('.tab-top').addEventListener('click', () => {
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  });

  refs.playBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const cur = await fetchState(tab);
    if (!cur?.ready) return;
    if (cur.paused) {
      const others = await getWatchTabs();
      await Promise.all(
        others.filter(t => t.id !== tab.id).map(async t => {
          await sendMsg(t.id, { action: 'pause' });
          const entry = registry.get(t.id);
          if (entry) {
            const s = await fetchState(t);
            if (s) patchCard(entry.refs, s);
          }
        })
      );
      await sendMsg(tab.id, { action: 'play' });
    } else {
      await sendMsg(tab.id, { action: 'pause' });
    }
    const next = await fetchState(tab);
    if (next) patchCard(refs, next);
  });

  card.querySelector('.btn-skip-b').addEventListener('click', async (e) => {
    e.stopPropagation();
    await sendMsg(tab.id, { action: 'skip', seconds: -10 });
  });
  card.querySelector('.btn-skip-f').addEventListener('click', async (e) => {
    e.stopPropagation();
    await sendMsg(tab.id, { action: 'skip', seconds: 10 });
  });
  card.querySelector('.btn-prev-v').addEventListener('click', async (e) => {
    e.stopPropagation();
    await sendMsg(tab.id, { action: 'prevVideo' });
  });
  card.querySelector('.btn-next-v').addEventListener('click', async (e) => {
    e.stopPropagation();
    await sendMsg(tab.id, { action: 'nextVideo' });
  });

  refs.muteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await sendMsg(tab.id, { action: 'toggleMute' });
    const next = await fetchState(tab);
    if (next) patchCard(refs, next);
  });

  refs.autoBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const cur = await fetchState(tab);
    if (!cur) return;
    await sendMsg(tab.id, { action: 'setAutoResume', enabled: !cur.autoResume });
    const next = await fetchState(tab);
    if (next) patchCard(refs, next);
  });

  refs.barBg.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!refs.duration) return;
    const rect  = refs.barBg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    await sendMsg(tab.id, { action: 'seek', to: ratio * refs.duration });
  });

  return { cardEl: card, refs };
}

// ── 메인 루프 ─────────────────────────────────
const root = document.getElementById('root');
let list = null;

async function tick() {
  const tabs = await getWatchTabs();

  const pairs = (await Promise.all(
    tabs.map(async t => ({ tab: t, state: await fetchState(t) }))
  )).filter(p => p.state !== null && p.state.ready);

  if (!pairs.length) {
    stopTick();
    registry.clear();
    list = null;
    root.innerHTML = `
      <div class="empty">
        <div class="icon">📺</div>
        <p>유튜브 영상 탭이 없어요.<br>영상 페이지를 열고 다시 클릭해보세요!</p>
      </div>`;
    return;
  }

  if (!list || !root.contains(list)) {
    stopTick();
    registry.clear();
    list = document.createElement('div');
    list.className = 'tabs-list';
    root.innerHTML = '';
    root.appendChild(list);
  }

  const incoming = new Set(pairs.map(p => p.tab.id));
  for (const [id, { cardEl }] of registry) {
    if (!incoming.has(id)) { cardEl.remove(); registry.delete(id); }
  }
  for (const { tab, state } of pairs) {
    if (registry.has(tab.id)) {
      const entry = registry.get(tab.id);
      // URL이 바뀌면 (다음/이전 영상 전환) 카드 전체 교체 → 썸네일·제목 갱신
      if (entry.url !== tab.url) {
        entry.cardEl.remove();
        registry.delete(tab.id);
        const { cardEl, refs } = createCard(tab, state);
        registry.set(tab.id, { cardEl, refs, url: tab.url });
        list.appendChild(cardEl);
      } else {
        patchCard(entry.refs, state);
      }
    } else {
      const { cardEl, refs } = createCard(tab, state);
      registry.set(tab.id, { cardEl, refs, url: tab.url });
      list.appendChild(cardEl);
    }
  }

  if (!ticker) startTick();
}

tick();
setInterval(tick, 2000);
