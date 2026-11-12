// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createDispensingStore } from "../server/dispensing.mjs";
import { createStaffLog } from "../server/staff-log.mjs";
import { createStock } from "../server/stock.mjs";
import { startApp } from "./helpers.mjs";

const PATIENT = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const QR = `JH1|RX|DT-2026-004521|${PATIENT}`;

function fakeClient({ failCollection } = {}) {
  const records = [];
  return {
    records,
    async createRecord(collection, data) {
      if (collection === failCollection) throw new Error("down");
      const record = { id: `r${records.length + 1}`, collection, data };
      records.push(record);
      return record;
    },
    async getRecord(collection, id) {
      const record = records.find(item => item.collection === collection && item.id === id);
      if (!record) throw Object.assign(new Error("not found"), { status: 404 });
      return { id: record.id, data: record.data };
    },
    async request(path) {
      const collection = path.split("/").pop();
      return { json: async () => ({ items: records.filter(item => item.collection === collection).map(item => ({ id: item.id, data: item.data })) }) };
    },
  };
}

const capabilities = {
  async call(slug) {
    if (slug === "prescription-verify") {
      return { status: "ok", receivedAt: "2026-11-01T00:00:00.000Z", output: {
        valid: true, issuedAt: "2026-10-29T03:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", dispensed: false,
        items: [{ name: "Clopidogrel", strength: "75 mg", quantity: 30, instructions: "Uống" }],
      } };
    }
    return { status: "ok", receivedAt: "2026-11-01T00:00:00.000Z", output: { allergies: [], allergyState: "not-recorded", updatedAt: "2026-10-28T09:15:00.000Z" } };
  },
};

async function call(app, path, { method = "POST", body, token = app.signer.sign() } = {}) {
  const response = await fetch(app.base + path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body && { "content-type": "application/json" }) },
    body: body && JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function start(client) {
  const dispensing = createDispensingStore({ client });
  return startApp({ capabilities, dispensing, stock: createStock({ client, dispensing }), staffLog: createStaffLog({ client }) });
}

test("verify, dispense, refuse and stock receipts are logged without patient data", async () => {
  const client = fakeClient();
  const app = await start(client);
  try {
    assert.equal((await call(app, "/api/verify", { body: { qr: QR } })).status, 200);
    assert.equal((await call(app, "/api/dispense", { body: { qr: QR, items: [{ name: "Clopidogrel", quantity: 30, lot: "LOT-1" }] } })).status, 201);
    assert.equal((await call(app, "/api/refuse", { body: { qr: QR, reason: "Người bệnh muốn đổi thuốc" } })).status, 201);
    assert.equal((await call(app, "/api/stock", { body: { name: "Clopidogrel", strength: "75 mg", lot: "LOT-2", quantity: 50, expiresAt: "2099-01-01" } })).status, 201);

    const audit = await call(app, "/api/audit", { method: "GET" });
    assert.equal(audit.status, 200);
    assert.deepEqual(audit.body.items.map(item => item.action).sort(), ["dispense", "refuse", "stock-receive", "verify"]);
    const text = JSON.stringify(audit.body);
    assert.ok(!text.includes(PATIENT), "no patient id in the staff log");
    assert.ok(!text.includes("đổi thuốc"), "no refusal reason in the staff log");
    assert.ok(audit.body.items.every(item => item.by === "duocsi.nhathuoc" && item.at));
  } finally { await app.close(); }
});

test("a failing staff log never changes the answer", async () => {
  const app = await start(fakeClient({ failCollection: "staff-actions" }));
  try {
    const response = await call(app, "/api/dispense", { body: { qr: QR, items: [{ name: "Clopidogrel", quantity: 1, lot: "LOT-1" }] } });
    assert.equal(response.status, 201);
  } finally { await app.close(); }
});

test("one dispensing record can be read back by id without the patient", async () => {
  const app = await start(fakeClient());
  try {
    const created = await call(app, "/api/dispense", { body: { qr: QR, items: [{ name: "Clopidogrel", quantity: 2, lot: "LOT-1" }] } });
    assert.equal(typeof created.body.id, "string");
    const item = await call(app, `/api/history/${created.body.id}`, { method: "GET" });
    assert.equal(item.status, 200);
    assert.equal(item.body.prescriptionCode, "DT-2026-004521");
    assert.equal(item.body.patient, undefined);
    const history = await call(app, "/api/history", { method: "GET" });
    assert.equal(history.body.items[0].id, created.body.id);
    assert.equal((await call(app, "/api/history/missing-1", { method: "GET" })).status, 404);
  } finally { await app.close(); }
});

test("the staff log and record detail need a pharmacist and a configured store", async () => {
  const app = await start(fakeClient());
  try {
    const other = app.signer.sign({ preferred_username: "bacsi.benhvien" });
    assert.equal((await call(app, "/api/audit", { method: "GET", token: other })).status, 403);
    assert.equal((await call(app, "/api/history/r1", { method: "GET", token: other })).status, 403);
  } finally { await app.close(); }
  const bare = await startApp({});
  try {
    assert.equal((await call(bare, "/api/audit", { method: "GET" })).status, 503);
    assert.equal((await call(bare, "/api/history/r1", { method: "GET" })).status, 503);
  } finally { await bare.close(); }
});
