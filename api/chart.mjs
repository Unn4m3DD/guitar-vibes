import { getChart } from '../lib/guitar-flash.mjs';
import { json, errorResponse } from '../lib/http.mjs';
export default { async fetch(request) { try { const url = new URL(request.url); return json(await getChart(Number(url.searchParams.get('id')), url.searchParams.get('difficulty')), 200, { 'CDN-Cache-Control': 'public, max-age=86400' }); } catch (error) { return errorResponse(error); } } };
