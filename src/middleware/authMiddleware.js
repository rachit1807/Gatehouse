import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { findUserById, query } from '../models/store.js';
export async function authenticate(req, res, next) {
  res.set('Cache-Control', 'no-store');
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ message: 'A Bearer token is required.' });
  let claims;
  try {
    claims = jwt.verify(match[1], config.secret, { algorithms: ['HS256'], issuer: config.issuer, audience: config.audience });
    if (typeof claims.sub !== 'string' || typeof claims.jti !== 'string') throw new Error('Invalid claims');
  } catch { return res.status(401).json({ message: 'Your session is invalid or expired. Please sign in.' }); }
  const sessions = await query('SELECT * FROM sessions WHERE id=$1 AND user_id=$2', [claims.jti, claims.sub]);
  if (!sessions.length || new Date(sessions[0].expires_at) <= new Date()) return res.status(401).json({ message: 'Your session has ended. Please sign in.' });
  const user = await findUserById(claims.sub);
  if (!user) return res.status(401).json({ message: 'Account not found.' });
  req.user = user; req.auth = claims; next();
}
