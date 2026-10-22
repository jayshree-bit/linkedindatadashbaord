import { Router } from 'express';
const r = Router();
r.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
export default r;