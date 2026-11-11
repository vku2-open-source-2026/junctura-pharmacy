// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
// OpenID Connect authorization-code flow with PKCE for a public browser client.
// Tokens live in sessionStorage only (gone when the tab closes) and are never logged.

export interface OidcSettings { issuer: string; clientId: string }
export interface Session { accessToken: string; refreshToken?: string; idToken?: string; expiresAt: number }

const SESSION_KEY = "pharmacy.session";
const PENDING_KEY = "pharmacy.pending";

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomString = (bytes = 32) => base64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function createPkce() {
  const verifier = randomString(48);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)), state: randomString(24) };
}

export function buildAuthorizeUrl({ issuer, clientId }: OidcSettings, redirectUri: string, pkce: { challenge: string; state: string }) {
  const url = new URL(`${issuer}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid",
    code_challenge: pkce.challenge, code_challenge_method: "S256", state: pkce.state,
  }).toString();
  return url.toString();
}

export function buildLogoutUrl({ issuer, clientId }: OidcSettings, redirectUri: string, idToken?: string) {
  const params = new URLSearchParams({ client_id: clientId, post_logout_redirect_uri: redirectUri });
  if (idToken) params.set("id_token_hint", idToken);
  return `${issuer}/protocol/openid-connect/logout?${params}`;
}

interface TokenResponse { access_token: string; refresh_token?: string; id_token?: string; expires_in: number }

const toSession = (token: TokenResponse, now: number, previous?: Session): Session => ({
  accessToken: token.access_token,
  refreshToken: token.refresh_token ?? previous?.refreshToken,
  idToken: token.id_token ?? previous?.idToken,
  expiresAt: now + token.expires_in * 1000,
});

async function requestToken(settings: OidcSettings, form: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(`${settings.issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: settings.clientId, ...form }),
  });
  if (!response.ok) throw new Error(`token endpoint answered ${response.status}`);
  return response.json();
}

export async function startLogin(settings: OidcSettings) {
  const pkce = await createPkce();
  const redirectUri = `${location.origin}/`;
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ state: pkce.state, verifier: pkce.verifier }));
  location.assign(buildAuthorizeUrl(settings, redirectUri, pkce));
}

/** Completes the redirect back from the identity provider; returns null when this is not a callback. */
export async function completeLogin(settings: OidcSettings, search: string): Promise<Session | null> {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  if (!code && !params.get("error")) return null;
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as { state: string; verifier: string } | null;
  sessionStorage.removeItem(PENDING_KEY);
  if (params.get("error")) throw new Error(`sign-in refused: ${params.get("error")}`);
  if (!pending || pending.state !== params.get("state")) throw new Error("sign-in state does not match");
  const token = await requestToken(settings, { grant_type: "authorization_code", code: code!, redirect_uri: `${location.origin}/`, code_verifier: pending.verifier });
  const session = toSession(token, Date.now());
  saveSession(session);
  return session;
}

export const loadSession = (): Session | null => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
};
export const saveSession = (session: Session) => sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
export const clearSession = () => { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(PENDING_KEY); };

/** A usable access token, refreshed shortly before it expires; null when sign-in is needed again. */
export async function freshAccessToken(settings: OidcSettings, now = Date.now()): Promise<string | null> {
  const session = loadSession();
  if (!session) return null;
  if (session.expiresAt - now > 15_000) return session.accessToken;
  if (!session.refreshToken) return null;
  try {
    const next = toSession(await requestToken(settings, { grant_type: "refresh_token", refresh_token: session.refreshToken }), now, session);
    saveSession(next);
    return next.accessToken;
  } catch {
    clearSession();
    return null;
  }
}
