const LANES = [
  { key: 'a', label: 'A', color: '#41df78' },
  { key: 's', label: 'S', color: '#ef4058' },
  { key: 'j', label: 'J', color: '#ffd83d' },
  { key: 'k', label: 'K', color: '#39a8ff' },
  { key: 'l', label: 'L', color: '#ff8c32' },
];
const DEFAULT_BINDINGS = { lanes: ['KeyA', 'KeyS', 'KeyJ', 'KeyK', 'KeyL'], strum: 'Enter', special: 'Space' };
const DIFFICULTIES = { a: 'Easy', b: 'Medium', c: 'Hard', d: 'Expert' };
const NOTE_WINDOW = 1.35;
const SONG_LEAD_IN = 3;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadBindings() {
  try {
    const saved = JSON.parse(localStorage.gfBindings || 'null');
    if (Array.isArray(saved?.lanes) && saved.lanes.length === 5 && saved.lanes.every(Boolean) && saved.strum) {
      if (saved.strum === 'Space' && (!saved.special || saved.special === 'Enter')) return { ...saved, strum: 'Enter', special: 'Space' };
      return { ...saved, special: saved.special || DEFAULT_BINDINGS.special };
    }
  } catch {}
  return { lanes: [...DEFAULT_BINDINGS.lanes], strum: DEFAULT_BINDINGS.strum, special: DEFAULT_BINDINGS.special };
}

function loadVolume() { const value = Number(localStorage.gfVolume ?? 1); return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1; }

function bindingLabel(code) {
  if (code === 'Space') return 'SPACE';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return ({ ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' })[code] || code.replace(/(Left|Right)$/, ' $1').toUpperCase();
}

const state = {
  route: 'library', songs: [], filtered: [], selected: null, metadata: null,
  difficulty: 'b', mode: 'tap', player: null, playerReady: false, chart: null,
  running: false, paused: false, notes: [], score: 0, combo: 0, maxCombo: 0,
  hits: 0, misses: 0, health: 85, hitEffects: [], special: 0, specialActive: false, specialPhrases: new Map(), shakeUntil: 0,
  held: new Set(), animation: 0, lastTime: 0, room: null, roomPoll: null,
  roomStartAt: null, videoStarted: false, leadInUntil: 0, leadInRemaining: 0,
  bindings: loadBindings(), bindingCapture: null, volume: loadVolume(), nickname: localStorage.gfNick || 'Player',
};

window.onYouTubeIframeAPIReady = () => { state.playerReady = true; };
if (!window.YT) {
  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  document.head.append(script);
}

function shell(content, active = 'Play') {
  return `<header class="topbar">
    <button class="brand" data-route="library"><span class="brand-dot">▶</span><span>GUITAR <b>FLASH</b></span></button>
    <nav>${['Start', 'Play', 'Rankings', 'Multiplayer', 'Help'].map(label => `<button class="${active === label ? 'active' : ''}" data-route="${label.toLowerCase()}">${label}</button>`).join('')}</nav>
    <div class="live-pill"><i></i> LIVE BACKEND</div>
    <button class="profile" data-route="settings">${escapeHtml(state.nickname.slice(0, 2).toUpperCase())}</button>
  </header><main>${content}</main>`;
}

async function init() {
  renderLoading();
  try {
    const response = await fetch('/api/catalog');
    if (!response.ok) throw new Error('Catalog unavailable');
    state.songs = await response.json();
    state.filtered = state.songs;
    renderLibrary();
  } catch (error) {
    renderError(error.message);
  }
}

function renderLoading() {
  $('#app').innerHTML = shell(`<section class="center-state"><div class="loader"></div><h1>Loading the Guitar Flash library</h1><p>Connecting to the original song backend…</p></section>`, 'Start');
}

function renderError(message) {
  $('#app').innerHTML = shell(`<section class="center-state"><h1>Couldn’t reach the song library</h1><p>${escapeHtml(message)}</p><button class="primary" data-retry>Try again</button></section>`, 'Start');
  $('[data-retry]').onclick = init;
  bindNavigation();
}

function renderLibrary() {
  state.route = 'library'; stopGame();
  $('#app').innerHTML = shell(`<section class="hero">
    <div><span class="eyebrow">THE CLASSIC, WITHOUT FLASH</span><h1>Your next<br><em>encore starts here.</em></h1><p>${state.songs.length} original Guitar Flash charts, rebuilt around a low-latency canvas player and synchronized YouTube playback.</p><button class="primary" data-featured>Play My Sharona <span>→</span></button></div>
    <div class="hero-visual"><span class="pick">GF</span><div><strong>5 lanes</strong><small>One more song.</small></div></div>
  </section>
  <section class="library"><div class="section-title"><div><span class="eyebrow">SONG LIBRARY</span><h2>Choose your next set</h2></div><label class="search"><span>⌕</span><input type="search" placeholder="Search song or artist" aria-label="Search songs" /></label></div>
  <div class="song-grid" data-song-grid>${songCards(state.filtered.slice(0, 120))}</div><button class="load-more" data-more ${state.filtered.length <= 120 ? 'hidden' : ''}>Show more songs</button></section>`, 'Start');
  bindNavigation(); bindLibrary();
}

function songCards(songs) {
  return songs.map(song => `<button class="song-card" data-song="${song.id}">
    <span class="cover" style="--cover-hue:${(song.id * 47) % 360}deg"><b>${initials(song.title)}</b></span>
    <span class="song-copy"><strong>${escapeHtml(song.title)}</strong><small>${escapeHtml(song.artist)}</small><span><i>${Number(song.plays || 0).toLocaleString()} plays</i><i>Level ${song.level || 1}</i></span></span><span class="round-play">▶</span>
  </button>`).join('');
}

function bindLibrary() {
  let shown = 120;
  const search = $('.search input');
  search.oninput = () => {
    const query = search.value.trim().toLowerCase();
    state.filtered = state.songs.filter(song => `${song.title} ${song.artist}`.toLowerCase().includes(query));
    shown = 120; $('[data-song-grid]').innerHTML = songCards(state.filtered.slice(0, shown));
    $('[data-more]').hidden = state.filtered.length <= shown; bindSongCards();
  };
  $('[data-more]').onclick = () => { shown += 120; $('[data-song-grid]').innerHTML = songCards(state.filtered.slice(0, shown)); $('[data-more]').hidden = state.filtered.length <= shown; bindSongCards(); };
  $('[data-featured]').onclick = () => openSong(state.songs.find(song => song.id === 1723) || state.songs[0]);
  bindSongCards();
}

function bindSongCards() {
  $$('[data-song]').forEach(card => card.onclick = () => openSong(state.songs.find(song => song.id === Number(card.dataset.song))));
}

async function openSong(song) {
  if (!song) return;
  state.selected = song; state.route = 'song'; stopGame();
  $('#app').innerHTML = shell(`<section class="song-setup"><button class="back" data-back>← Library</button><div class="setup-grid"><div class="setup-art skeleton"></div><div class="setup-copy"><span class="eyebrow">NOW LOADING</span><h1>${escapeHtml(song.title)}</h1><p>${escapeHtml(song.artist)}</p><div class="loader small"></div></div></div></section>`, 'Play');
  bindNavigation(); $('[data-back]').onclick = renderLibrary;
  try {
    const response = await fetch(`/api/song/${song.id}`); state.metadata = await response.json();
    Object.assign(song, state.metadata);
    renderSongSetup();
  } catch { toast('This song could not be loaded.'); renderLibrary(); }
}

function renderSongSetup() {
  const song = state.selected;
  $('#app').innerHTML = shell(`<section class="song-setup"><button class="back" data-back>← Library</button><div class="setup-grid">
    <div class="setup-art" style="background-image:url('https://i.ytimg.com/vi/${song.video}/maxresdefault.jpg')"><span>ORIGINAL CHART</span></div>
    <div class="setup-copy"><span class="eyebrow">READY TO PLAY</span><h1>${escapeHtml(song.title)}</h1><p>${escapeHtml(song.artist)} · ${Number(song.plays || 0).toLocaleString()} plays</p>
      <fieldset><legend>Difficulty</legend><div class="segmented">${Object.entries(DIFFICULTIES).map(([key, label]) => `<button class="${state.difficulty === key ? 'selected' : ''}" data-difficulty="${key}">${label}</button>`).join('')}</div></fieldset>
      <fieldset><legend>Game style</legend><div class="segmented"><button class="${state.mode === 'tap' ? 'selected' : ''}" data-mode="tap">Tap</button><button class="${state.mode === 'strum' ? 'selected' : ''}" data-mode="strum">Tap + Strum</button></div></fieldset>
      <div class="setup-actions"><button class="primary large" data-start-song>Start song <span>▶</span></button></div>
    </div></div></section>`, 'Play');
  bindNavigation(); $('[data-back]').onclick = renderLibrary;
  $$('[data-difficulty]').forEach(button => button.onclick = () => { state.difficulty = button.dataset.difficulty; renderSongSetup(); });
  $$('[data-mode]').forEach(button => button.onclick = () => { state.mode = button.dataset.mode; renderSongSetup(); });
  $('[data-start-song]').onclick = loadGame;
}

async function loadGame() {
  $('#app').innerHTML = shell(`<section class="center-state dark"><div class="loader"></div><h1>Decrypting ${escapeHtml(state.selected.title)}</h1><p>Loading the ${DIFFICULTIES[state.difficulty]} chart…</p></section>`, 'Play'); bindNavigation();
  try {
    const response = await fetch(`/api/chart/${state.selected.id}/${state.difficulty}`);
    if (!response.ok) throw new Error((await response.json()).error || 'Chart unavailable');
    state.chart = await response.json(); state.notes = prepareNotes(state.chart.notes); prepareSpecialPhrases();
    renderGame();
  } catch (error) { toast(error.message); renderSongSetup(); }
}

function prepareNotes(chartNotes) {
  let phraseId = -1; let lastSpecialTime = -Infinity;
  const notes = chartNotes.map((note, index) => {
    if (note.special && note.time - lastSpecialTime > 2) phraseId++;
    if (note.special) lastSpecialTime = note.time;
    return { ...note, index, state: 'pending', specialPhrase: note.special ? phraseId : null };
  });
  let cluster = [];
  const finishCluster = () => {
    if (cluster.length > 1) cluster.at(-1).repeatCount = cluster.length;
    cluster = [];
  };
  notes.forEach(note => {
    const previous = cluster.at(-1);
    const continuesRepeat = previous
      && note.lane === previous.lane
      && note.duration <= .08
      && previous.duration <= .08
      && note.time - previous.time <= .3;
    if (!previous || continuesRepeat) cluster.push(note);
    else { finishCluster(); cluster.push(note); }
  });
  finishCluster();
  return notes;
}

function prepareSpecialPhrases() {
  state.specialPhrases = new Map();
  state.notes.filter(note => note.special).forEach(note => {
    const phrase = state.specialPhrases.get(note.specialPhrase) || { total: 0, hits: 0, failed: false, awarded: false };
    phrase.total++; state.specialPhrases.set(note.specialPhrase, phrase);
  });
}

function renderGame() {
  state.route = 'game'; resetScore();
  $('#app').innerHTML = `<section class="game-shell"><div class="game-top"><button class="brand compact" data-exit><span class="brand-dot">▶</span><span>GUITAR <b>FLASH</b></span></button><div class="now-playing"><strong>${escapeHtml(state.selected.title)}</strong><span>${escapeHtml(state.selected.artist)} · ${DIFFICULTIES[state.difficulty]}</span></div><div class="hud"><label class="crowd">CROWD<span><i data-health></i></span></label><div class="special-hud" data-special-hud><small>SPECIAL · ${escapeHtml(bindingLabel(state.bindings.special))}</small><button data-use-special title="Activate special"><span><i data-special-fill></i></span><b data-special-value>0%</b></button></div><label>SCORE<strong data-score>0</strong></label><button data-pause>Ⅱ</button></div></div>
    <div class="game-body"><div class="video-panel"><div id="youtube-player"></div><div class="sync-badge">Original Guitar Flash synchronization</div></div><div class="canvas-wrap"><canvas id="highway" width="1280" height="720"></canvas><div class="center-combo"><span>COMBO</span><strong data-combo>0×</strong></div><div class="game-overlay" data-game-overlay><span class="eyebrow">${state.mode === 'tap' ? 'TAP MODE' : 'TAP + STRUM MODE'}</span><h1>${escapeHtml(state.selected.title)}</h1><p>${state.mode === 'tap' ? 'Press your five lane keys when notes cross the targets.' : `Hold your lane keys, then press ${escapeHtml(bindingLabel(state.bindings.strum))} to strum.`}</p><div class="key-help">${state.bindings.lanes.map(code => `<kbd>${escapeHtml(bindingLabel(code))}</kbd>`).join('')}${state.mode === 'strum' ? `<kbd class="space">${escapeHtml(bindingLabel(state.bindings.strum))}</kbd>` : ''}<kbd class="special-key">SPECIAL · ${escapeHtml(bindingLabel(state.bindings.special))}</kbd></div><button class="primary large" data-begin>Begin</button></div><div class="judgement" data-judgement></div></div></div>
  </section>`;
  $('[data-exit]').onclick = () => { stopGame(); renderSongSetup(); };
  $('[data-pause]').onclick = togglePause;
  $('[data-use-special]').onclick = activateSpecial;
  $('[data-begin]').onclick = beginPlayback;
  setupYouTube(); drawFrame(0);
  if (state.roomStartAt) scheduleRoomStart();
}

async function scheduleRoomStart() {
  while (state.route === 'game' && (!state.playerReady || Date.now() < state.roomStartAt - SONG_LEAD_IN * 1000 - 2100)) await sleep(100);
  if (state.route === 'game' && !state.running && $('[data-begin]')) beginPlayback();
  state.roomStartAt = null;
}

function setupYouTube() {
  state.playerReady = false;
  const create = () => {
    state.player?.destroy?.();
    state.player = new YT.Player('youtube-player', { videoId: state.selected.video, width: '100%', height: '100%', playerVars: { controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, playsinline: 1 }, events: { onReady: event => { event.target.setVolume(Math.round(state.volume * 100)); state.playerReady = true; }, onError: () => toast('YouTube could not play this video.') } });
  };
  if (window.YT?.Player) create(); else { const wait = setInterval(() => { if (window.YT?.Player) { clearInterval(wait); create(); } }, 100); }
}

async function beginPlayback() {
  if (!state.playerReady) { toast('The video is still loading.'); return; }
  $('[data-game-overlay]').innerHTML = '<div class="countdown">3</div>';
  for (const number of [3, 2, 1]) { $('.countdown').textContent = number; await sleep(650); }
  $('[data-game-overlay]').remove(); state.player.seekTo(0, true); state.player.pauseVideo();
  state.running = true; state.paused = false; state.videoStarted = false; state.leadInRemaining = SONG_LEAD_IN;
  state.lastTime = performance.now(); state.leadInUntil = state.lastTime + SONG_LEAD_IN * 1000; state.animation = requestAnimationFrame(gameLoop);
}

function songTime() {
  if (!state.player?.getCurrentTime) return 0;
  if (!state.videoStarted) return Number(state.selected.sync || 0) - Math.max(0, (state.leadInUntil - performance.now()) / 1000);
  return state.player.getCurrentTime() + Number(state.selected.sync || 0);
}

function gameLoop() {
  if (!state.running || state.paused) return;
  const now = performance.now(); const delta = Math.min(.05, Math.max(0, (now - state.lastTime) / 1000)); state.lastTime = now;
  if (!state.videoStarted && now >= state.leadInUntil) { state.videoStarted = true; state.leadInRemaining = 0; state.player.playVideo(); }
  updateSpecial(delta); const time = songTime();
  markMisses(time); scoreSustains(time); drawFrame(time); updateHud(); broadcastScore(time);
  if (time > state.chart.length + 1 || state.health <= 0) return finishGame();
  state.animation = requestAnimationFrame(gameLoop);
}

function attemptHit(lane) {
  if (!state.running || state.paused) return;
  const time = songTime();
  const candidates = state.notes.filter(note => note.state === 'pending' && note.lane === lane && Math.abs(note.time - time) <= .19).sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time));
  if (!candidates.length) { state.combo = 0; state.health = Math.max(0, state.health - 1.5); showJudge('MISS', '#ff405a'); return; }
  const anchor = candidates[0];
  const chord = state.notes.filter(note => note.state === 'pending' && Math.abs(note.time - anchor.time) < .012);
  const heldChord = chord.filter(note => state.held.has(note.lane) || note.lane === lane);
  if (chord.length > 1 && heldChord.length < chord.length) return;
  const delta = Math.abs(anchor.time - time); const grade = delta <= .055 ? 'PERFECT' : delta <= .105 ? 'GREAT' : 'GOOD';
  const points = grade === 'PERFECT' ? 1000 : grade === 'GREAT' ? 700 : 450;
  const hitAt = performance.now();
  let specialAwarded = false;
  chord.forEach(note => { note.state = note.duration > .08 ? 'holding' : 'hit'; note.hitAt = hitAt; state.hitEffects.push({ lane: note.lane, started: hitAt, color: note.special ? '#83f7ff' : LANES[note.lane].color, specialPhrase: note.specialPhrase }); if (registerSpecialHit(note)) specialAwarded = true; });
  state.combo += chord.length; state.maxCombo = Math.max(state.maxCombo, state.combo); state.hits += chord.length;
  state.score += points * chord.length * multiplier(); state.health = Math.min(100, state.health + 1.5 * chord.length);
  if (specialAwarded) { toast('Special phrase complete · +25%'); updateHud(); }
}

function markMisses(time) {
  state.notes.forEach(note => { if (note.state === 'pending' && time - note.time > .2) { note.state = 'miss'; failSpecialPhrase(note); state.misses++; state.combo = 0; state.health = Math.max(0, state.health - 4); showJudge('MISS', '#ff405a'); } });
}

function scoreSustains(time) {
  state.notes.forEach(note => { if (note.state === 'holding') { if (!state.held.has(note.lane)) { note.state = 'released'; failSpecialPhrase(note); } else if (time >= note.time + note.duration) { note.state = 'hit'; note.hitAt = performance.now(); state.hitEffects.push({ lane: note.lane, started: note.hitAt, color: note.special ? '#83f7ff' : LANES[note.lane].color, specialPhrase: note.specialPhrase }); state.score += Math.round(note.duration * 500 * multiplier()); } } });
}

function registerSpecialHit(note) {
  if (!note.special) return false;
  const phrase = state.specialPhrases.get(note.specialPhrase); if (!phrase || phrase.failed || phrase.awarded) return false;
  phrase.hits++;
  if (phrase.hits < phrase.total) return false;
  phrase.awarded = true; state.special = Math.min(100, state.special + 25); state.shakeUntil = performance.now() + 280; return true;
}

function failSpecialPhrase(note) { if (note.special) { const phrase = state.specialPhrases.get(note.specialPhrase); if (phrase && !phrase.awarded && !phrase.failed) { phrase.failed = true; state.hitEffects = state.hitEffects.filter(effect => effect.specialPhrase !== note.specialPhrase); } } }
function hasSpecialVisual(note) { return Boolean(note.special && !state.specialPhrases.get(note.specialPhrase)?.failed); }
function activateSpecial() { if (!state.running || state.paused || state.specialActive) return; if (state.special < 50) { toast('Complete special phrases until the meter reaches 50%.'); return; } state.specialActive = true; showJudge('SPECIAL!', '#83f7ff'); updateHud(); }
function updateSpecial(delta) { if (!state.specialActive) return; state.special = Math.max(0, state.special - delta * 12.5); if (state.special <= 0) { state.specialActive = false; showJudge('SPECIAL END', '#83f7ff'); } }
function multiplier() { return Math.min(4, 1 + Math.floor(state.combo / 10)) * (state.specialActive ? 2 : 1); }

function drawFrame(time) {
  const canvas = $('#highway'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width; const h = canvas.height; const center = w / 2; const now = performance.now();
  const topY = 28; const hitY = h - 108; const bottomY = h + 24; const trackWidth = 760;
  const left = center - trackWidth / 2; const laneWidth = trackWidth / 5;
  const approach = NOTE_WINDOW;
  const project = (eventTime, lane = 2) => {
    const rawDepth = 1 - (eventTime - time) / approach;
    const depth = Math.max(0, Math.min(1, rawDepth));
    return { rawDepth, depth, x: left + laneWidth * (lane + .5), y: topY + (hitY - topY) * Math.pow(Math.max(0, rawDepth), 1.02) };
  };

  ctx.clearRect(0, 0, w, h);
  const shakeLeft = Math.max(0, state.shakeUntil - now); ctx.save();
  if (shakeLeft) { const strength = 4 * shakeLeft / 280; ctx.translate(Math.sin(now * .17) * strength, Math.cos(now * .21) * strength * .7); }
  const stage = ctx.createRadialGradient(center, hitY, 20, center, h * .48, h * .9);
  stage.addColorStop(0, state.specialActive ? '#0b7188' : '#192a45'); stage.addColorStop(.45, state.specialActive ? '#092b38' : '#0a1220'); stage.addColorStop(1, '#020307');
  ctx.fillStyle = stage; ctx.fillRect(0, 0, w, h);
  LANES.forEach((lane, index) => {
    const glowX = left + laneWidth * (index + .5); const glow = ctx.createRadialGradient(glowX, hitY, 0, glowX, hitY, 230);
    glow.addColorStop(0, `${lane.color}22`); glow.addColorStop(1, `${lane.color}00`); ctx.fillStyle = glow; ctx.fillRect(glowX - 240, hitY - 240, 480, 480);
  });
  for (let streak = 0; streak < 14; streak++) {
    const y = ((streak * 91 + time * 145) % (h + 120)) - 60; const x = (streak * 173) % w;
    ctx.fillStyle = `rgba(130,170,230,${.025 + (streak % 3) * .012})`; ctx.fillRect(x, y, 2, 42);
  }

  ctx.save(); ctx.shadowBlur = state.specialActive ? 42 : 28; ctx.shadowColor = state.specialActive ? '#56efff' : '#000';
  ctx.fillStyle = state.specialActive ? 'rgba(2,22,29,.96)' : 'rgba(3,6,12,.97)'; ctx.beginPath(); ctx.roundRect(left, topY, trackWidth, bottomY - topY, 18); ctx.fill(); ctx.restore();
  LANES.forEach((lane, index) => {
    const x = left + laneWidth * index; const bed = ctx.createLinearGradient(0, topY, 0, bottomY);
    bed.addColorStop(0, '#050811'); bed.addColorStop(.55, `${lane.color}0c`); bed.addColorStop(1, `${lane.color}22`);
    ctx.fillStyle = bed; ctx.fillRect(x + 2, topY + 2, laneWidth - 4, bottomY - topY - 2);
    const railX = x + laneWidth / 2; ctx.strokeStyle = `${lane.color}18`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(railX, topY); ctx.lineTo(railX, hitY); ctx.stroke();
  });
  for (let edge = 0; edge <= 5; edge++) { const x = left + laneWidth * edge; ctx.save(); ctx.shadowBlur = edge === 0 || edge === 5 ? 16 : 5; ctx.shadowColor = state.specialActive ? '#83f7ff' : '#64748b'; ctx.strokeStyle = edge === 0 || edge === 5 ? (state.specialActive ? '#83f7ff' : '#728099') : 'rgba(150,170,205,.18)'; ctx.lineWidth = edge === 0 || edge === 5 ? 4 : 2; ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x, bottomY); ctx.stroke(); ctx.restore(); }

  const firstGrid = Math.ceil(time * 2) / 2;
  for (let gridTime = firstGrid; gridTime <= time + approach; gridTime += .5) {
    const point = project(gridTime);
    const wholeSecond = Math.abs(gridTime - Math.round(gridTime)) < .01;
    ctx.save(); ctx.shadowBlur = wholeSecond ? 9 : 0; ctx.shadowColor = state.specialActive ? '#83f7ff' : '#8ea4c8';
    ctx.strokeStyle = wholeSecond ? (state.specialActive ? 'rgba(131,247,255,.34)' : 'rgba(180,205,245,.22)') : 'rgba(180,205,245,.075)'; ctx.lineWidth = wholeSecond ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(left + 4, point.y); ctx.lineTo(left + trackWidth - 4, point.y); ctx.stroke(); ctx.restore();
    if (wholeSecond) { ctx.fillStyle = state.specialActive ? '#83f7ff' : '#8494ae'; ctx.fillRect(left - 8, point.y - 2, 12, 4); ctx.fillRect(left + trackWidth - 4, point.y - 2, 12, 4); }
  }

  state.notes.forEach(note => {
    const specialVisual = hasSpecialVisual(note);
    if (note.state === 'hit') {
      const progress = Math.min(1, (performance.now() - (note.hitAt || 0)) / 230);
      if (progress < 1) {
        const impact = project(time, note.lane); const radius = 42 * (1 - progress * .7);
        const hitColor = specialVisual ? '#83f7ff' : LANES[note.lane].color;
        ctx.save(); ctx.globalAlpha = 1 - progress; ctx.shadowBlur = 32; ctx.shadowColor = hitColor; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.ellipse(impact.x, impact.y, radius * 1.2, Math.max(2, radius * .42), 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      return;
    }
    if (['miss', 'released'].includes(note.state)) return;
    const head = project(note.time, note.lane);
    if (head.rawDepth < -.04 || head.rawDepth > 1.18) return;
    const visibleHead = head.rawDepth > 1 && note.state === 'holding' ? project(time, note.lane) : head;
    const noteWidth = 32 + 12 * Math.sqrt(visibleHead.depth); const noteHeight = 13 + 6 * Math.sqrt(visibleHead.depth); const color = LANES[note.lane].color;
    if (note.duration > .08) {
      const tail = project(note.time + note.duration, note.lane);
      ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#020409'; ctx.lineWidth = 22; ctx.beginPath(); ctx.moveTo(visibleHead.x, visibleHead.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
      ctx.shadowBlur = 18; ctx.shadowColor = specialVisual ? '#83f7ff' : color; ctx.strokeStyle = specialVisual ? '#83f7ff' : color; ctx.globalAlpha = specialVisual ? .82 : .58; ctx.lineWidth = 12; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.globalAlpha = .22; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.shadowBlur = specialVisual ? 34 : 24; ctx.shadowColor = specialVisual ? '#83f7ff' : color;
    ctx.fillStyle = '#020308'; ctx.beginPath(); ctx.ellipse(visibleHead.x, visibleHead.y + 5, noteWidth + 7, noteHeight + 5, 0, 0, Math.PI * 2); ctx.fill();
    const gem = ctx.createLinearGradient(0, visibleHead.y - noteHeight, 0, visibleHead.y + noteHeight); gem.addColorStop(0, '#fff'); gem.addColorStop(.18, specialVisual ? '#d8fdff' : color); gem.addColorStop(.62, color); gem.addColorStop(1, '#141722');
    ctx.fillStyle = gem; ctx.beginPath(); ctx.ellipse(visibleHead.x, visibleHead.y, noteWidth, noteHeight, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = specialVisual ? '#83f7ff' : color; ctx.lineWidth = specialVisual ? 6 : 4; ctx.stroke();
    ctx.globalAlpha = .7; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(visibleHead.x - noteWidth * .22, visibleHead.y - noteHeight * .38, noteWidth * .32, Math.max(2, noteHeight * .16), -.08, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    if (specialVisual) { ctx.fillStyle = '#071218'; ctx.font = `900 ${Math.max(12, noteHeight)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', visibleHead.x, visibleHead.y + 1); }
    if (note.repeatCount) { const badgeX = visibleHead.x + noteWidth + 12; const badgeY = visibleHead.y - noteHeight - 5; ctx.fillStyle = '#05070c'; ctx.beginPath(); ctx.arc(badgeX, badgeY, 14, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${note.repeatCount}×`, badgeX, badgeY + .5); }
    ctx.restore();
  });

  const targetWidth = trackWidth; const targetLaneWidth = laneWidth;
  ctx.save(); ctx.shadowBlur = 24; ctx.shadowColor = state.specialActive ? '#83f7ff' : '#dce8ff'; ctx.fillStyle = state.specialActive ? '#83f7ff' : '#dce8ff'; ctx.fillRect(left - 12, hitY - 3, trackWidth + 24, 6); ctx.restore();
  LANES.forEach((lane, index) => {
    const x = left + laneWidth * (index + .5); const held = state.held.has(index);
    ctx.save(); ctx.shadowBlur = held ? 38 : 20; ctx.shadowColor = lane.color; ctx.fillStyle = '#050811'; ctx.beginPath(); ctx.roundRect(x - 58, hitY - 27, 116, 54, 22); ctx.fill();
    const targetGem = ctx.createLinearGradient(0, hitY - 24, 0, hitY + 24); targetGem.addColorStop(0, held ? '#fff' : `${lane.color}aa`); targetGem.addColorStop(.38, held ? lane.color : '#111724'); targetGem.addColorStop(1, '#03050a');
    ctx.fillStyle = targetGem; ctx.beginPath(); ctx.roundRect(x - 51, hitY - 21, 102, 42, 18); ctx.fill(); ctx.strokeStyle = lane.color; ctx.lineWidth = held ? 7 : 5; ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = '800 19px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(bindingLabel(state.bindings.lanes[index]), x, hitY + 1); ctx.restore();
  });

  const effectNow = performance.now();
  state.hitEffects = state.hitEffects.filter(effect => effectNow - effect.started < 360);
  state.hitEffects.forEach(effect => {
    const progress = (effectNow - effect.started) / 360; const x = left + targetLaneWidth * (effect.lane + .5);
    ctx.save(); ctx.globalAlpha = 1 - progress; ctx.strokeStyle = effect.color; ctx.lineWidth = 7 * (1 - progress) + 1;
    ctx.shadowBlur = 24; ctx.shadowColor = effect.color; ctx.beginPath(); ctx.ellipse(x, hitY, 42 + progress * 55, 17 + progress * 24, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = effect.color; ctx.shadowBlur = 12;
    for (let particle = 0; particle < 7; particle++) { const angle = Math.PI * (1.08 + particle * .14); const distance = 18 + progress * 74; const px = x + Math.cos(angle) * distance; const py = hitY + Math.sin(angle) * distance; const size = 5 * (1 - progress) + 1; ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  });
  if (state.specialActive) { ctx.save(); ctx.globalAlpha = .08; ctx.fillStyle = '#83f7ff'; for (let y = topY + ((now / 12) % 18); y < hitY; y += 18) ctx.fillRect(left, y, trackWidth, 1); ctx.restore(); }
  ctx.restore();
}

function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused; $('[data-pause]').textContent = state.paused ? '▶' : 'Ⅱ';
  if (state.paused) {
    if (!state.videoStarted) state.leadInRemaining = Math.max(0, (state.leadInUntil - performance.now()) / 1000);
    state.player.pauseVideo(); cancelAnimationFrame(state.animation);
  } else {
    state.lastTime = performance.now();
    if (state.videoStarted) state.player.playVideo(); else state.leadInUntil = state.lastTime + state.leadInRemaining * 1000;
    state.animation = requestAnimationFrame(gameLoop);
  }
}

function finishGame() {
  state.running = false; cancelAnimationFrame(state.animation); state.player?.pauseVideo?.();
  const total = state.hits + state.misses; const accuracy = total ? state.hits / total * 100 : 0; const grade = accuracy >= 98 ? 'S' : accuracy >= 92 ? 'A' : accuracy >= 82 ? 'B' : accuracy >= 70 ? 'C' : 'D';
  fetch('/api/scores', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: state.nickname, songId: state.selected.id, title: state.selected.title, difficulty: state.difficulty, score: state.score, accuracy, maxCombo: state.maxCombo }) }).catch(() => {});
  $('.canvas-wrap').insertAdjacentHTML('beforeend', `<div class="game-overlay results"><span class="eyebrow">SET COMPLETE</span><div class="grade">${grade}</div><h1>${state.score.toLocaleString()}</h1><div class="result-stats"><span><b>${accuracy.toFixed(1)}%</b>Accuracy</span><span><b>${state.maxCombo}×</b>Max combo</span><span><b>${state.hits}</b>Notes hit</span></div><div><button class="primary" data-retry-song>Play again</button><button class="secondary" data-results-exit>Song menu</button></div></div>`);
  $('[data-retry-song]').onclick = loadGame; $('[data-results-exit]').onclick = renderSongSetup;
}

function resetScore() { Object.assign(state, { running: false, paused: false, videoStarted: false, leadInUntil: 0, leadInRemaining: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0, health: 85, hitEffects: [], special: 0, specialActive: false, shakeUntil: 0 }); state.held.clear(); }
function stopGame() { state.running = false; cancelAnimationFrame(state.animation); try { state.player?.stopVideo?.(); state.player?.destroy?.(); } catch {} state.player = null; }
function updateHud() { $('[data-score]') && ($('[data-score]').textContent = Math.round(state.score).toLocaleString()); $('[data-combo]') && ($('[data-combo]').textContent = `${state.combo}×`); $('[data-health]') && ($('[data-health]').style.width = `${state.health}%`); if ($('[data-special-fill]')) { $('[data-special-fill]').style.width = `${state.special}%`; $('[data-special-value]').textContent = `${Math.round(state.special)}%`; $('[data-special-hud]').classList.toggle('ready', state.special >= 50 && !state.specialActive); $('[data-special-hud]').classList.toggle('active', state.specialActive); } }
function showJudge(text, color) { const node = $('[data-judgement]'); if (!node) return; node.getAnimations().forEach(animation => animation.cancel()); node.textContent = text; node.style.color = color; node.animate([{ opacity: 0, transform: 'translate(-50%,20px) scale(.65)' }, { opacity: 1, offset: .18, transform: 'translate(-50%,-4px) scale(1.14)' }, { opacity: 1, offset: .58, transform: 'translate(-50%,-12px) scale(1)' }, { opacity: 0, transform: 'translate(-50%,-58px) scale(.9)' }], { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }); }

function renderRankings() {
  state.route = 'rankings'; stopGame();
  $('#app').innerHTML = shell(`<section class="content-page"><span class="eyebrow">LOCAL COMMUNITY</span><h1>Recent high scores</h1><div class="ranking-list"><div class="loader small"></div></div></section>`, 'Rankings'); bindNavigation();
  fetch('/api/scores').then(r => r.json()).then(scores => { $('.ranking-list').innerHTML = scores.length ? scores.map((score, i) => `<div><b>${i + 1}</b><span><strong>${escapeHtml(score.nickname)}</strong><small>${escapeHtml(score.title)} · ${DIFFICULTIES[score.difficulty]}</small></span><em>${Number(score.score).toLocaleString()}</em></div>`).join('') : '<p>No scores yet. Be the first on the board.</p>'; });
}

function renderMultiplayer() {
  state.route = 'multiplayer'; stopGame();
  $('#app').innerHTML = shell(`<section class="content-page multi"><span class="eyebrow">LIVE ROOMS</span><h1>Play together</h1><p>Create a room, share its six-letter code, and race on the same song and difficulty.</p><div class="multi-actions"><button class="primary" data-create-room>Create room</button><form data-join-room><input name="code" maxlength="6" placeholder="ROOM CODE" required /><button class="secondary">Join room</button></form></div><div class="rooms" data-rooms><div class="loader small"></div></div></section>`, 'Multiplayer'); bindNavigation(); refreshRooms();
  $('[data-create-room]').onclick = createRoom; $('[data-join-room]').onsubmit = event => { event.preventDefault(); joinRoom(new FormData(event.currentTarget).get('code')); };
}

async function refreshRooms() { const rooms = await fetch('/api/rooms').then(r => r.json()); $('[data-rooms]').innerHTML = rooms.length ? rooms.map(room => `<button data-room="${room.code}"><span><strong>${room.code}</strong><small>${escapeHtml(room.song || 'Waiting for host')}</small></span><em>${room.players} / 8</em></button>`).join('') : '<p>No public rooms yet.</p>'; $$('[data-room]').forEach(b => b.onclick = () => joinRoom(b.dataset.room)); }
async function createRoom() { const room = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: state.nickname }) }).then(r => r.json()); showRoom(room, true); }
async function joinRoom(code) { const response = await fetch(`/api/rooms/${String(code).toUpperCase()}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: state.nickname }) }); if (!response.ok) return toast('Room not found or full.'); showRoom(await response.json(), false); }
function showRoom(room, isHost) { state.room = { ...room, isHost, lastStart: null }; $('.content-page').innerHTML = `<button class="back" data-leave-room>← Leave</button><span class="eyebrow">MULTIPLAYER LOBBY</span><h1>Room ${room.code}</h1><p>Share this code with friends. Scores update live while everyone plays.</p><div class="room-panel"><div><h2>Players</h2><div data-players></div></div><div><h2>Match</h2><p>${state.selected ? `${escapeHtml(state.selected.title)} · ${DIFFICULTIES[state.difficulty]}` : 'Pick a song from the library, then return here.'}</p>${isHost && state.selected ? '<button class="primary" data-room-start>Start match</button>' : '<span class="waiting">Waiting for host…</span>'}</div></div>`; $('[data-leave-room]').onclick = leaveRoom; if ($('[data-room-start]')) $('[data-room-start]').onclick = async () => { $('[data-room-start]').disabled = true; await fetch(`/api/rooms/${room.code}/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ song: state.selected, difficulty: state.difficulty }) }); }; connectRoom(room.code); }
function leaveRoom() { clearInterval(state.roomPoll); state.roomPoll = null; state.room = null; state.roomStartAt = null; renderMultiplayer(); }
function connectRoom(code) { clearInterval(state.roomPoll); const poll = async () => { try { const response = await fetch(`/api/rooms/${code}`, { cache: 'no-store' }); if (!response.ok) return; const data = await response.json(); if ($('[data-players]')) $('[data-players]').innerHTML = data.players.map(player => `<div class="player-row"><strong>${escapeHtml(player.nickname)}</strong><em>${Number(player.score || 0).toLocaleString()}</em></div>`).join(''); if (data.startsAt && data.startsAt !== state.room?.lastStart && Date.now() < data.startsAt + 4000) { state.room.lastStart = data.startsAt; state.selected = data.song; state.difficulty = data.difficulty; state.roomStartAt = data.startsAt; loadGame(); } } catch {} }; poll(); state.roomPoll = setInterval(poll, 700); }
let lastBroadcast = 0; function broadcastScore(time) { if (!state.room || performance.now() - lastBroadcast < 500) return; lastBroadcast = performance.now(); fetch(`/api/rooms/${state.room.code}/score`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: state.nickname, score: state.score, combo: state.combo, time }) }).catch(() => {}); }

function renderSettings() {
  state.route = 'settings'; state.bindingCapture = null; stopGame();
  $('#app').innerHTML = shell(`<section class="content-page settings"><span class="eyebrow">PLAYER SETTINGS</span><h1>Make it yours</h1>
    <label>Nickname<input data-nickname maxlength="18" value="${escapeHtml(state.nickname)}" /></label>
    <label>Volume multiplier<input data-volume type="range" min="0" max="1" step="0.05" value="${state.volume}" /><output data-volume-output>${state.volume.toFixed(2)}×</output></label>
    <section class="binding-settings"><div><h2>Game controls</h2><p>Select a control, then press the key you want to use.</p></div>
      ${LANES.map((lane, index) => `<div class="binding-row"><span><i style="background:${lane.color}"></i>Lane ${index + 1}</span><button class="binding-key" data-binding-lane="${index}">${escapeHtml(bindingLabel(state.bindings.lanes[index]))}</button></div>`).join('')}
      <div class="binding-row"><span>Strum</span><button class="binding-key" data-binding-strum>${escapeHtml(bindingLabel(state.bindings.strum))}</button></div>
      <div class="binding-row"><span>Activate special</span><button class="binding-key" data-binding-special>${escapeHtml(bindingLabel(state.bindings.special))}</button></div>
      <button class="reset-bindings" data-reset-bindings>Reset default controls</button>
    </section>
    <button class="primary" data-save-settings>Save settings</button></section>`, '');
  bindNavigation();
  $('[data-volume]').oninput = event => { $('[data-volume-output]').textContent = `${Number(event.target.value).toFixed(2)}×`; };
  $$('[data-binding-lane]').forEach(button => button.onclick = () => beginBindingCapture(button, { type: 'lane', index: Number(button.dataset.bindingLane) }));
  $('[data-binding-strum]').onclick = event => beginBindingCapture(event.currentTarget, { type: 'strum' });
  $('[data-binding-special]').onclick = event => beginBindingCapture(event.currentTarget, { type: 'special' });
  $('[data-reset-bindings]').onclick = () => { state.bindings = { lanes: [...DEFAULT_BINDINGS.lanes], strum: DEFAULT_BINDINGS.strum, special: DEFAULT_BINDINGS.special }; renderSettings(); };
  $('[data-save-settings]').onclick = () => {
    state.nickname = $('[data-nickname]').value.trim() || 'Player'; state.volume = Number($('[data-volume]').value);
    localStorage.gfNick = state.nickname; localStorage.gfVolume = state.volume; localStorage.gfBindings = JSON.stringify(state.bindings);
    toast('Settings saved.'); renderLibrary();
  };
}

function beginBindingCapture(button, control) {
  if (state.bindingCapture?.button) {
    state.bindingCapture.button.textContent = state.bindingCapture.previous;
    state.bindingCapture.button.classList.remove('listening');
  }
  state.bindingCapture = { ...control, button, previous: button.textContent };
  button.textContent = 'PRESS A KEY'; button.classList.add('listening'); button.focus();
}

function bindNavigation() { $$('[data-route]').forEach(button => button.onclick = () => { const route = button.dataset.route; if (['start', 'play', 'library'].includes(route)) renderLibrary(); else if (route === 'rankings') renderRankings(); else if (route === 'multiplayer') renderMultiplayer(); else if (route === 'settings') renderSettings(); else toast(`Lane keys: ${state.bindings.lanes.map(bindingLabel).join(' ')}. ${bindingLabel(state.bindings.strum)} strums; ${bindingLabel(state.bindings.special)} activates special.`); }); }
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 2600); }
function initials(title) { return title.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase(); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }

function isTextEntry(target) { return target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable); }

addEventListener('keydown', event => {
  if (state.bindingCapture) {
    event.preventDefault(); event.stopPropagation();
    const capture = state.bindingCapture;
    if (event.code === 'Escape') { capture.button.textContent = capture.previous; capture.button.classList.remove('listening'); state.bindingCapture = null; return; }
    if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(event.code)) { toast('Choose a non-modifier key.'); return; }
    const assigned = [...state.bindings.lanes, state.bindings.strum, state.bindings.special]; const ownIndex = capture.type === 'lane' ? capture.index : capture.type === 'strum' ? 5 : 6;
    const used = assigned.filter((code, index) => index !== ownIndex);
    if (used.includes(event.code)) { toast('That key is already assigned.'); return; }
    if (capture.type === 'lane') state.bindings.lanes[capture.index] = event.code; else state.bindings[capture.type] = event.code;
    capture.button.textContent = bindingLabel(event.code); capture.button.classList.remove('listening'); state.bindingCapture = null; return;
  }
  if (isTextEntry(event.target)) return;
  if (state.running && event.code === state.bindings.special && !event.repeat) { event.preventDefault(); activateSpecial(); return; }
  const lane = state.bindings.lanes.indexOf(event.code);
  if (lane >= 0) { event.preventDefault(); state.held.add(lane); if (!event.repeat && state.mode === 'tap') attemptHit(lane); drawFrame(songTime()); }
  else if (event.code === state.bindings.strum && state.mode === 'strum' && !event.repeat) { event.preventDefault(); const heldLane = [...state.held][0]; if (heldLane !== undefined) attemptHit(heldLane); }
  else if (event.key === 'Escape' && state.running) togglePause();
});
addEventListener('keyup', event => { if (isTextEntry(event.target)) return; const lane = state.bindings.lanes.indexOf(event.code); if (lane >= 0) { state.held.delete(lane); drawFrame(songTime()); } });

init();
