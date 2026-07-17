const memory = globalThis.__gfMemoryStore ||= { scores: [], rooms: new Map() };
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
export const persistentStore = Boolean(redisUrl && redisToken);

async function redis(...command) {
  const response = await fetch(redisUrl, { method: 'POST', headers: { authorization: `Bearer ${redisToken}`, 'content-type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(5000) });
  const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || 'Storage unavailable'); return data.result;
}

async function pipeline(commands) {
  const response = await fetch(`${redisUrl}/pipeline`, { method: 'POST', headers: { authorization: `Bearer ${redisToken}`, 'content-type': 'application/json' }, body: JSON.stringify(commands), signal: AbortSignal.timeout(5000) });
  const data = await response.json(); if (!response.ok) throw new Error('Storage unavailable'); return data.map(item => item.result);
}

export async function listScores() {
  if (!persistentStore) return memory.scores.slice(0, 100);
  return (await redis('ZREVRANGE', 'gf:scores', 0, 99)).map(value => JSON.parse(value));
}

export async function addScore(entry) {
  if (!persistentStore) { memory.scores.push(entry); memory.scores.sort((a, b) => b.score - a.score); memory.scores.splice(100); return; }
  await redis('ZADD', 'gf:scores', entry.score, JSON.stringify(entry));
}

export async function getRoom(code) {
  if (!persistentStore) return memory.rooms.get(code) || null;
  const value = await redis('GET', `gf:room:${code}`); return value ? JSON.parse(value) : null;
}

export async function saveRoom(room) {
  if (!persistentStore) { memory.rooms.set(room.code, room); return; }
  await pipeline([['SET', `gf:room:${room.code}`, JSON.stringify(room), 'EX', 21600], ['SADD', 'gf:rooms', room.code]]);
}

export async function listRooms() {
  if (!persistentStore) return [...memory.rooms.values()];
  const codes = await redis('SMEMBERS', 'gf:rooms'); if (!codes.length) return [];
  const values = await pipeline(codes.map(code => ['GET', `gf:room:${code}`]));
  const stale = codes.filter((code, index) => !values[index]); if (stale.length) await redis('SREM', 'gf:rooms', ...stale);
  return values.filter(Boolean).map(value => JSON.parse(value));
}
