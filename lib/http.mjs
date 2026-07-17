export const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export const errorResponse = error => json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 502);
export async function readJson(request) { try { return await request.json(); } catch { return {}; } }
export function cleanNickname(value) { return String(value || 'Player').trim().slice(0, 18) || 'Player'; }
