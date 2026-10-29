import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-only-at-least-32-characters-long';
let app, store, config;
before(async () => { app = (await import('../src/app.js')).default; store = await import('../src/models/store.js'); config = (await import('../src/config.js')).config; });
after(async () => { await store.closeStore(); });
const account = { name:'Test Member', email:'member@example.com', password:'A-strong-password-42' };
let token;
test('registration validates input and stores a bcrypt hash, never returning it', async () => {
  assert.equal((await request(app).post('/api/auth/register').send({})).status, 400);
  assert.equal((await request(app).post('/api/auth/register').send({...account,password:'é'.repeat(40)})).status, 400);
  const res = await request(app).post('/api/auth/register').send(account); assert.equal(res.status,201); assert.equal(res.body.user.email, account.email); assert.equal(res.body.user.password_hash,undefined);
  const user = await store.findUser(account.email); assert.match(user.password_hash, /^\$2[aby]\$12\$/); assert.notEqual(user.password_hash,account.password);
  assert.equal((await request(app).post('/api/auth/register').send({...account,email:'MEMBER@example.com'})).status,409);
});
test('login rejects incorrect credentials and issues a bounded signed JWT', async () => {
  assert.equal((await request(app).post('/api/auth/login').send({...account,password:'wrong'})).status,401);
  const res = await request(app).post('/api/auth/login').send(account); assert.equal(res.status,200); token = res.body.token;
  const claims = jwt.verify(token,config.secret,{algorithms:['HS256'],issuer:config.issuer,audience:config.audience}); assert.equal(claims.exp-claims.iat,3600); assert.ok(claims.jti);
});
test('protected endpoint rejects missing, malformed, forged, expired and wrong-audience tokens', async () => {
  for (const auth of ['', 'Basic abc', 'Bearer', 'Bearer abc extra', 'Bearer forged']) { const r = request(app).get('/api/auth/me'); if(auth) r.set('Authorization',auth); assert.equal((await r).status,401); }
  for (const options of [{expiresIn:-1,audience:config.audience},{expiresIn:'1h',audience:'another-app'}]) { const forged = jwt.sign({sub:'x',jti:'y'},config.secret,{issuer:config.issuer,...options}); assert.equal((await request(app).get('/api/auth/me').set('Authorization',`Bearer ${forged}`)).status,401); }
  const ok = await request(app).get('/api/auth/me').set('Authorization',`Bearer ${token}`); assert.equal(ok.status,200); assert.equal(ok.headers['cache-control'],'no-store');
});
test('profile and activity are protected and persist changes', async () => {
  assert.equal((await request(app).patch('/api/auth/profile').set('Authorization',`Bearer ${token}`).send({name:'Updated Member'})).status,200);
  const me = await request(app).get('/api/auth/me').set('Authorization',`Bearer ${token}`); assert.equal(me.body.user.name,'Updated Member');
  const activity = await request(app).get('/api/auth/activity').set('Authorization',`Bearer ${token}`); assert.ok(activity.body.events.some(e=>e.action==='Profile updated'));
});
test('logout invalidates token immediately', async () => {
  assert.equal((await request(app).post('/api/auth/logout').set('Authorization',`Bearer ${token}`)).status,200);
  assert.equal((await request(app).get('/api/auth/me').set('Authorization',`Bearer ${token}`)).status,401);
});
test('password change rejects wrong password and invalidates every session', async () => {
  const a = await request(app).post('/api/auth/login').send(account), b = await request(app).post('/api/auth/login').send(account);
  assert.equal((await request(app).post('/api/auth/password').set('Authorization',`Bearer ${a.body.token}`).send({currentPassword:'wrong',newPassword:'New-strong-password-42'})).status,401);
  assert.equal((await request(app).post('/api/auth/password').set('Authorization',`Bearer ${a.body.token}`).send({currentPassword:account.password,newPassword:'New-strong-password-42'})).status,200);
  for(const t of [a.body.token,b.body.token]) assert.equal((await request(app).get('/api/auth/me').set('Authorization',`Bearer ${t}`)).status,401);
  assert.equal((await request(app).post('/api/auth/login').send(account)).status,401);
  assert.equal((await request(app).post('/api/auth/login').send({...account,password:'New-strong-password-42'})).status,200);
});
test('health, static app, malformed JSON, security headers and missing API paths', async () => {
  assert.equal((await request(app).get('/api/health')).status,200);
  const page = await request(app).get('/'); assert.equal(page.status,200); assert.match(page.headers['content-security-policy'],/script-src 'self'/);
  assert.equal((await request(app).post('/api/auth/login').set('Content-Type','application/json').send('{bad')).status,400);
  assert.equal((await request(app).get('/api/missing')).status,404);
});
