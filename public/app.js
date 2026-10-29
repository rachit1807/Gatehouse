const $ = (id) => document.getElementById(id);
let mode = 'login', expiryTimer, currentUser;
const storage = { get(key, session = false) { try { return (session ? sessionStorage : localStorage).getItem(key); } catch { return null; } }, set(key, value, session = false) { try { (session ? sessionStorage : localStorage).setItem(key, value); return true; } catch { return false; } }, remove(key) { try { sessionStorage.removeItem(key); } catch {} } };
let token = storage.get('gatehouse-token', true);
let theme = storage.get('gatehouse-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function applyTheme() { document.documentElement.dataset.theme = theme; $('theme-toggle').setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`); document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#181f1b' : '#f5f3ec'; }
applyTheme(); $('theme-toggle').onclick = () => { theme = theme === 'light' ? 'dark' : 'light'; storage.set('gatehouse-theme', theme); applyTheme(); };
$('year').textContent = new Date().getFullYear();
function message(id, text, error = false) { const el = $(id); el.textContent = text; el.className = `message ${error ? 'error' : 'success'}`; el.hidden = !text; }
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; setTimeout(() => { $('toast').hidden = true; }, 4500); }
function resetSession(notice = '') { clearTimeout(expiryTimer); token = null; currentUser = null; storage.remove('gatehouse-token'); storage.remove('gatehouse-expiry'); $('workspace-view').hidden = true; $('entry-view').hidden = false; $('password-form').reset(); $('profile-form').reset(); setMode('login'); if (notice) message('form-message', notice); }
async function api(path, { method = 'GET', body, auth = true } = {}) {
  let response;
  try { response = await fetch(`/api${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw new Error('Unable to connect. Check your connection and try again.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { if (response.status === 401 && auth && token && path !== '/auth/password') resetSession('Your session has ended. Please sign in again.'); throw new Error(result.message || 'Request failed. Please try again.'); }
  return result;
}
function setMode(next) {
  mode = next; const register = mode === 'register';
  $('login-tab').setAttribute('aria-selected', String(!register)); $('register-tab').setAttribute('aria-selected', String(register));
  $('name-field').hidden = !register; $('full-name').required = register;
  $('password').autocomplete = register ? 'new-password' : 'current-password'; $('password').minLength = register ? 8 : 1;
  $('password').value = ''; $('password').type = 'password'; document.querySelector('[data-reveal="password"]').setAttribute('aria-label', 'Show password');
  $('strength-wrap').hidden = !register; $('strength-bar').style.width = '0'; $('strength-text').textContent = 'Use at least 8 characters.';
  $('form-title').textContent = register ? 'A place for you.' : 'Welcome back.';
  $('form-subtitle').textContent = register ? 'Your own little corner starts here.' : 'Make yourself at home.';
  $('submit-button').firstElementChild.textContent = register ? 'Create your account' : 'Step inside';
  $('entry-number').textContent = register ? '02 / CREATE ACCOUNT' : '01 / SIGN IN';
  $('password-hint').textContent = register ? 'At least 8 characters.' : 'Your secret, kept safe.';
  $('session-note').textContent = register ? 'One account. A secure space to call your own.' : 'Your session stays in this tab. Your privacy stays yours.';
  message('form-message', '');
}
$('login-tab').onclick = () => setMode('login'); $('register-tab').onclick = () => setMode('register');
for (const tab of [$('login-tab'), $('register-tab')]) tab.onkeydown = (e) => { if (['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); const next = mode === 'login' ? 'register' : 'login'; setMode(next); $(`${next}-tab`).focus(); } };
for (const button of document.querySelectorAll('[data-reveal]')) button.onclick = () => { const input = $(button.dataset.reveal); input.type = input.type === 'password' ? 'text' : 'password'; button.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password'); };
$('password').oninput = () => {
  const value = $('password').value; let score = Number(value.length >= 8) + Number(value.length >= 12) + Number(/[a-z]/.test(value) && /[A-Z]/.test(value)) + Number(/\d/.test(value) && /[^\w]/.test(value));
  $('strength-bar').style.width = `${value ? Math.max(1,score) * 25 : 0}%`; $('strength-bar').style.background = score >= 3 ? 'var(--success)' : 'var(--muted)'; $('strength-text').textContent = !value ? 'Use at least 8 characters.' : value.length < 8 ? 'A little longer — at least 8 characters.' : ['','','Good start. Longer is stronger.','Looking good.','A strong choice.'][Math.max(2,score)];
};
async function busy(form, task) { const button = form.querySelector('[type="submit"]'); const original = button.innerHTML; button.disabled = true; if (button.firstElementChild) button.firstElementChild.textContent = 'One moment…'; else button.textContent = 'One moment…'; try { await task(); } finally { button.disabled = false; button.innerHTML = original; } }
$('auth-form').onsubmit = async (e) => { e.preventDefault(); message('form-message', ''); const submittedMode = mode; const tabs = [$('login-tab'), $('register-tab')]; tabs.forEach(t => { t.disabled = true; });
  try { await busy(e.currentTarget, async () => {
    const body = { email: $('email').value.trim(), password: $('password').value, ...(submittedMode === 'register' ? { name: $('full-name').value.trim() } : {}) };
    const result = await api(`/auth/${submittedMode}`, { method:'POST', body, auth:false });
    if (submittedMode === 'register') { setMode('login'); message('form-message', 'Your account is ready. Sign in to step inside.'); $('password').focus(); }
    else { token = result.token; storage.set('gatehouse-token', token, true); storage.set('gatehouse-expiry', result.expiresAt, true); $('auth-form').reset(); showWorkspace(result.user, result.expiresAt); toast('Welcome to your space.'); }
  }); } catch (error) { message('form-message', error.message, true); } finally { tabs.forEach(t => { t.disabled = false; }); $('submit-button').firstElementChild.textContent = mode === 'register' ? 'Create your account' : 'Step inside'; }
};
function renderUser(user) { currentUser = user; $('greeting-name').textContent = `${user.name.split(/\s+/)[0]}.`; $('member-name').textContent = user.name; $('member-email').textContent = user.email; $('profile-name').value = user.name; $('profile-email').value = user.email; $('avatar').textContent = user.name.split(/\s+/).slice(0,2).map(p => p[0]).join('').toUpperCase(); $('member-since').textContent = new Date(user.createdAt).toLocaleDateString(undefined, { month:'short', year:'numeric' }); $('member-id').textContent = `GH — ${user.id.slice(0,18).toUpperCase()}`; }
function showWorkspace(user, expiresAt) {
  renderUser(user); $('entry-view').hidden = true; $('workspace-view').hidden = false; message('account-message', ''); selectPanel('profile-panel');
  clearTimeout(expiryTimer); const delay = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(delay) || delay <= 0) return resetSession('Your session has expired. Please sign in.');
  $('session-expiry').textContent = `Expires ${new Date(expiresAt).toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' })} · Signed JWT`;
  expiryTimer = setTimeout(() => resetSession('Your session has expired. Please sign in again.'), Math.min(delay, 2147483647)); window.scrollTo(0,0);
}
function selectPanel(id) { for (const panel of document.querySelectorAll('.account-panel')) panel.hidden = panel.id !== id; for (const button of document.querySelectorAll('[data-panel]')) button.setAttribute('aria-selected', String(button.dataset.panel === id)); message('account-message', ''); if (id === 'activity-panel') loadActivity(); }
for (const button of document.querySelectorAll('[data-panel]')) { button.onclick = () => selectPanel(button.dataset.panel); button.onkeydown = (e) => { if (['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); const tabs = [...document.querySelectorAll('[data-panel]')]; const index = (tabs.indexOf(button) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; tabs[index].click(); tabs[index].focus(); } }; }
$('profile-form').onsubmit = async (e) => { e.preventDefault(); try { await busy(e.currentTarget, async () => { const result = await api('/auth/profile', { method:'PATCH', body:{ name: $('profile-name').value.trim() } }); renderUser(result.user); message('account-message', result.message); }); } catch (error) { message('account-message', error.message, true); } };
$('password-form').onsubmit = async (e) => { e.preventDefault(); if ($('new-password').value !== $('confirm-password').value) return message('account-message', 'The new passwords do not match.', true); try { await busy(e.currentTarget, async () => { const result = await api('/auth/password', { method:'POST', body:{ currentPassword:$('current-password').value, newPassword:$('new-password').value } }); resetSession(result.message); }); } catch(error) { message('account-message', error.message, true); } };
$('logout-button').onclick = async () => { $('logout-button').disabled = true; try { await api('/auth/logout', { method:'POST' }); resetSession('You’re signed out. See you next time.'); } catch (error) { if (token) message('account-message', error.message, true); } finally { $('logout-button').disabled = false; } };
async function loadActivity() { $('refresh-activity').disabled = true; $('activity-list').textContent = 'Loading your activity…'; try { const { events } = await api('/auth/activity'); $('activity-list').replaceChildren(); for (const event of events) { const li = document.createElement('li'), span = document.createElement('span'), time = document.createElement('time'); span.textContent = event.action; time.dateTime = event.createdAt; time.textContent = new Date(event.createdAt).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); li.append(span,time); $('activity-list').append(li); } if (!events.length) $('activity-list').textContent = 'Your story starts here. No activity yet.'; } catch(error) { $('activity-list').textContent = error.message; } finally { $('refresh-activity').disabled = false; } }
$('refresh-activity').onclick = loadActivity;
$('about-button').onclick = () => $('privacy-dialog').showModal(); $('close-privacy').onclick = $('privacy-done').onclick = () => $('privacy-dialog').close();
if (token) { api('/auth/me').then(({user}) => showWorkspace(user, storage.get('gatehouse-expiry', true))).catch(error => resetSession(error.message)); }
