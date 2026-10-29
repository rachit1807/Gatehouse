import 'dotenv/config';
import { randomBytes } from 'node:crypto';
const production = process.env.NODE_ENV === 'production';
const suppliedSecret = process.env.JWT_SECRET;
if (production && (!suppliedSecret || suppliedSecret.length < 32 || suppliedSecret.startsWith('replace-'))) {
  throw new Error('Set JWT_SECRET to a random secret with at least 32 characters.');
}
if (production && !process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in production.');
export const config = {
  production, secret: suppliedSecret || randomBytes(48).toString('hex'),
  expiresIn: process.env.JWT_EXPIRES_IN || '1h', issuer: 'gatehouse', audience: 'gatehouse-web',
  port: Number(process.env.PORT || 3000)
};
