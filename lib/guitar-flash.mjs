import crypto from 'node:crypto';

const GF = 'https://guitarflash.com';
const CHART_KEY = Buffer.from([4, 7, 93, 8, 41, 227, 34, 187, 23, 75, 189, 18, 45, 62, 5, 199]);
const cache = new Map();

function parseWrappedJson(text) {
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Unexpected Guitar Flash response');
  return JSON.parse(text.slice(start, end + 1));
}

async function gfPost(route, data) {
  const response = await fetch(`${GF}${route}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'GuitarFlashModern/1.0' }, body: new URLSearchParams(data), signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`Guitar Flash returned ${response.status}`);
  return parseWrappedJson(await response.text());
}

export async function getCatalog() {
  const current = cache.get('catalog'); if (current && Date.now() - current.time < 10 * 60_000) return current.value;
  const source = await gfPost('/site/asp/menuMusicas.asp', { nova: '1', func: '', banda: '0', nivel: '0', b: 'undefined', id: '0', jogDif: '', jogMod: '', rand: String(Math.random()) });
  const value = source.menuMus.map(song => ({ id: Number(song.id), title: song.nomeMus, artist: song.banda, plays: Number(song.jogadas || 0), level: Number(song.nivel || 1) }));
  cache.set('catalog', { time: Date.now(), value }); return value;
}

export async function getSong(id) {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid song');
  const key = `song:${id}`; const current = cache.get(key); if (current && Date.now() - current.time < 10 * 60_000) return current.value;
  const source = await gfPost('/site/asp/musica.asp', { func: '1', id: String(id), mus: String(id), modo: '', dif: '', data: '1', rand: String(Math.random()) });
  const info = source.banda?.[0]; if (!info) throw new Error('Song not found');
  const value = { id, title: info.nomeMus, artist: info.banda, plays: Number(info.jogadas || 0), level: Number(info.nivel || 1), video: info.video, sync: Number(info.sincro || 0) + 0.082, image: info.imagemVid, rankings: source.pontosRank || [] };
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

export function parseChart(xml) {
  const property = name => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`, 'i'))?.[1] || '';
  const notes = [...xml.matchAll(/<Note\s+time="([^"]+)"\s+duration="([^"]+)"\s+track="([^"]+)"\s+special="([^"]+)"\s*\/>/gi)].map(match => ({ time: Number(match[1]), duration: Number(match[2]), lane: Math.max(0, Math.min(4, Number(match[3]))), special: Number(match[4]) }));
  return { title: property('Title'), artist: property('Artist'), length: Number(property('Length') || notes.at(-1)?.time || 0), level: property('Level'), notes };
}

export async function getChart(id, difficulty) {
  if (!Number.isInteger(id) || id <= 0 || !/^[a-d]$/.test(difficulty)) throw new Error('Invalid chart');
  const key = `chart:${id}:${difficulty}`; const current = cache.get(key); if (current) return current.value;
  const response = await fetch(`${GF}/data/game/chart/mus${id}${difficulty}.gf`, { headers: { referer: `${GF}/`, 'user-agent': 'GuitarFlashModern/1.0' }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error('This difficulty is not available');
  const value = parseChart(decryptChart(await response.text())); cache.set(key, { time: Date.now(), value }); return value;
}
