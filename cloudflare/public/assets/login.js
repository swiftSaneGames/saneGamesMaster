const messages = { not_allowed: 'This Google account is not on the studio allowlist. Choose an approved account.', sign_in_failed: 'Sign-in could not be completed. Try again, or check the Google client and callback configuration.' };
const box = document.querySelector('#login-message'), button = document.querySelector('#google-signin');
const reason = new URLSearchParams(location.search).get('error');
if (messages[reason]) { box.hidden = false; box.textContent = messages[reason]; history.replaceState(null, '', '/login'); }
fetch('/auth/status', { credentials: 'same-origin', cache: 'no-store' }).then(r => r.json()).then(data => {
  if (!data.configured) { box.hidden = false; box.textContent = 'The hosted workspace is installed. Its administrator must configure the Google client ID and add the GOOGLE_CLIENT_SECRET runtime secret in Cloudflare to activate sign-in.'; button.setAttribute('aria-disabled', 'true'); button.classList.add('disabled'); button.removeAttribute('href'); }
}).catch(() => { box.hidden = false; box.textContent = 'Unable to check sign-in availability. Reload the page shortly.'; });
