// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { createPublicKey, verify } from "node:crypto";

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthError";
  }
}

const decode = part => Buffer.from(part, "base64url");
const parseJson = (part, what) => {
  try {
    return JSON.parse(decode(part).toString("utf8"));
  } catch {
    throw new AuthError(`malformed ${what}`);
  }
};

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

/**
 * Verifies RS256 access tokens issued by the Junctura identity provider (Keycloak).
 * Signature keys come from the issuer's JWKS and are cached; an unknown key id
 * triggers one refresh at most every `refreshMs`.
 */
export function createVerifier({ issuer, clientId, getJson = fetchJson, now = Date.now, skewSeconds = 30, ttlMs = 600_000, refreshMs = 30_000 }) {
  let keys = new Map();
  let loadedAt = -Infinity;

  async function load() {
    const { keys: list } = await getJson(`${issuer}/protocol/openid-connect/certs`);
    keys = new Map(list.filter(key => key.kty === "RSA" && (!key.use || key.use === "sig")).map(key => [key.kid, createPublicKey({ key, format: "jwk" })]));
    loadedAt = now();
  }

  async function keyFor(kid) {
    const age = now() - loadedAt;
    if (age > ttlMs || (!keys.has(kid) && age > refreshMs)) await load();
    const key = keys.get(kid);
    if (!key) throw new AuthError("unknown signing key");
    return key;
  }

  return async function verifyToken(token) {
    const parts = typeof token === "string" ? token.split(".") : [];
    if (parts.length !== 3) throw new AuthError("malformed token");
    const header = parseJson(parts[0], "header");
    if (header.alg !== "RS256") throw new AuthError("unsupported algorithm");
    const key = await keyFor(header.kid);
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
    if (!verify("RSA-SHA256", signed, key, decode(parts[2]))) throw new AuthError("bad signature");

    const claims = parseJson(parts[1], "payload");
    const seconds = now() / 1000;
    if (claims.iss !== issuer) throw new AuthError("wrong issuer");
    if (typeof claims.exp !== "number" || claims.exp + skewSeconds < seconds) throw new AuthError("token expired");
    if (typeof claims.nbf === "number" && claims.nbf - skewSeconds > seconds) throw new AuthError("token not yet valid");
    const audience = [claims.azp, ...[claims.aud].flat()].filter(Boolean);
    if (!audience.includes(clientId)) throw new AuthError("token was not issued for this application");
    return claims;
  };
}
