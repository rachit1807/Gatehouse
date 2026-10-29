import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { query, findUser, findUserById, publicUser } from '../models/store.js';
export async function recordEvent(userId, action) {
  await query('INSERT INTO events (id,user_id,action,created_at) VALUES ($1,$2,$3,$4)', [randomUUID(), userId, action, new Date().toISOString()]);
}
function fields(body) {
  return { name: typeof body?.name === 'string' ? body.name.trim() : '', email: typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '', password: body?.password };
}
function validPassword(password) { return typeof password === 'string' && password.length >= 8 && Buffer.byteLength(password, 'utf8') <= 72; }
export async function register(req, res) {
  const { name, email, password } = fields(req.body);
  if (name.length < 2 || name.length > 60 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !validPassword(password)) {
    return res.status(400).json({ message: 'Enter a name (2–60 characters), valid email, and password of at least 8 characters and at most 72 UTF-8 bytes.' });
  }
  if (await findUser(email)) return res.status(409).json({ message: 'An account with this email already exists.' });
  const user = { id: randomUUID(), name, email, password_hash: await bcrypt.hash(password, 12), created_at: new Date().toISOString() };
  try {
    await query('INSERT INTO users (id,name,email,password_hash,created_at) VALUES ($1,$2,$3,$4,$5)', Object.values(user));
  } catch (error) {
    if (error.code === '23505' || error.code?.startsWith('ERR_SQLITE_CONSTRAINT')) return res.status(409).json({ message: 'An account with this email already exists.' });
    throw error;
  }
  await recordEvent(user.id, 'Account created');
  return res.status(201).json({ message: 'Account created. You can now sign in.', user: publicUser(user) });
}
const dummyHash = await bcrypt.hash('gatehouse-timing-placeholder', 12);
export async function login(req, res) {
  const { email, password } = fields(req.body);
  if (!email || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ message: 'Enter your email and password.' });
  const user = await findUser(email);
  const matches = await bcrypt.compare(password, user?.password_hash || dummyHash);
  if (!user || !matches) return res.status(401).json({ message: 'Email or password is incorrect.' });
  const sessionId = randomUUID();
  const token = jwt.sign({}, config.secret, { algorithm: 'HS256', subject: user.id, jwtid: sessionId, issuer: config.issuer, audience: config.audience, expiresIn: config.expiresIn });
  const { exp } = jwt.decode(token);
  await query('DELETE FROM sessions WHERE expires_at < $1', [new Date().toISOString()]);
  await query('INSERT INTO sessions (id,user_id,created_at,expires_at) VALUES ($1,$2,$3,$4)', [sessionId, user.id, new Date().toISOString(), new Date(exp * 1000).toISOString()]);
  await recordEvent(user.id, 'Signed in');
  res.json({ token, tokenType: 'Bearer', expiresAt: new Date(exp * 1000).toISOString(), user: publicUser(user) });
}
export async function logout(req, res) {
  await query('DELETE FROM sessions WHERE id=$1', [req.auth.jti]);
  await recordEvent(req.user.id, 'Signed out');
  res.json({ message: 'Signed out successfully.' });
}
export async function me(req, res) { res.json({ user: publicUser(req.user) }); }
export async function activity(req, res) {
  const events = await query('SELECT action,created_at FROM events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 12', [req.user.id]);
  res.json({ events: events.map(e => ({ action: e.action, createdAt: e.created_at })) });
}
export async function updateProfile(req, res) {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (name.length < 2 || name.length > 60) return res.status(400).json({ message: 'Name must contain 2–60 characters.' });
  await query('UPDATE users SET name=$1 WHERE id=$2', [name, req.user.id]);
  await recordEvent(req.user.id, 'Profile updated');
  res.json({ user: publicUser(await findUserById(req.user.id)), message: 'Profile saved.' });
}
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || !validPassword(newPassword)) return res.status(400).json({ message: 'New password must contain at least 8 characters and at most 72 UTF-8 bytes.' });
  if (!await bcrypt.compare(currentPassword, req.user.password_hash)) return res.status(401).json({ message: 'Current password is incorrect.' });
  await query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(newPassword, 12), req.user.id]);
  await query('DELETE FROM sessions WHERE user_id=$1', [req.user.id]);
  await recordEvent(req.user.id, 'Password changed; all sessions ended');
  res.json({ message: 'Password updated. Sign in again with your new password.' });
}
