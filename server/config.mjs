// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "./env.mjs";

const DEFAULT_PORT = 5184;

/**
 * Configuration comes from the environment. For the local demo, the credentials file
 * that `npm run demo:setup` (junctura-health) wrote for this app is read too; real
 * environment variables win over the file. Nothing here is ever sent to a browser
 * except the public issuer and the public web client id.
 */
export function loadConfig({ env = process.env, cwd = process.cwd() } = {}) {
  const healthDir = resolve(cwd, env.JUNCTURA_HEALTH_DIR ?? "../junctura-health");
  const envFile = resolve(cwd, env.JUNCTURA_PHARMACY_ENV ?? `${healthDir}/.junctura/demo/junctura-pharmacy.env`);
  const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
  const get = key => env[key] ?? fromFile[key];

  const issuer = get("JUNCTURA_ISSUER");
  const webClientId = get("JUNCTURA_WEB_CLIENT_ID");
  if (!issuer || !webClientId) {
    throw new Error("JUNCTURA_ISSUER and JUNCTURA_WEB_CLIENT_ID are required. Run `npm run demo:setup` in junctura-health, or set them in the environment.");
  }
  const port = Number(get("PORT") ?? get("WEB_PORT") ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError("PORT must be a valid port number");
  const juncturaUrl = get("JUNCTURA_URL");
  const juncturaClientId = get("JUNCTURA_APP_CLIENT_ID");
  const juncturaClientSecret = get("JUNCTURA_APP_CLIENT_SECRET");
  const junctura = juncturaUrl && juncturaClientId && juncturaClientSecret
    ? Object.freeze({ url: juncturaUrl, clientId: juncturaClientId, clientSecret: juncturaClientSecret })
    : null;
  return Object.freeze({
    issuer: issuer.replace(/\/+$/, ""),
    webClientId,
    port,
    host: get("HOST") ?? "127.0.0.1",
    healthDir,
    staticDir: resolve(cwd, get("PHARMACY_STATIC_DIR") ?? "web/dist"),
    junctura,
  });
}
