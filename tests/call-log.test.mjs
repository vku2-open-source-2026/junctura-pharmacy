// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createCallLog } from "../server/call-log.mjs";
import { startApp } from "./helpers.mjs";

const PATIENT = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const CODE = "DT-2026-004521";

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
  return {
    async call(slug) {
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

async function request(app, { token, body, method = "POST", path, contentType = "application/json" } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (contentType !== null) headers["content-type"] = contentType;
  const response = await fetch(app.base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* keep the raw text */ }
  return { status: response.status, body: parsed };
}

const safeKeys = ["at", "capability", "outcome", "pharmacist", "prescriptionCode", "purpose"];

test("the call log lists entries newest first and stores no patient, item or allergy data", async () => {
  const client = fakeClient();
  const store = createCallLog({ client });

  await store.add({
    capability: "prescription-verify",
    purpose: "dispensing",
    outcome: "ok",
    prescriptionCode: CODE,
    pharmacist: "duocsi.nhathuoc",
    at: "2026-11-01T08:00:00.000Z",
    patient: PATIENT,
    items: rxOutput.items,
    allergies: allergyOutput.allergies,
  });
  await store.add({
    capability: "allergy-list",
    purpose: "dispensing",
    outcome: "no-consent",
    prescriptionCode: CODE,
    pharmacist: "duocsi.nhathuoc",
    at: "2026-11-01T10:00:00.000Z",
  });

  const items = await store.list();
  assert.deepEqual(items.map(entry => entry.at), ["2026-11-01T10:00:00.000Z", "2026-11-01T08:00:00.000Z"]);
  assert.deepEqual(Object.keys(items[0]).sort(), safeKeys);
  assert.deepEqual(Object.keys(items[1]).sort(), safeKeys);
  assert.equal(JSON.stringify(items).includes(PATIENT), false);
  assert.equal(JSON.stringify(items).includes("Clopidogrel"), false);
  assert.equal(JSON.stringify(items).includes("Penicillin"), false);
  assert.deepEqual(client.paths, ["/v2/data/call-log"]);
  assert.ok(client.records.every(record => record.collection === "call-log"));
});

test("the call log turns read and write failures into a 503 error", async () => {
  const readStore = createCallLog({ client: fakeClient({ requestError: new Error("down") }) });
  await assert.rejects(readStore.list(), error => error.status === 503 && error.code === "store-unavailable");

  const writeStore = createCallLog({ client: fakeClient({ createError: new Error("down") }) });
  await assert.rejects(
    writeStore.add({ capability: "allergy-list", at: "2026-11-01T08:00:00.000Z" }),
    error => error.status === 503 && error.code === "store-unavailable",
  );
});

test("GET /api/call-log returns the calls without patient data", async () => {
  const store = createCallLog({ client: fakeClient() });
  await store.add({ capability: "prescription-verify", purpose: "dispensing", outcome: "ok", prescriptionCode: CODE, pharmacist: "duocsi.nhathuoc", at: "2026-11-01T08:00:00.000Z" });
  await store.add({ capability: "allergy-list", purpose: "dispensing", outcome: "unavailable", prescriptionCode: CODE, pharmacist: "duocsi.nhathuoc", at: "2026-11-01T09:00:00.000Z" });
  const app = await startApp({ capabilities: fakeCapabilities(), callLog: store });
  try {
    const response = await request(app, { token: app.signer.sign(), method: "GET", path: "/api/call-log", contentType: null });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.items.map(entry => entry.capability), ["allergy-list", "prescription-verify"]);
    assert.ok(response.body.items.every(entry => !("patient" in entry)));
  } finally { await app.close(); }
});

test("POST /api/verify records one call-log entry per capability", async () => {
  const client = fakeClient();
  const app = await startApp({ capabilities: fakeCapabilities(), callLog: createCallLog({ client }) });
  try {
    const response = await request(app, {
      token: app.signer.sign(),
      path: "/api/verify",
      body: { prescriptionCode: CODE, patient: PATIENT },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.dispensable, true);

    assert.equal(client.records.length, 2);
    const entries = client.records.map(record => record.data);
    assert.deepEqual(entries.map(entry => entry.capability).sort(), ["allergy-list", "prescription-verify"]);
    for (const entry of entries) {
      assert.deepEqual(Object.keys(entry).sort(), safeKeys);
      assert.equal(entry.purpose, "dispensing");
      assert.equal(entry.outcome, "ok");
      assert.equal(entry.prescriptionCode, CODE);
      assert.equal(entry.pharmacist, "duocsi.nhathuoc");
      assert.ok(Number.isFinite(Date.parse(entry.at)));
    }
    assert.equal(JSON.stringify(entries).includes(PATIENT), false);
  } finally { await app.close(); }
});

test("a failing call log does not break the verification result", async () => {
  const app = await startApp({
    capabilities: fakeCapabilities(),
    callLog: createCallLog({ client: fakeClient({ createError: new Error("down") }) }),
  });
  try {
    const response = await request(app, {
      token: app.signer.sign(),
      path: "/api/verify",
      body: { qr: `JH1|RX|${CODE}|${PATIENT}` },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.dispensable, true);
    assert.equal(response.body.prescriptionCode, CODE);
  } finally { await app.close(); }
});

test("the call log requires a pharmacist and is unavailable without Junctura", async () => {
  const app = await startApp({ capabilities: fakeCapabilities(), callLog: createCallLog({ client: fakeClient() }) });
  try {
    const token = app.signer.sign({ preferred_username: "bacsi.benhvien" });
    const response = await request(app, { token, method: "GET", path: "/api/call-log", contentType: null });
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "not-pharmacist" });
  } finally { await app.close(); }

  const unavailable = await startApp({ capabilities: fakeCapabilities() });
  try {
    const response = await request(unavailable, { token: unavailable.signer.sign(), method: "GET", path: "/api/call-log", contentType: null });
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: "junctura-not-configured" });
  } finally { await unavailable.close(); }
});
