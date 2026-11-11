// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { parsePrescriptionQr } from "../server/prescription-qr.mjs";
import { computeDispensable } from "../server/verify.mjs";
import { startApp } from "./helpers.mjs";

const PATIENT = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const CODE = "DT-2026-004521";
const NOW = new Date("2026-11-01T00:00:00.000Z");

const rxOutput = {
  valid: true,
  issuedAt: "2026-10-29T03:00:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z",
  items: [{ name: "Clopidogrel", strength: "75 mg", quantity: 30, instructions: "Uống 1 viên/ngày" }],
  dispensed: false,
};

const allergyOutput = {
  allergies: [{ substance: "Penicillin", severity: "severe", reaction: "Nổi mề đay" }],
  allergyState: "recorded",
  updatedAt: "2026-10-28T09:15:00.000Z",
};

const okPrescription = output => ({ status: "ok", output, receivedAt: "2026-11-01T00:00:00.000Z" });
const okAllergies = () => ({ status: "ok", output: allergyOutput, receivedAt: "2026-11-01T00:00:00.000Z" });

function fakeCapabilities({ prescription = okPrescription(rxOutput), allergies = okAllergies() } = {}) {
  const calls = [];
  return {
    calls,
    async call(slug, input, context) {
      calls.push({ slug, input, context });
      if (slug === "prescription-verify") return prescription;
      if (slug === "allergy-list") return allergies;
      return { status: "unavailable" };
    },
  };
}

async function post(app, { token, body, raw, contentType = "application/json", method = "POST", path = "/api/verify" } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (contentType !== null) headers["content-type"] = contentType;
  const payload = raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body);
  const response = await fetch(app.base + path, { method, headers, body: payload });
  const text = await response.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* keep the raw text */ }
  return { status: response.status, body: parsed, headers: response.headers };
}

test("a valid, unused, unexpired prescription is dispensable", () => {
  assert.deepEqual(computeDispensable(okPrescription(rxOutput), okAllergies(), NOW), { dispensable: true, blockers: [] });
});

test("a failed prescription call reports prescription-unavailable", () => {
  const result = computeDispensable({ status: "unavailable", reason: "gateway_unavailable" }, okAllergies(), NOW);
  assert.deepEqual(result, { dispensable: false, blockers: ["prescription-unavailable"] });
});

test("invalid, expired and already dispensed prescriptions list every blocker", () => {
  const output = { ...rxOutput, valid: false, expiresAt: "2026-10-31T00:00:00.000Z", dispensed: true };
  assert.deepEqual(computeDispensable(okPrescription(output), okAllergies(), NOW), {
    dispensable: false,
    blockers: ["invalid", "expired", "already-dispensed"],
  });
});

test("expiry is exclusive: expiresAt equal to now is expired", () => {
  const output = { ...rxOutput, expiresAt: NOW.toISOString() };
  assert.deepEqual(computeDispensable(okPrescription(output), okAllergies(), NOW), {
    dispensable: false,
    blockers: ["expired"],
  });
});

test("one millisecond after now is still valid", () => {
  const output = { ...rxOutput, expiresAt: new Date(NOW.getTime() + 1).toISOString() };
  assert.deepEqual(computeDispensable(okPrescription(output), okAllergies(), NOW), { dispensable: true, blockers: [] });
});

test("an unknown allergy state is reported but does not withhold the prescription", () => {
  const result = computeDispensable(okPrescription(rxOutput), { status: "failed", reason: "boom" }, NOW);
  assert.deepEqual(result, { dispensable: true, blockers: ["allergies-unknown"] });
});

test("parsePrescriptionQr reads the temporary JH1|RX format", () => {
  assert.deepEqual(parsePrescriptionQr(`JH1|RX|${CODE}|${PATIENT}`), { prescriptionCode: CODE, patient: PATIENT });
});

test("parsePrescriptionQr rejects missing parts and the wrong prefix", () => {
  for (const text of [`JH1|RX|${CODE}`, `JH1|RX|${CODE}|${PATIENT}|extra`, `JH2|RX|${CODE}|${PATIENT}`, `JH1|XX|${CODE}|${PATIENT}`, ""]) {
    assert.equal(parsePrescriptionQr(text), null, text);
  }
});

test("parsePrescriptionQr rejects an invalid subject", () => {
  for (const subject of [PATIENT.toUpperCase(), "not-a-uuid", "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3", " 0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d"]) {
    assert.equal(parsePrescriptionQr(`JH1|RX|${CODE}|${subject}`), null, subject);
  }
});

test("parsePrescriptionQr rejects empty or over-long prescription codes", () => {
  assert.equal(parsePrescriptionQr(`JH1|RX||${PATIENT}`), null);
  assert.equal(parsePrescriptionQr(`JH1|RX|${"A".repeat(33)}|${PATIENT}`), null);
  assert.deepEqual(parsePrescriptionQr(`JH1|RX|${"A".repeat(32)}|${PATIENT}`), { prescriptionCode: "A".repeat(32), patient: PATIENT });
  assert.equal(parsePrescriptionQr(null), null);
});

test("POST /api/verify requires a signed-in pharmacist", async () => {
  const app = await startApp({ capabilities: fakeCapabilities() });
  try {
    const anonymous = await post(app, { body: { qr: `JH1|RX|${CODE}|${PATIENT}` } });
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get("www-authenticate"), "Bearer");

    const physician = await post(app, { token: app.signer.sign({ preferred_username: "bacsi.benhvien" }), body: { qr: `JH1|RX|${CODE}|${PATIENT}` } });
    assert.equal(physician.status, 403);
    assert.deepEqual(physician.body, { error: "not-pharmacist" });
  } finally { await app.close(); }
});

test("POST /api/verify rejects a wrong content type, a body that is too large and broken JSON", async () => {
  const app = await startApp({ capabilities: fakeCapabilities() });
  try {
    const token = app.signer.sign();
    assert.equal((await post(app, { token, contentType: "text/plain", raw: "{}" })).status, 415);
    assert.equal((await post(app, { token, contentType: null, raw: "{}" })).status, 415);

    const huge = JSON.stringify({ qr: `JH1|RX|${"A".repeat(5000)}|${PATIENT}` });
    assert.equal((await post(app, { token, raw: huge })).status, 413);

    const broken = await post(app, { token, raw: "{" });
    assert.equal(broken.status, 400);
    assert.deepEqual(broken.body, { error: "invalid-request" });
  } finally { await app.close(); }
});

test("POST /api/verify rejects bodies that match neither request shape", async () => {
  const app = await startApp({ capabilities: fakeCapabilities() });
  try {
    const token = app.signer.sign();
    const bodies = [
      {},
      { qr: "not-a-qr" },
      { qr: `JH1|RX|${CODE}|${PATIENT}`, prescriptionCode: CODE },
      { prescriptionCode: CODE },
      { prescriptionCode: CODE, patient: "not-a-uuid" },
      { prescriptionCode: "A".repeat(33), patient: PATIENT },
      [],
      null,
    ];
    for (const body of bodies) {
      const response = await post(app, { token, body });
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.deepEqual(response.body, { error: "invalid-request" });
    }
  } finally { await app.close(); }
});

test("POST /api/verify is unavailable when Junctura is not configured", async () => {
  const app = await startApp({ capabilities: null });
  try {
    const response = await post(app, { token: app.signer.sign(), body: { qr: `JH1|RX|${CODE}|${PATIENT}` } });
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: "junctura-not-configured" });
  } finally { await app.close(); }
});

test("POST /api/verify with a QR calls both capabilities for dispensing and the scanned patient", async () => {
  const capabilities = fakeCapabilities();
  const app = await startApp({ capabilities });
  try {
    const response = await post(app, { token: app.signer.sign(), body: { qr: `JH1|RX|${CODE}|${PATIENT}` } });
    assert.equal(response.status, 200);
    assert.equal(response.body.prescriptionCode, CODE);
    assert.equal(response.body.patient, PATIENT);
    assert.ok(Number.isFinite(Date.parse(response.body.checkedAt)));
    assert.deepEqual(response.body.prescription, okPrescription(rxOutput));
    assert.deepEqual(response.body.allergies, okAllergies());
    assert.equal(response.body.dispensable, true);
    assert.deepEqual(response.body.blockers, []);

    assert.equal(capabilities.calls.length, 2);
    const bySlug = Object.fromEntries(capabilities.calls.map(call => [call.slug, call]));
    assert.deepEqual(bySlug["prescription-verify"].input, { prescriptionCode: CODE });
    assert.deepEqual(bySlug["allergy-list"].input, {});
    for (const slug of ["prescription-verify", "allergy-list"]) {
      assert.deepEqual(bySlug[slug].context, { purpose: "dispensing", dataSubject: PATIENT });
    }
  } finally { await app.close(); }
});

test("POST /api/verify with a typed code and patient behaves like the QR form", async () => {
  const capabilities = fakeCapabilities();
  const app = await startApp({ capabilities });
  try {
    const response = await post(app, { token: app.signer.sign(), body: { prescriptionCode: CODE, patient: PATIENT } });
    assert.equal(response.status, 200);
    assert.equal(response.body.prescriptionCode, CODE);
    assert.equal(response.body.patient, PATIENT);
    assert.equal(response.body.dispensable, true);
    assert.deepEqual(capabilities.calls.map(call => call.slug).sort(), ["allergy-list", "prescription-verify"]);
  } finally { await app.close(); }
});

test("POST /api/verify reports a failed prescription and unknown allergies together", async () => {
  const capabilities = fakeCapabilities({
    prescription: { status: "no-consent" },
    allergies: { status: "unavailable", reason: "gateway_unavailable" },
  });
  const app = await startApp({ capabilities });
  try {
    const response = await post(app, { token: app.signer.sign(), body: { prescriptionCode: CODE, patient: PATIENT } });
    assert.equal(response.status, 200);
    assert.equal(response.body.dispensable, false);
    assert.deepEqual(response.body.blockers, ["prescription-unavailable", "allergies-unknown"]);
  } finally { await app.close(); }
});

test("POST /api/verify does not call Junctura when the request is invalid", async () => {
  const capabilities = fakeCapabilities();
  const app = await startApp({ capabilities });
  try {
    const response = await post(app, { token: app.signer.sign(), body: { qr: "bad" } });
    assert.equal(response.status, 400);
    assert.equal(capabilities.calls.length, 0);
  } finally { await app.close(); }
});

test("only POST is allowed on /api/verify while other API paths keep the read-only rule", async () => {
  const app = await startApp({ capabilities: fakeCapabilities() });
  try {
    const verifyGet = await post(app, { token: app.signer.sign(), method: "GET", body: undefined });
    assert.equal(verifyGet.status, 405);
    assert.equal(verifyGet.headers.get("allow"), "POST");

    const mePost = await post(app, { token: app.signer.sign(), path: "/api/me", body: {} });
    assert.equal(mePost.status, 405);
    assert.equal(mePost.headers.get("allow"), "GET, HEAD");
  } finally { await app.close(); }
});
