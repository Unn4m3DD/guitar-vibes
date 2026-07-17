import { getSong } from '../lib/guitar-flash.mjs';
import { json, errorResponse } from '../lib/http.mjs';
export default { async fetch(request) { try { const id = Number(new URL(request.url).searchParams.get('id')); return json(await getSong(id), 200, { 'CDN-Cache-Control': 'public, max-age=600' }); } catch (error) { return errorResponse(error); } } };
