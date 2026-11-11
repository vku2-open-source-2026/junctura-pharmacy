// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadConfig } from "../server/config.mjs";
import { buildPharmacyData, loadPharmacyData } from "../server/data.mjs";
import { parseEnv } from "../server/env.mjs";
import { fixture } from "./helpers.mjs";

test("parseEnv reads KEY=VALUE lines and ignores comments", () => {
  assert.deepEqual(parseEnv("# c\nA=1\n B = \"two words\" \n\nC='x'\n#D=4\n"), { A: "1", B: "two words", C: "x" });
});

test("config requires the Junctura issuer and web client", () => {
  assert.throws(() => loadConfig({ env: { JUNCTURA_PHARMACY_ENV: "/nonexistent.env" } }), /JUNCTURA_ISSUER/);
});

test("config reads the demo credentials file and lets the environment override it", () => {
  const dir = mkdtempSync(join(tmpdir(), "pharmacy-env-"));
  const file = join(dir, "pharmacy.env");
  writeFileSync(file, "JUNCTURA_ISSUER=https://id.example.test/identity/realms/junctura/\nJUNCTURA_WEB_CLIENT_ID=health-pharmacy-web\nWEB_PORT=5184\nJUNCTURA_APP_CLIENT_SECRET=never-exposed\n");
  const config = loadConfig({ env: { JUNCTURA_PHARMACY_ENV: file }, cwd: dir });
  assert.equal(config.issuer, "https://id.example.test/identity/realms/junctura");
  assert.equal(config.port, 5184);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.staticDir, resolve(dir, "web/dist"));
  assert.equal(JSON.stringify(config).includes("never-exposed"), false, "the backend client secret is not part of the configuration");
  assert.equal(loadConfig({ env: { JUNCTURA_PHARMACY_ENV: file, PORT: "6000" }, cwd: dir }).port, 6000);
  assert.equal(loadConfig({ env: { JUNCTURA_PHARMACY_ENV: file, PHARMACY_STATIC_DIR: "public" }, cwd: dir }).staticDir, resolve(dir, "public"));
  assert.throws(() => loadConfig({ env: { JUNCTURA_PHARMACY_ENV: file, PORT: "x" }, cwd: dir }), /PORT/);
});

test("pharmacy data keeps only this application's staff and no patient data", () => {
  const data = buildPharmacyData(fixture);
  assert.equal(data.facility, "Nhà thuốc");
  assert.deepEqual([...data.staff.keys()], ["duocsi.nhathuoc"]);
  assert.equal(data.staff.get("duocsi.nhathuoc").role, "pharmacist");
  assert.deepEqual(Object.keys(data).sort(), ["facility", "staff"]);
});

const healthDir = resolve(process.env.JUNCTURA_HEALTH_DIR ?? "../junctura-health");
test("the pharmacy staff list loads from junctura-health when available", { skip: !existsSync(join(healthDir, "seed/data/accounts.json")) && "junctura-health checkout not found" }, async () => {
  const data = await loadPharmacyData({ healthDir });
  assert.equal(data.facility, "Nhà thuốc");
  assert.deepEqual([...data.staff.keys()], ["duocsi.nhathuoc"]);
  assert.equal(data.staff.get("duocsi.nhathuoc").displayName, "DS. Võ Thu Trang");
});
