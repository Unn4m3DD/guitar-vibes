import crypto from 'node:crypto';
import { getRoom, saveRoom, listRooms, persistentStore } from '../lib/store.mjs';
import { json, readJson, cleanNickname, errorResponse } from '../lib/http.mjs';

const publicRoom = room => ({ code: room.code, players: Object.keys(room.players).length, song: room.song?.title || '', difficulty: room.difficulty });
const roomState = room => ({ type: 'state', code: room.code, host: room.host, players: Object.values(room.players), song: room.song, difficulty: room.difficulty, startsAt: room.startsAt || null, version: room.version, persistent: persistentStore });
const cleanSong = song => song && ({ id: Number(song.id), title: String(song.title || '').slice(0, 100), artist: String(song.artist || '').slice(0, 100), video: String(song.video || '').slice(0, 20), sync: Number(song.sync || 0) });

async function makeCode() { for (let attempt = 0; attempt < 8; attempt++) { const code = crypto.randomBytes(3).toString('hex').toUpperCase(); if (!await getRoom(code)) return code; } throw new Error('Could not create room'); }

export default { async fetch(request) {
  try {
    const url = new URL(request.url); const code = url.searchParams.get('code')?.toUpperCase(); const action = url.searchParams.get('action');
    if (request.method === 'GET' && !code) return json((await listRooms()).map(publicRoom));
    if (request.method === 'GET' && code) { const room = await getRoom(code); return room ? json(roomState(room)) : json({ error: 'Room not found' }, 404); }
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const input = await readJson(request);
    if (!code) { const host = cleanNickname(input.nickname); const room = { code: await makeCode(), host, players: { [host]: { nickname: host, score: 0, combo: 0 } }, song: null, difficulty: 'b', startsAt: null, version: 1 }; await saveRoom(room); return json(roomState(room), 201); }
    const room = await getRoom(code); if (!room) return json({ error: 'Room not found' }, 404);
    if (action === 'join') { if (Object.keys(room.players).length >= 8) return json({ error: 'Room full' }, 409); const nickname = cleanNickname(input.nickname); room.players[nickname] = { nickname, score: 0, combo: 0 }; }
    else if (action === 'start') { room.song = cleanSong(input.song); room.difficulty = /^[a-d]$/.test(input.difficulty) ? input.difficulty : 'b'; room.startsAt = Date.now() + 8000; }
    else if (action === 'score') { const nickname = cleanNickname(input.nickname); room.players[nickname] = { nickname, score: Math.max(0, Math.round(Number(input.score || 0))), combo: Math.max(0, Math.round(Number(input.combo || 0))), time: Math.max(0, Number(input.time || 0)) }; }
    else return json({ error: 'Unknown room action' }, 404);
    room.version++; await saveRoom(room); return json(roomState(room));
  } catch (error) { return errorResponse(error); }
} };
