import { getCatalog } from '../lib/guitar-flash.mjs';
import { json, errorResponse } from '../lib/http.mjs';
export default { async fetch() { try { return json(await getCatalog(), 200, { 'CDN-Cache-Control': 'public, max-age=600' }); } catch (error) { return errorResponse(error); } } };
