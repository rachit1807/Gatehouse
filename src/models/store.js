import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pg from 'pg';
let pool, sqlite;
if (process.env.DATABASE_URL) {
  const schema = process.env.DATABASE_SCHEMA || 'gatehouse';
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('DATABASE_SCHEMA must be a lowercase SQL identifier.');
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}`, max: 5, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const path = process.env.DATABASE_PATH || './data/gatehouse.sqlite';
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
}
export async function query(sql, params = []) {
  if (pool) return (await pool.query(sql, params)).rows;
  const statement = sqlite.prepare(sql.replace(/\$\d+/g, '?'));
  return /^\s*(SELECT|INSERT.*RETURNING|UPDATE.*RETURNING)/is.test(sql) ? statement.all(...params) : (statement.run(...params), []);
}
await query(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at TEXT NOT NULL
)`);
await query(`CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
)`);
await query(`CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL, created_at TEXT NOT NULL
)`);
export const findUser = async (email) => (await query('SELECT * FROM users WHERE email=$1', [email]))[0];
export const findUserById = async (id) => (await query('SELECT * FROM users WHERE id=$1', [id]))[0];
export const publicUser = ({ id, name, email, created_at }) => ({ id, name, email, createdAt: created_at });
export async function closeStore() { if (pool) await pool.end(); else sqlite.close(); }
