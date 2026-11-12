// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
// DEVELOPMENT ONLY: grants (or revokes) a demo patient's consent to Pharmacy for the
// capabilities it calls (purpose dispensing), as MyHealth will, so verification can be tried
// before MyHealth exists. Signs in as the demo patient on the local stack with the shared demo
// password written by `npm run demo:setup` in junctura-health (read, never printed).
//
//   npm run dev:consent -- benhnhan.an
//   npm run dev:consent -- benhnhan.an --revoke
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CONTRACTS } from "@junctura/health-contracts";

const APP = "junctura-pharmacy";
const PURPOSE = "dispensing";
const readEnv = path => existsSync(path) ? Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/)
  .map(line => /^([A-Z_]+)=(.*)$/.exec(line)).filter(Boolean).map(match => [match[1], match[2]])) : {};

const [patient, ...flags] = process.argv.slice(2);
const revoke = flags.includes("--revoke");
if (!patient || flags.some(flag => flag !== "--revoke")) {
  console.error("Usage: npm run dev:consent -- <patient username> [--revoke]");
  process.exit(1);
}

const healthDir = resolve(process.env.JUNCTURA_HEALTH_DIR ?? "../junctura-health");
const dxosDir = resolve(process.env.JUNCTURA_DXOS_DIR ?? "../junctura-dxos");
const demo = join(healthDir, ".junctura", "demo");
const appId = name => readEnv(join(demo, `${name}.env`)).JUNCTURA_APP_ID
  ?? (() => { throw new Error(`${name} is not enrolled: run npm run demo:setup in junctura-health first`); })();
const password = readEnv(join(demo, "accounts.env")).DEMO_PASSWORD;
if (!password) throw new Error("No demo password: run npm run demo:setup in junctura-health first");

for (const [key, value] of Object.entries(readEnv(join(dxosDir, ".env")))) process.env[key] ??= value;
process.chdir(dxosDir);
const lib = await import(pathToFileURL(join(dxosDir, "scripts", "lib", "demo-stack.mjs")).href);
const stack = await lib.connectDemoStack({ tenant: process.env.JUNCTURA_TENANT ?? "tenant-a" });
await stack.ensureManagementClient();
const token = await stack.login(patient, password);

const consumerAppId = appId(APP);
const wanted = CONTRACTS.filter(contract => contract.consumers.includes(APP) && contract.purposes.includes(PURPOSE))
  .map(contract => ({ slug: contract.slug, capabilityId: `urn:junctura:capability:${appId(contract.provider)}:${contract.slug}` }));
const listed = await (await stack.must(await stack.api("/v1/me/consents", token), [200], "List consents")).json();
const active = (listed.consents ?? []).filter(item => item.consumer?.appId === consumerAppId && item.state === "active");

for (const item of wanted) {
  const current = active.filter(consent => consent.capabilityId === item.capabilityId);
  if (revoke) {
    for (const consent of current) await stack.must(await stack.api(`/v1/me/consents/${consent.consentId}/revoke`, token, {}), [200], `Revoke ${item.slug}`);
    console.log(`• ${item.slug}: ${current.length ? "đã thu hồi" : "không có đồng thuận"}`);
  } else if (current.length) {
    console.log(`• ${item.slug}: đã có đồng thuận`);
  } else {
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await stack.must(await stack.api("/v1/me/consents", token, { consumerAppId, capabilityId: item.capabilityId, purposes: [PURPOSE], expiresAt }), [201], `Grant ${item.slug}`);
    console.log(`• ${item.slug}: đã cấp đồng thuận (${PURPOSE}, 30 ngày)`);
  }
}
