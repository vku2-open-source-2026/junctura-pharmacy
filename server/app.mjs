// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { AuthError } from "./jwt.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".ico": "image/x-icon", ".png": "image/png", ".txt": "text/plain; charset=utf-8",
};

const securityHeaders = config => ({
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": [
    "default-src 'self'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'",
    `connect-src 'self' ${new URL(config.issuer).origin}`, "img-src 'self' data:", "style-src 'self' 'unsafe-inline'",
  ].join("; "),
});

/**
 * Request handler of the Pharmacy server: a small JSON API behind Junctura sign-in plus the
 * built web UI. Staff are the demo accounts of this application; every other signed-in
 * person is refused.
 */
export function createApp({ config, data, verifier, capabilities }) {
  const base = securityHeaders(config);

  const send = (res, status, body, headers = {}) => {
    const json = body === undefined ? "" : JSON.stringify(body);
    res.writeHead(status, { ...base, "cache-control": "no-store", ...(json && { "content-type": "application/json; charset=utf-8" }), ...headers });
    res.end(json);
  };

  async function authenticate(req) {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "");
    if (!match) throw new AuthError("sign in required");
    const claims = await verifier(match[1]);
    const user = data.staff.get(claims.preferred_username);
    return user ? { username: user.username, displayName: user.displayName, role: user.role } : null;
  }

  async function api(req, res, url) {
    if (url.pathname === "/api/config") {
      return send(res, 200, { issuer: config.issuer, clientId: config.webClientId, facility: data.facility });
    }
    let user;
    try {
      user = await authenticate(req);
    } catch (error) {
      if (!(error instanceof AuthError)) console.error(`token check failed: ${error.message}`);
      return send(res, 401, { error: "unauthenticated" }, { "www-authenticate": "Bearer" });
    }
    if (!user) return send(res, 403, { error: "not-pharmacy-staff" });

    if (url.pathname === "/api/me") return send(res, 200, user);
    return send(res, 404, { error: "not-found" });
  }

  function serveStatic(res, pathname) {
    const target = normalize(join(config.staticDir, pathname === "/" ? "index.html" : pathname));
    const root = config.staticDir + sep;
    let file = target.startsWith(root) && existsSync(target) && statSync(target).isFile() ? target : null;
    // Unknown paths without an extension belong to the single-page app.
    if (!file && !extname(pathname)) file = join(config.staticDir, "index.html");
    if (!file || !existsSync(file)) return send(res, 404, { error: "not-found" });
    const immutable = pathname.startsWith("/assets/");
    res.writeHead(200, { ...base, "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
    createReadStream(file).pipe(res);
  }

  return async function handle(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/healthz") return send(res, 200, { status: "ok" });
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method-not-allowed" }, { allow: "GET, HEAD" });
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      return serveStatic(res, decodeURIComponent(url.pathname));
    } catch (error) {
      console.error(error);
      if (!res.headersSent) send(res, 500, { error: "internal-error" });
      else res.end();
    }
  };
}
