// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
// DEVELOPMENT STAND-IN for trying Pharmacy end to end before the real providers run. It plays
// the provider side of Hospital (prescription-verify) or Clinic (allergy-list) from the
// synthetic seed of junctura-health (read only) and behaves like a real provider: it redeems
// the single-use ticket, checks the context against the contract, answers only for the patient
// in the ticket and validates its output. It is not part of Pharmacy itself.
//
//   node scripts/dev-providers/provider.mjs hospital|clinic
//
// Environment: PROVIDER_TLS_CERT, PROVIDER_TLS_KEY (from `npm run provider:pki` in
// junctura-dxos), PROVIDER_PORT (8443), JUNCTURA_HEALTH_DIR, GATEWAY_UPSTREAM (host:port of
// the Junctura gateway seen from this process).
import { readFileSync } from "node:fs";
import { createServer as createHttps } from "node:https";
import { connect, createServer as createTcp } from "node:net";
import { resolve } from "node:path";
import { checkContext, getContract, validateValue } from "@junctura/health-contracts";
import { createJuncturaClient } from "@junctura/server-client";

const DAY = 86_400_000;
const AN = "525fd3dc-fa8c-4472-9c8d-2359aa031f40";

// Same projections as the contracts expect; an empty allergy list is "not-recorded", never "none".
const answers = {
  hospital: {
    app: "junctura-hospital",
    seed: "hospital.json",
    "prescription-verify": (data, subject, { prescriptionCode }) => {
      const rx = data.prescriptions.find(item => item.prescriptionCode === prescriptionCode && item.subject === subject);
      return rx && { valid: Date.parse(rx.expiresAt) >= Date.now(), issuedAt: rx.issuedAt, expiresAt: rx.expiresAt, items: rx.items, dispensed: rx.dispensed };
    },
  },
  clinic: {
    app: "junctura-clinic",
    seed: "clinic.json",
    "allergy-list": (data, subject) => {
      const patient = data.patients.find(item => item.subject === subject);
      return patient && { allergies: patient.allergies, allergyState: patient.allergies.length ? "recorded" : "not-recorded", updatedAt: patient.updatedAt };
    },
  },
};

const role = answers[process.argv[2]];
if (!role) { console.error("Usage: node scripts/dev-providers/provider.mjs hospital|clinic"); process.exit(1); }

const healthDir = resolve(process.env.JUNCTURA_HEALTH_DIR ?? "../junctura-health");
const env = Object.fromEntries(readFileSync(resolve(healthDir, `.junctura/demo/${role.app}.env`), "utf8").split(/\r?\n/)
  .map(line => /^([A-Z_]+)=(.*)$/.exec(line)).filter(Boolean).map(match => [match[1], match[2]]));

// Shift the synthetic dates so the reference date of the seed is today (as Clinic does).
const data = JSON.parse(readFileSync(resolve(healthDir, "seed/data", role.seed), "utf8"));
const offset = Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(data.referenceDate)) / DAY) * DAY;
const shift = value => new Date(Date.parse(value) + offset).toISOString();
if (data.prescriptions) {
  data.prescriptions = data.prescriptions.map(rx => ({ ...rx, issuedAt: shift(rx.issuedAt), expiresAt: shift(rx.expiresAt) }));
  // Scenario prescription (junctura-health docs/APPS.md section 9, step 3): Amoxicillin for
  // Nguyễn Văn An, who has a penicillin allergy, so the allergy warning can be shown. Synthetic.
  data.prescriptions.push({ prescriptionCode: "DT-2026-004537", subject: AN, issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * DAY).toISOString(), dispensed: false,
    items: [{ name: "Amoxicillin", strength: "500 mg", quantity: 21, instructions: "Uống 1 viên x 3 lần/ngày" }] });
}

// @junctura/server-client only accepts an HTTPS gateway or HTTP loopback; inside the provider
// network the gateway is plain HTTP, so forward a loopback port to it (development only).
const [upstreamHost, upstreamPort] = (process.env.GATEWAY_UPSTREAM ?? "gateway:8080").split(":");
const forward = createTcp(socket => {
  const out = connect(Number(upstreamPort), upstreamHost);
  socket.pipe(out).pipe(socket);
  out.on("error", () => socket.destroy());
  socket.on("error", () => out.destroy());
});
await new Promise(done => forward.listen(18080, "127.0.0.1", done));

const junctura = createJuncturaClient({ baseUrl: "http://127.0.0.1:18080", clientId: env.JUNCTURA_APP_CLIENT_ID, clientSecret: env.JUNCTURA_APP_CLIENT_SECRET });
// Fetch the client token once at start: the first call must fit the capability timeout (2 s).
await junctura.identity().catch(error => console.error(`warm-up: ${error?.code ?? "failed"}`));

const reply = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

createHttps({ cert: readFileSync(process.env.PROVIDER_TLS_CERT), key: readFileSync(process.env.PROVIDER_TLS_KEY) }, async (req, res) => {
  const slug = /^\/capabilities\/([a-z-]+)$/.exec(req.url ?? "")?.[1];
  const answer = slug && typeof role[slug] === "function" ? role[slug] : null;
  if (req.method !== "POST" || !answer) return reply(res, 404, { error: "not_found" });
  let body;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return reply(res, 400, { error: "invalid_request" }); }
  try {
    const redeemed = await junctura.redeemTicket({ authorization: req.headers.authorization, invocationId: body.invocationId, input: body.input });
    if (!redeemed.active) return reply(res, 403, { error: "invalid_ticket" });
    const decision = checkContext(slug, redeemed.context);
    if (!decision.allowed) return reply(res, 403, { error: decision.reason });
    const output = answer(data, redeemed.context.dataSubject, body.input ?? {});
    if (!output) return reply(res, 404, { error: "no_record" });
    if (validateValue(getContract(slug).outputSchema, output).length) return reply(res, 500, { error: "invalid_output" });
    console.log(`${slug}: answered (${redeemed.context.purpose})`);
    return reply(res, 200, { output });
  } catch (error) {
    console.error(`${slug}: ${error?.code ?? "failed"}`);
    return reply(res, 502, { error: "provider_failed" });
  }
}).listen(Number(process.env.PROVIDER_PORT ?? 8443), "0.0.0.0", () => console.log(`Dev ${process.argv[2]} provider ready`));
