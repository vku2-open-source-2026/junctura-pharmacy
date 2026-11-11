// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startApp } from "./helpers.mjs";

const get = async (base, path, token, init = {}) => {
  const response = await fetch(base + path, { ...init, headers: { ...(token && { authorization: `Bearer ${token}` }) } });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, headers: response.headers };
};

test("health and public config need no sign-in", async () => {
  const app = await startApp();
  try {
    assert.equal((await get(app.base, "/healthz")).status, 200);
    const config = await get(app.base, "/api/config");
    assert.equal(config.status, 200);
    assert.deepEqual(Object.keys(config.body).sort(), ["clientId", "facility", "issuer"]);
    assert.equal(config.body.facility, "Nhà thuốc");
  } finally { await app.close(); }
});

test("the account endpoint requires a valid token", async () => {
  const app = await startApp();
  try {
    const anonymous = await get(app.base, "/api/me");
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get("www-authenticate"), "Bearer");
    assert.equal((await get(app.base, "/api/me", "garbage")).status, 401);
    assert.equal((await get(app.base, "/api/me", app.signer.sign({ exp: 1 }))).status, 401);
  } finally { await app.close(); }
});

test("signed-in people who are not pharmacy staff are refused", async () => {
  const app = await startApp();
  try {
    for (const username of ["bacsi.benhvien", "someone.unknown"]) {
      const response = await get(app.base, "/api/me", app.signer.sign({ preferred_username: username }));
      assert.equal(response.status, 403, username);
      assert.deepEqual(response.body, { error: "not-pharmacy-staff" });
    }
  } finally { await app.close(); }
});

test("pharmacy staff can read their own account", async () => {
  const app = await startApp();
  try {
    const me = await get(app.base, "/api/me", app.signer.sign());
    assert.deepEqual(me.body, { username: "duocsi.nhathuoc", displayName: "DS. Võ Thu Trang", role: "pharmacist" });
    assert.equal((await get(app.base, "/api/patients", app.signer.sign())).status, 404);
    assert.equal((await get(app.base, "/api/unknown", app.signer.sign())).status, 404);
  } finally { await app.close(); }
});

test("only reads are allowed and responses carry security headers", async () => {
  const app = await startApp();
  try {
    const post = await get(app.base, "/api/me", app.signer.sign(), { method: "POST" });
    assert.equal(post.status, 405);
    const response = await get(app.base, "/healthz");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.match(response.headers.get("content-security-policy"), /connect-src 'self' https:\/\/id\.example\.test/);
  } finally { await app.close(); }
});

test("serves the built UI, falls back to the app shell and never leaves the directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pharmacy-ui-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Pharmacy</title>");
  writeFileSync(join(dir, "assets", "app.js"), "console.log(1)");
  writeFileSync(join(dir, "..", "pharmacy-secret.txt"), "secret");
  const app = await startApp({ staticDir: dir });
  try {
    const index = await get(app.base, "/");
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-type"), /text\/html/);
    assert.match((await get(app.base, "/dispensing")).body, /<title>Pharmacy/);
    const asset = await get(app.base, "/assets/app.js");
    assert.match(asset.headers.get("content-type"), /javascript/);
    assert.match(asset.headers.get("cache-control"), /immutable/);
    assert.equal((await get(app.base, "/assets/missing.js")).status, 404);
    for (const path of ["/../pharmacy-secret.txt", "/%2e%2e/pharmacy-secret.txt", "/..%2fpharmacy-secret.txt"]) {
      const response = await get(app.base, path);
      assert.ok(!String(response.body).includes("secret"), path);
    }
  } finally { await app.close(); }
});
