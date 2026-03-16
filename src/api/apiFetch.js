// ── User-scoped API fetch interceptor ────────────────────────────────────────
// Patches window.fetch to automatically inject the x-user-email header on
// every /api/ call. This means every existing fetch('/api/...') throughout
// the codebase gets user-scoping for free — no call-site changes needed.
//
// The user email is stored in localStorage so the app can show the correct
// cached inbox even before the user signs in (e.g. after a page refresh).

let _userEmail = '';

// Restore last signed-in user from localStorage immediately on module load.
// This runs before React mounts, so the first boot API calls (config, cache,
// buckets) already carry the correct x-user-email header.
if (typeof window !== 'undefined') {
  _userEmail = localStorage.getItem('amail_user_email') || '';
}

/** Call this immediately after a successful sign-in to scope all API calls. */
export function setCurrentUser(email) {
  _userEmail = email || '';
  if (email) {
    localStorage.setItem('amail_user_email', email);
  } else {
    localStorage.removeItem('amail_user_email');
  }
}

/** Returns the currently active user email (from memory or localStorage). */
export function getCurrentUser() {
  return _userEmail;
}

// ── Patch global fetch ────────────────────────────────────────────────────────
// Only intercepts relative /api/ paths — never touches Google API calls or
// any other external URLs. Safe to patch once at module load time.

if (typeof window !== 'undefined') {
  const _origFetch = window.fetch.bind(window);
  window.fetch = function (input, init = {}) {
    const url = typeof input === 'string'
      ? input
      : (input instanceof Request ? input.url : String(input));

    const isApiCall = typeof url === 'string' && url.startsWith('/api/');

    if (isApiCall && _userEmail) {
      init = {
        ...init,
        headers: {
          ...init.headers,
          'x-user-email': _userEmail,
        },
      };
    }

    return _origFetch(input, init);
  };
}
