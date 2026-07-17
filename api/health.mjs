import { persistentStore } from '../lib/store.mjs';
import { json } from '../lib/http.mjs';
export default { async fetch() { return json({ ok: true, runtime: 'vercel-node', storage: persistentStore ? 'redis' : 'memory' }); } };
