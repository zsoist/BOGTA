// Vercel serverless function → shared handler in server/server.mjs (same code as local `npm start`).
import { api } from '../server/server.mjs';
export default (req, res) => api(req, res, '/api/radio');
