import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const GF = 'https://guitarflash.com';
const CHART_KEY = Buffer.from([4, 7, 93, 8, 41, 227, 34, 187, 23, 75, 189, 18, 45, 62, 5, 199]);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const cache = new Map();
const scores = [];
const rooms = new Map();

function json(res, status, value) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); }
function parseWrappedJson(text) { const start = text.indexOf('{'); const end = text.lastIndexOf('}'); if (start < 0 || end < start) throw new Error('Unexpected Guitar Flash response'); return JSON.parse(text.slice(start, end + 1)); }
async function gfPost(route, data) { const response = await fetch(`${GF}${route}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'GuitarFlashModern/1.0' }, body: new URLSearchParams(data) }); if (!response.ok) throw new Error(`Guitar Flash returned ${response.status}`); return parseWrappedJson(await response.text()); }
async function body(req) { let raw = ''; for await (const chunk of req) raw += chunk; try { return JSON.parse(raw || '{}'); } catch { return {}; } }

async function catalog() {
  const current = cache.get('catalog'); if (current && Date.now() - current.time < 10 * 60_000) return current.value;
  const source = await gfPost('/site/asp/menuMusicas.asp', { nova: '1', func: '', banda: '0', nivel: '0', b: 'undefined', id: '0', jogDif: '', jogMod: '', rand: String(Math.random()) });
  const value = source.menuMus.map(song => ({ id: Number(song.id), title: song.nomeMus, artist: song.banda, plays: Number(song.jogadas || 0), level: Number(song.nivel || 1) }));
  cache.set('catalog', { time: Date.now(), value }); return value;
}

async function song(id) {
  const key = `song:${id}`; const current = cache.get(key); if (current && Date.now() - current.time < 10 * 60_000) return current.value;
  const source = await gfPost('/site/asp/musica.asp', { func: '1', id: String(id), mus: String(id), modo: '', dif: '', data: '1', rand: String(Math.random()) });
  const info = source.banda?.[0]; if (!info) throw new Error('Song not found');
  // Guitar Flash applies an 82 ms player lead after its stored per-song sync.
  // Preserve that behavior so the YouTube clock and original charts line up.
  const value = { id: Number(id), title: info.nomeMus, artist: info.banda, plays: Number(info.jogadas || 0), level: Number(info.nivel || 1), video: info.video, sync: Number(info.sincro || 0) + 0.082, image: info.imagemVid, rankings: source.pontosRank || [] };
  cache.set(key, { time: Date.now(), value }); return value;
}

function decryptChart(payload) {
  const [cipherHex, counterHex] = payload.trim().split('2d67666369762d');
  if (!cipherHex || !counterHex) throw new Error('Unknown chart format');
  const counter = Number(Buffer.from(counterHex, 'hex').toString('utf8'));
  const iv = Buffer.alloc(16); iv.writeUInt32BE(counter, 12);
  const decipher = crypto.createDecipheriv('aes-128-ctr', CHART_KEY, iv);
  return Buffer.concat([decipher.update(Buffer.from(cipherHex, 'hex')), decipher.final()]).toString('utf8');
}

function parseChart(xml) {
  const property = name => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`, 'i'))?.[1] || '';
  const notes = [...xml.matchAll(/<Note\s+time="([^"]+)"\s+duration="([^"]+)"\s+track="([^"]+)"\s+special="([^"]+)"\s*\/>/gi)].map(match => ({ time: Number(match[1]), duration: Number(match[2]), lane: Math.max(0, Math.min(4, Number(match[3]))), special: Number(match[4]) }));
  return { title: property('Title'), artist: property('Artist'), length: Number(property('Length') || notes.at(-1)?.time || 0), level: property('Level'), notes };
}

async function chart(id, difficulty) {
  if (!/^[a-d]$/.test(difficulty)) throw new Error('Invalid difficulty');
  const key = `chart:${id}:${difficulty}`; const current = cache.get(key); if (current) return current.value;
  const response = await fetch(`${GF}/data/game/chart/mus${id}${difficulty}.gf`, { headers: { referer: `${GF}/` } });
  if (!response.ok) throw new Error('This difficulty is not available');
  const value = parseChart(decryptChart(await response.text())); cache.set(key, { time: Date.now(), value }); return value;
}

function roomState(room) { return { type: 'state', code: room.code, host: room.host, players: [...room.players.values()], song: room.song, difficulty: room.difficulty, startsAt: room.startsAt || null, version: room.version || 1, persistent: false }; }
function emit(room, event) { const line = `data: ${JSON.stringify(event)}\n\n`; room.clients.forEach(client => client.write(line)); }
function publicRooms() { return [...rooms.values()].map(room => ({ code: room.code, players: room.players.size, song: room.song?.title || '', difficulty: room.difficulty })); }
function code() { let value; do value = crypto.randomBytes(3).toString('hex').toUpperCase(); while (rooms.has(value)); return value; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`); const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (url.pathname === '/api/catalog' && req.method === 'GET') return json(res, 200, await catalog());
    if (parts[0] === 'api' && parts[1] === 'song' && req.method === 'GET') return json(res, 200, await song(Number(parts[2])));
    if (parts[0] === 'api' && parts[1] === 'chart' && req.method === 'GET') return json(res, 200, await chart(Number(parts[2]), parts[3]));
    if (url.pathname === '/api/scores' && req.method === 'GET') return json(res, 200, scores.slice(0, 100));
    if (url.pathname === '/api/scores' && req.method === 'POST') { const entry = { ...await body(req), createdAt: Date.now() }; scores.push(entry); scores.sort((a, b) => b.score - a.score); scores.splice(100); return json(res, 201, entry); }
    if (url.pathname === '/api/rooms' && req.method === 'GET') return json(res, 200, publicRooms());
    if (url.pathname === '/api/rooms' && req.method === 'POST') { const input = await body(req); const room = { code: code(), host: input.nickname || 'Player', players: new Map(), clients: new Set(), song: null, difficulty: 'b', startsAt: null, version: 1 }; room.players.set(room.host, { nickname: room.host, score: 0, combo: 0 }); rooms.set(room.code, room); return json(res, 201, roomState(room)); }
    if (parts[0] === 'api' && parts[1] === 'rooms') {
      const room = rooms.get(parts[2]); if (!room) return json(res, 404, { error: 'Room not found' });
      if (!parts[3] && req.method === 'GET') return json(res, 200, roomState(room));
      if (parts[3] === 'join' && req.method === 'POST') { const input = await body(req); if (room.players.size >= 8) return json(res, 409, { error: 'Room full' }); const nickname = input.nickname || `Player ${room.players.size + 1}`; room.players.set(nickname, { nickname, score: 0, combo: 0 }); room.version++; return json(res, 200, roomState(room)); }
      if (parts[3] === 'events' && req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }); room.clients.add(res); res.write(`data: ${JSON.stringify(roomState(room))}\n\n`); const ping = setInterval(() => res.write(': ping\n\n'), 20_000); req.on('close', () => { clearInterval(ping); room.clients.delete(res); }); return; }
      if (parts[3] === 'start' && req.method === 'POST') { const input = await body(req); room.song = input.song; room.difficulty = input.difficulty || 'b'; room.startsAt = Date.now() + 8000; room.version++; return json(res, 200, roomState(room)); }
      if (parts[3] === 'score' && req.method === 'POST') { const input = await body(req); room.players.set(input.nickname, { nickname: input.nickname, score: Number(input.score || 0), combo: Number(input.combo || 0), time: Number(input.time || 0) }); room.version++; return json(res, 200, roomState(room)); }
    }
    const filePath = url.pathname === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, path.normalize(url.pathname).replace(/^\/+/, ''));
    if (!filePath.startsWith(ROOT)) return json(res, 403, { error: 'Forbidden' });
    const data = await fs.readFile(filePath); res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' }); res.end(data);
  } catch (error) {
    if (url.pathname.startsWith('/api/')) return json(res, 502, { error: error.message });
    try { const data = await fs.readFile(path.join(ROOT, 'index.html')); res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(data); } catch { json(res, 404, { error: 'Not found' }); }
  }
});

server.listen(PORT, () => console.log(`Guitar Flash Modern running at http://localhost:${PORT}`));
