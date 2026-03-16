// ── Google Identity Services — Token Client Flow ─────────────────────────────
// Access tokens live in memory only (never localStorage — security).
// User profile is cached in localStorage purely for "welcome back" UX.
//
// IMPORTANT: GIS implicit flow tokens last ~1 hour. Unlike OAuth2 refresh
// tokens, there is NO true silent background refresh. When a token expires,
// the user must re-authenticate via a popup. We handle this gracefully by
// showing a notification rather than force-signing them out.

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

let tokenClient = null;
let currentToken = null; // { access_token, expiry_ms }

// Callback registered by App.jsx — called when token expires mid-session
// so the UI can show "Session expired" without force-signing out
let onTokenExpired = null;

/** Register a callback for when the token expires mid-session */
export function onSessionExpired(cb) {
  onTokenExpired = cb;
}

/** Wait for the GIS library script to finish loading */
function waitForGIS() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}

/** Initialize the GIS token client with a Google OAuth client ID */
export async function initGoogleAuth(clientId) {
  await waitForGIS();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: () => {}, // overridden per-request in requestToken()
  });
}

/**
 * Request an access token from Google.
 * - mode 'popup':  shows account chooser (used for sign-in)
 * - mode 'silent': attempts no-UI flow (only reliable right after sign-in)
 */
export function requestToken(mode = 'popup') {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error('Google auth not initialized'));

    tokenClient.callback = (response) => {
      if (response.error) return reject(new Error(response.error));
      currentToken = {
        access_token: response.access_token,
        // Subtract 60s buffer so we don't use a token that's about to expire
        expiry_ms: Date.now() + (response.expires_in - 60) * 1000,
      };
      resolve(response.access_token);
    };

    tokenClient.requestAccessToken({
      prompt: mode === 'silent' ? '' : 'select_account',
    });
  });
}

/**
 * Get the current access token.
 * If the token is expired, notifies the app (shows a sign-in prompt)
 * rather than attempting a silent refresh which is unreliable with GIS.
 *
 * Python analogy: like checking if a session cookie is still valid before
 * making a request, and redirecting to login if it's expired — rather than
 * trying to silently refresh it and potentially crashing mid-request.
 */
export function getAccessToken() {
  if (currentToken && Date.now() < currentToken.expiry_ms) {
    return Promise.resolve(currentToken.access_token);
  }
  // Token expired — notify the app so it can prompt re-sign-in gracefully
  onTokenExpired?.();
  return Promise.reject(new Error('Session expired — please sign in again'));
}

/** Fetch the signed-in user's profile from Google */
export async function fetchUserProfile(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  if (!res.ok) throw new Error('Failed to fetch user profile');
  const data = await res.json();
  return { email: data.email, name: data.name, picture: data.picture };
}

/** Explicit sign-out — revokes token and clears all cached state */
export function signOut(accessToken) {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  currentToken = null;
  localStorage.removeItem('amail_user');
  localStorage.removeItem('amail_session_active');
}

/** Cache user profile in localStorage for "welcome back" display */
export function cacheUser(profile) {
  localStorage.setItem('amail_user', JSON.stringify(profile));
  localStorage.setItem('amail_session_active', '1');
}

/** Read cached user profile — display only, does NOT restore auth */
export function getCachedUser() {
  try { return JSON.parse(localStorage.getItem('amail_user')); }
  catch { return null; }
}

/** True if the user had an active session and didn't explicitly sign out */
export function hadActiveSession() {
  return localStorage.getItem('amail_session_active') === '1';
}
