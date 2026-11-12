// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { AuthError } from "./jwt.mjs";
import { isLowercaseUuid, isValidPrescriptionCode, parsePrescriptionQr } from "./prescription-qr.mjs";
import { runVerification } from "./verify.mjs";

const MAX_BODY_BYTES = 4 * 1024;

const API_METHODS = new Map([
  ["/api/verify", "POST"],
  ["/api/dispense", "POST"],
  ["/api/refuse", "POST"],
  ["/api/history", "GET, HEAD"],
]);

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

const isJsonRequest = req => {
  const value = req.headers["content-type"];
  return typeof value === "string" && value.split(";", 1)[0].trim().toLowerCase() === "application/json";
};

function readJsonBody(req) {
  return new Promise(resolve => {
    let settled = false;
    const settle = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      req.resume();
      settle({ status: 413 });
      return;
    }

    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settle({ status: 413 });
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      try {
        settle({ body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
      } catch {
        settle({ status: 400 });
      }
    });
    req.on("error", () => settle({ status: 400 }));
  });
}

function verificationRequest(body, extras = []) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body).filter(key => !extras.includes(key));

  if (keys.length === 1 && keys[0] === "qr" && typeof body.qr === "string") {
    return parsePrescriptionQr(body.qr);
  }
  if (keys.length === 2 && keys.includes("prescriptionCode") && keys.includes("patient")
    && isValidPrescriptionCode(body.prescriptionCode) && isLowercaseUuid(body.patient)) {
    return { prescriptionCode: body.prescriptionCode, patient: body.patient };
  }
  return null;
}

/**
 * Request handler of the Pharmacy server: a small JSON API behind Junctura sign-in plus the
 * built web UI. Staff are the demo accounts of this application; every other signed-in
 * person is refused.
 */
export function createApp({ config, data, verifier, capabilities, dispensing }) {
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

  async function verify(req, res) {
    if (!capabilities) return send(res, 503, { error: "junctura-not-configured" });
    if (!isJsonRequest(req)) return send(res, 415, { error: "unsupported-media-type" });

    const parsed = await readJsonBody(req);
    if (parsed.status === 413) return send(res, 413, { error: "payload-too-large" });
    if (parsed.status === 400) return send(res, 400, { error: "invalid-request" });

    const request = verificationRequest(parsed.body);
    if (!request) return send(res, 400, { error: "invalid-request" });

    return send(res, 200, await runVerification({ capabilities, ...request }));
  }

  // Store and capability failures only log an error code, never patient data.
  function storeFailure(res, error) {
    if (error?.status === 503) {
      console.error(error.code ?? "store-unavailable");
      return send(res, 503, { error: "store-unavailable" });
    }
    console.error(error?.code ?? "internal-error");
    return send(res, 500, { error: "internal-error" });
  }

  async function dispense(req, res, user) {
    if (!dispensing || !capabilities) return send(res, 503, { error: "junctura-not-configured" });
    if (!isJsonRequest(req)) return send(res, 415, { error: "unsupported-media-type" });

    const parsed = await readJsonBody(req);
    if (parsed.status === 413) return send(res, 413, { error: "payload-too-large" });
    if (parsed.status === 400) return send(res, 400, { error: "invalid-request" });

    const request = verificationRequest(parsed.body, ["items"]);
    if (!request || !Array.isArray(parsed.body.items)) return send(res, 400, { error: "invalid-request" });

    try {
      const result = await runVerification({ capabilities, ...request });
      if (!result.dispensable) return send(res, 409, { error: "not-dispensable", blockers: result.blockers });

      const history = await dispensing.list();
      if (history.some(entry => entry.prescriptionCode === request.prescriptionCode && entry.outcome === "dispensed")) {
        return send(res, 409, { error: "already-dispensed" });
      }

      const prescribed = new Map((result.prescription?.output?.items ?? []).map(item => [item.name, item]));
      const seen = new Set();
      const items = [];
      for (const item of parsed.body.items) {
        if (!item || typeof item !== "object" || Array.isArray(item)) return send(res, 400, { error: "items-mismatch" });
        const { name, quantity } = item;
        const lot = typeof item.lot === "string" ? item.lot.trim() : item.lot;
        const prescribedItem = prescribed.get(name);
        if (typeof name !== "string" || !prescribedItem || seen.has(name)
          || !Number.isInteger(quantity) || quantity < 1 || quantity > prescribedItem.quantity
          || typeof lot !== "string" || lot.length < 1 || lot.length > 40) {
          return send(res, 400, { error: "items-mismatch" });
        }
        seen.add(name);
        items.push({ name, strength: prescribedItem.strength, quantity, lot });
      }
      if (items.length === 0) return send(res, 400, { error: "items-mismatch" });

      const entry = {
        prescriptionCode: request.prescriptionCode,
        patient: request.patient,
        outcome: "dispensed",
        items,
        pharmacist: user.username,
        at: new Date().toISOString(),
      };
      await dispensing.add(entry);
      const { patient: omitted, ...visible } = entry;
      return send(res, 201, visible);
    } catch (error) {
      return storeFailure(res, error);
    }
  }

  async function refuse(req, res, user) {
    if (!dispensing) return send(res, 503, { error: "junctura-not-configured" });
    if (!isJsonRequest(req)) return send(res, 415, { error: "unsupported-media-type" });

    const parsed = await readJsonBody(req);
    if (parsed.status === 413) return send(res, 413, { error: "payload-too-large" });
    if (parsed.status === 400) return send(res, 400, { error: "invalid-request" });

    const request = verificationRequest(parsed.body, ["reason"]);
    if (!request) return send(res, 400, { error: "invalid-request" });

    const reason = typeof parsed.body.reason === "string" ? parsed.body.reason.trim() : "";
    if ([...reason].length < 3 || [...reason].length > 200) return send(res, 400, { error: "invalid-request" });

    try {
      const entry = {
        prescriptionCode: request.prescriptionCode,
        patient: request.patient,
        outcome: "refused",
        reason,
        pharmacist: user.username,
        at: new Date().toISOString(),
      };
      await dispensing.add(entry);
      const { patient: omitted, ...visible } = entry;
      return send(res, 201, visible);
    } catch (error) {
      return storeFailure(res, error);
    }
  }

  async function history(req, res) {
    if (!dispensing) return send(res, 503, { error: "junctura-not-configured" });
    try {
      const items = (await dispensing.list()).map(({ patient, ...entry }) => entry);
      return send(res, 200, { items });
    } catch (error) {
      return storeFailure(res, error);
    }
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
    if (url.pathname === "/api/verify" || url.pathname === "/api/dispense"
      || url.pathname === "/api/refuse" || url.pathname === "/api/history") {
      if (!user || user.role !== "pharmacist") return send(res, 403, { error: "not-pharmacist" });
      if (url.pathname === "/api/verify") return verify(req, res);
      if (url.pathname === "/api/dispense") return dispense(req, res, user);
      if (url.pathname === "/api/refuse") return refuse(req, res, user);
      return history(req, res);
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
      const allowed = API_METHODS.get(url.pathname) ?? "GET, HEAD";
      if (!allowed.split(", ").includes(req.method)) {
        return send(res, 405, { error: "method-not-allowed" }, { allow: allowed });
      }
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      return serveStatic(res, decodeURIComponent(url.pathname));
    } catch (error) {
      console.error(error);
      if (!res.headersSent) send(res, 500, { error: "internal-error" });
      else res.end();
    }
  };
}
