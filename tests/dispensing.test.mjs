// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createDispensingStore } from "../server/dispensing.mjs";
import { runVerification } from "../server/verify.mjs";
import { startApp } from "./helpers.mjs";

const PATIENT = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const CODE = "DT-2026-004521";

const rxOutput = {
  valid: true,
  issuedAt: "2026-10-29T03:00:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z",
  items: [
    { name: "Clopidogrel", strength: "75 mg", quantity: 30, instructions: "Uống 1 viên/ngày" },
    { name: "Aspirin", strength: "81 mg", quantity: 10, instructions: "Uống 1 viên/ngày" },
  ],
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

function fakeClient({ createError, requestError } = {}) {
  const records = [];
  const paths = [];
  let sequence = 0;
  return {
    records,
    paths,
    async createRecord(collection, data) {
      if (createError) throw createError;
      const record = { id: `record-${++sequence}`, collection, data };
      records.push(record);
      return record;
    },
    async request(path) {
      paths.push(path);
      if (requestError) throw requestError;
      return { json: async () => ({ items: records.map(record => ({ id: record.id, data: record.data })) }) };
    },
  };
}

async function request(app, { token, body, raw, contentType = "application/json", method = "POST", path } = {}) {
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

const qr = `JH1|RX|${CODE}|${PATIENT}`;

test("the dispensing store lists entries newest first from the fixed collection", async () => {
  const client = fakeClient();
  const store = createDispensingStore({ client });

  await store.add({ prescriptionCode: CODE, outcome: "dispensed", at: "2026-11-01T08:00:00.000Z" });
  await store.add({ prescriptionCode: CODE, outcome: "refused", at: "2026-11-01T10:00:00.000Z" });
  await store.add({ prescriptionCode: CODE, outcome: "dispensed", at: "2026-11-01T09:00:00.000Z" });

  const items = await store.list();
  assert.deepEqual(items.map(entry => entry.at), [
    "2026-11-01T10:00:00.000Z",
    "2026-11-01T09:00:00.000Z",
    "2026-11-01T08:00:00.000Z",
  ]);
  assert.deepEqual(client.paths, ["/v2/data/dispensations"]);
  assert.ok(client.records.every(record => record.collection === "dispensations"));
});

test("the dispensing store turns read and write failures into a 503 error", async () => {
  const readStore = createDispensingStore({ client: fakeClient({ requestError: new Error("down") }) });
  await assert.rejects(readStore.list(), error => error.status === 503 && error.code === "store-unavailable");

  const writeStore = createDispensingStore({ client: fakeClient({ createError: new Error("down") }) });
  await assert.rejects(writeStore.add({ prescriptionCode: CODE }), error => error.status === 503 && error.code === "store-unavailable");
});

test("runVerification calls both capabilities and reports the supplied time", async () => {
  const capabilities = fakeCapabilities();
  const now = new Date("2026-11-01T12:34:56.000Z");
  const result = await runVerification({ capabilities, prescriptionCode: CODE, patient: PATIENT, now });

  assert.equal(result.prescriptionCode, CODE);
  assert.equal(result.patient, PATIENT);
  assert.equal(result.checkedAt, now.toISOString());
  assert.equal(result.dispensable, true);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(capabilities.calls.map(call => call.slug).sort(), ["allergy-list", "prescription-verify"]);
});

test("POST /api/dispense records a dispensed entry without leaking the patient", async () => {
  const capabilities = fakeCapabilities();
  const client = fakeClient();
  const app = await startApp({ capabilities, dispensing: createDispensingStore({ client }) });
  try {
    const items = [{ name: "Clopidogrel", quantity: 5, lot: "LOT-2026" }];
    const response = await request(app, { token: app.signer.sign(), path: "/api/dispense", body: { qr, items } });

    assert.equal(response.status, 201);
    assert.equal(response.body.prescriptionCode, CODE);
    assert.equal(response.body.outcome, "dispensed");
    assert.equal(response.body.pharmacist, "duocsi.nhathuoc");
    assert.ok(Number.isFinite(Date.parse(response.body.at)));
    assert.equal("patient" in response.body, false);
    assert.deepEqual(response.body.items, [{ name: "Clopidogrel", strength: "75 mg", quantity: 5, lot: "LOT-2026" }]);

    assert.equal(client.records.length, 1);
    assert.equal(client.records[0].data.patient, PATIENT);
    assert.deepEqual(capabilities.calls.map(call => call.slug).sort(), ["allergy-list", "prescription-verify"]);
  } finally { await app.close(); }
});

test("POST /api/dispense refuses a prescription that is not dispensable", async () => {
  const capabilities = fakeCapabilities({ prescription: okPrescription({ ...rxOutput, dispensed: true }) });
  const client = fakeClient();
  const app = await startApp({ capabilities, dispensing: createDispensingStore({ client }) });
  try {
    const response = await request(app, {
      token: app.signer.sign(),
      path: "/api/dispense",
      body: { prescriptionCode: CODE, patient: PATIENT, items: [{ name: "Clopidogrel", quantity: 1, lot: "LOT-2026" }] },
    });

    assert.equal(response.status, 409);
    assert.deepEqual(response.body, { error: "not-dispensable", blockers: ["already-dispensed"] });
    assert.equal(client.records.length, 0);
  } finally { await app.close(); }
});

test("POST /api/dispense refuses a prescription already dispensed in the store", async () => {
  const capabilities = fakeCapabilities();
  const client = fakeClient();
  await client.createRecord("dispensations", { prescriptionCode: CODE, outcome: "dispensed", at: "2026-10-01T00:00:00.000Z" });
  const app = await startApp({ capabilities, dispensing: createDispensingStore({ client }) });
  try {
    const before = client.records.length;
    const response = await request(app, {
      token: app.signer.sign(),
      path: "/api/dispense",
      body: { qr, items: [{ name: "Clopidogrel", quantity: 1, lot: "LOT-2026" }] },
    });

    assert.equal(response.status, 409);
    assert.deepEqual(response.body, { error: "already-dispensed" });
    assert.equal(client.records.length, before);
  } finally { await app.close(); }
});

test("POST /api/dispense rejects unknown, excessive and duplicate items", async () => {
  const capabilities = fakeCapabilities();
  const client = fakeClient();
  const app = await startApp({ capabilities, dispensing: createDispensingStore({ client }) });
  try {
    const bodies = [
      [{ name: "Unknown", quantity: 1, lot: "LOT-2026" }],
      [{ name: "Clopidogrel", quantity: 31, lot: "LOT-2026" }],
      [{ name: "Clopidogrel", quantity: 1, lot: "LOT-2026" }, { name: "Clopidogrel", quantity: 2, lot: "LOT-2027" }],
      [{ name: "Clopidogrel", quantity: 1, lot: "   " }],
    ];
    for (const items of bodies) {
      const response = await request(app, { token: app.signer.sign(), path: "/api/dispense", body: { qr, items } });
      assert.equal(response.status, 400, JSON.stringify(items));
      assert.deepEqual(response.body, { error: "items-mismatch" });
    }
    assert.equal(client.records.length, 0);
  } finally { await app.close(); }
});

test("POST /api/refuse validates the trimmed reason and records a refusal", async () => {
  const capabilities = fakeCapabilities();
  const client = fakeClient();
  const app = await startApp({ capabilities, dispensing: createDispensingStore({ client }) });
  try {
    for (const body of [{ qr }, { qr, reason: "  a  " }, { qr, reason: "x".repeat(201) }, { qr, reason: 42 }]) {
      const response = await request(app, { token: app.signer.sign(), path: "/api/refuse", body });
      assert.equal(response.status, 400, JSON.stringify(body));
    }

    const response = await request(app, {
      token: app.signer.sign(),
      path: "/api/refuse",
      body: { prescriptionCode: CODE, patient: PATIENT, reason: "  Thuốc đã hết hạn  " },
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.outcome, "refused");
    assert.equal(response.body.reason, "Thuốc đã hết hạn");
    assert.equal(response.body.pharmacist, "duocsi.nhathuoc");
    assert.equal("patient" in response.body, false);
    assert.equal(client.records[0].data.patient, PATIENT);
    assert.equal(capabilities.calls.length, 0);
  } finally { await app.close(); }
});

test("GET /api/history returns newest entries first without the patient field", async () => {
  const store = createDispensingStore({ client: fakeClient() });
  await store.add({ prescriptionCode: CODE, patient: PATIENT, outcome: "dispensed", items: [], pharmacist: "duocsi.nhathuoc", at: "2026-11-01T08:00:00.000Z" });
  await store.add({ prescriptionCode: "DT-2026-009999", patient: PATIENT, outcome: "refused", reason: "Sai liều", pharmacist: "duocsi.nhathuoc", at: "2026-11-01T09:00:00.000Z" });
  const app = await startApp({ capabilities: fakeCapabilities(), dispensing: store });
  try {
    const response = await request(app, { token: app.signer.sign(), method: "GET", path: "/api/history", contentType: null });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.items.map(entry => entry.prescriptionCode), ["DT-2026-009999", CODE]);
    assert.ok(response.body.items.every(entry => !("patient" in entry)));
  } finally { await app.close(); }
});

test("the dispensing routes require a pharmacist", async () => {
  const app = await startApp({ capabilities: fakeCapabilities(), dispensing: createDispensingStore({ client: fakeClient() }) });
  try {
    const token = app.signer.sign({ preferred_username: "bacsi.benhvien" });
    const cases = [
      { path: "/api/dispense", body: { qr, items: [{ name: "Clopidogrel", quantity: 1, lot: "LOT-2026" }] } },
      { path: "/api/refuse", body: { qr, reason: "Sai liều" } },
      { path: "/api/history", method: "GET", contentType: null },
    ];
    for (const options of cases) {
      const response = await request(app, { token, ...options });
      assert.equal(response.status, 403, options.path);
      assert.deepEqual(response.body, { error: "not-pharmacist" });
    }
  } finally { await app.close(); }
});

test("the dispensing routes are unavailable when the store is not configured", async () => {
  const app = await startApp({ capabilities: fakeCapabilities() });
  try {
    const cases = [
      { path: "/api/dispense", body: { qr, items: [{ name: "Clopidogrel", quantity: 1, lot: "LOT-2026" }] } },
      { path: "/api/refuse", body: { qr, reason: "Sai liều" } },
      { path: "/api/history", method: "GET", contentType: null },
    ];
    for (const options of cases) {
      const response = await request(app, { token: app.signer.sign(), ...options });
      assert.equal(response.status, 503, options.path);
      assert.deepEqual(response.body, { error: "junctura-not-configured" });
    }
  } finally { await app.close(); }
});

test("the store routes report an unavailable store as 503", async () => {
  const writeApp = await startApp({
    capabilities: fakeCapabilities(),
    dispensing: createDispensingStore({ client: fakeClient({ createError: new Error("down") }) }),
  });
  try {
    const response = await request(writeApp, {
      token: writeApp.signer.sign(),
      path: "/api/dispense",
      body: { qr, items: [{ name: "Clopidogrel", quantity: 1, lot: "LOT-2026" }] },
    });
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: "store-unavailable" });
  } finally { await writeApp.close(); }

  const readApp = await startApp({
    capabilities: fakeCapabilities(),
    dispensing: createDispensingStore({ client: fakeClient({ requestError: new Error("down") }) }),
  });
  try {
    const response = await request(readApp, { token: readApp.signer.sign(), method: "GET", path: "/api/history", contentType: null });
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: "store-unavailable" });
  } finally { await readApp.close(); }
});

test("the method table reports the allowed methods", async () => {
  const app = await startApp({ capabilities: fakeCapabilities(), dispensing: createDispensingStore({ client: fakeClient() }) });
  try {
    const token = app.signer.sign();
    const dispenseGet = await request(app, { token, method: "GET", path: "/api/dispense", contentType: null });
    assert.equal(dispenseGet.status, 405);
    assert.equal(dispenseGet.headers.get("allow"), "POST");

    const historyPost = await request(app, { token, path: "/api/history", body: {} });
    assert.equal(historyPost.status, 405);
    assert.equal(historyPost.headers.get("allow"), "GET, HEAD");
  } finally { await app.close(); }
});
