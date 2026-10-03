const box = document.querySelector('#login-message');
const legacy = document.querySelector('#google-signin');
const mount = document.querySelector('#google-identity-button');
const messages = {
  not_allowed: 'This Google account is not on the studio allowlist. Choose an approved account.',
  sign_in_failed: 'Sign-in could not be completed. Check the Google client and callback configuration, then try again.'
};
function show(message) { box.hidden = false; box.textContent = message; }
function pauseLegacy() {
  legacy.removeAttribute('href'); legacy.setAttribute('aria-disabled', 'true'); legacy.classList.add('disabled');
}
function retry(message) {
  mount.hidden = true; legacy.hidden = false; legacy.href = '/login';
  legacy.classList.remove('disabled'); legacy.removeAttribute('aria-disabled');
  legacy.textContent = 'Reload sign-in'; show(message);
}
async function post(path, body) {
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-SG-Login': '1' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'Sign-in is temporarily unavailable.'); error.code = data.code; throw error; }
  return data;
}
function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('Google sign-in did not load. Allow accounts.google.com for this site and reload.')), 15000);
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = () => { clearTimeout(timer); window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in is unavailable. Reload to try again.')); };
    script.onerror = () => { clearTimeout(timer); reject(new Error('Your browser or network blocked Google sign-in. Allow accounts.google.com for this site and reload.')); };
    document.head.append(script);
  });
}
const reason = new URLSearchParams(location.search).get('error');
if (messages[reason]) { show(messages[reason]); history.replaceState(null, '', '/login'); }
pauseLegacy();
async function initialize() {
  const response = await fetch('/auth/status', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to check sign-in availability. Reload shortly.');
  const config = await response.json();
  if (!(config.ready ?? config.configured)) {
    const names = { google_client_id: 'a valid Google web client ID', allowed_emails: 'the owner allowlist', studio_storage: 'the Cloudflare database binding' };
    throw new Error('Sign-in needs ' + (config.missing || []).map(x => names[x] || x).join(', ') + '. No client secret is required for Google ID-token sign-in.');
  }
  if (config.mode === 'authorization_code') {
    legacy.href = '/auth/google'; legacy.classList.remove('disabled'); legacy.removeAttribute('aria-disabled');
    return;
  }
  show('Connecting securely to Google…');
  const [google, pending] = await Promise.all([loadGoogle(), post('/auth/google/prepare', {})]);
  let submitting = false;
  const expires = setTimeout(() => retry('This sign-in attempt has expired. Reload to start a new secure sign-in.'), pending.expires_in * 1000);
  google.initialize({
    client_id: pending.client_id, nonce: pending.nonce,
    auto_select: false, ux_mode: 'popup',
    callback: async result => {
      if (submitting) return;
      submitting = true; clearTimeout(expires); mount.hidden = true;
      show('Verifying your Google account…');
      try {
        await post('/auth/google/credential', { credential: result.credential, state: pending.state });
        // Navigation happens only after server verification and session creation succeed.
        location.replace('/');
      } catch (error) {
        retry(error.code === 'not_allowed' ? messages.not_allowed : error.message + ' Reload to try again.');
      }
    }
  });
  legacy.hidden = true; mount.hidden = false;
  const width = Math.min(400, Math.max(200, Math.floor(mount.getBoundingClientRect().width)));
  google.renderButton(mount, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width });
  box.hidden = true;
}
initialize().catch(error => retry(error.message));
