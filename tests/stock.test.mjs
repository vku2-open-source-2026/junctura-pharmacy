// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createDispensingStore } from "../server/dispensing.mjs";
import { createStock } from "../server/stock.mjs";
import { startApp } from "./helpers.mjs";

const PATIENT = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const CODE = "DT-2026-004521";
const DAY_MS = 86_400_000;

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
  let sequence = 0;
  return {
    records,
    async createRecord(collection, data) {
      if (createError) throw createError;
      const record = { id: `record-${++sequence}`, collection, data };
      records.push(record);
      return record;
    },
    async request(path) {
      if (requestError) throw requestError;
      const collection = path.split("/").pop();
      return {
        json: async () => ({
          items: records.filter(record => record.collection === collection)
            .map(record => ({ id: record.id, data: record.data })),
        }),
      };
    },
  };
}

async function request(app, {
  token, body, raw, method = "POST", path, contentType = "application/json",
} = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (contentType !== null) headers["content-type"] = contentType;
  const response = await fetch(app.base + path, {
    method,
    headers,
    body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* keep the raw text */ }
  return { status: response.status, body: parsed };
}

const receipt = (name, strength, lot, quantity, expiresAt) => ({ name, strength, lot, quantity, expiresAt });

test("stock summary computes on-hand and every status at the 20 and 60 day boundaries", async () => {
  const client = fakeClient();
  const stock = createStock({ client, dispensing: createDispensingStore({ client }) });
  const now = new Date("2026-11-01T00:00:00.000Z");
  const exp = days => new Date(now.getTime() + days * DAY_MS).toISOString();

  await stock.receive(receipt("Low", "1 mg", "L1", 30, exp(90)));
  await stock.receive(receipt("Ok", "1 mg", "O1", 30, exp(91)));
  await stock.receive(receipt("Out", "1 mg", "X1", 10, exp(92)));
  await stock.receive(receipt("Expiring60", "1 mg", "B60", 100, exp(60)));
  await stock.receive(receipt("Expiring61", "1 mg", "B61", 100, exp(61)));
  await stock.receive(receipt("Expired", "1 mg", "E1", 100, exp(-1)));
  await stock.receive(receipt("ExpiredOut", "1 mg", "E2", 5, exp(-2)));
  await stock.receive(receipt("Multi", "1 mg", "M1", 25, exp(95)));
  await stock.receive(receipt("Multi", "1 mg", "M1", 25, exp(95)));

  await client.createRecord("dispensations", {
    outcome: "dispensed",
    items: [
      { name: "Low", lot: "L1", quantity: 6 },
      { name: "Ok", lot: "O1", quantity: 9 },
      { name: "Out", lot: "X1", quantity: 10 },
      { name: "ExpiredOut", lot: "E2", quantity: 5 },
    ],
  });
  await client.createRecord("dispensations", { outcome: "dispensed", items: [{ name: "Low", lot: "L1", quantity: 4 }] });
  await client.createRecord("dispensations", { outcome: "refused", items: [{ name: "Ok", lot: "O1", quantity: 100 }] });

  const items = await stock.summary(now);
  const byLot = Object.fromEntries(items.map(item => [item.lot, item]));

  assert.deepEqual(items.map(item => item.lot), ["E2", "E1", "B60", "B61", "L1", "O1", "X1", "M1"]);
  assert.deepEqual(byLot.L1, { name: "Low", strength: "1 mg", lot: "L1", expiresAt: exp(90), received: 30, dispensed: 10, adjusted: 0, onHand: 20, status: "low" });
  assert.equal(byLot.O1.onHand, 21);
  assert.equal(byLot.O1.dispensed, 9);
  assert.equal(byLot.O1.status, "ok");
  assert.equal(byLot.X1.onHand, 0);
  assert.equal(byLot.X1.status, "out");
  assert.equal(byLot.B60.status, "expiring");
  assert.equal(byLot.B61.status, "ok");
  assert.equal(byLot.E1.status, "expired");
  assert.equal(byLot.E2.status, "expired");
  assert.equal(byLot.M1.received, 50);
  assert.equal(byLot.M1.strength, "1 mg");
  assert.equal(byLot.M1.status, "ok");
});

test("receive appends a receipt to the fixed collection", async () => {
  const client = fakeClient();
  const stock = createStock({ client, dispensing: createDispensingStore({ client }) });

  const entry = await stock.receive({
    name: "Clopidogrel",
    strength: "75 mg",
    lot: "LOT-1",
    quantity: 5,
    expiresAt: "2026-12-31",
    receivedBy: "duocsi.nhathuoc",
  });
  assert.equal(entry.name, "Clopidogrel");
  assert.equal(entry.receivedBy, "duocsi.nhathuoc");
  assert.equal(client.records.length, 1);
  assert.equal(client.records[0].collection, "stock-receipts");
  assert.equal(client.records[0].data.lot, "LOT-1");
});

test("the stock store turns read and write failures into a 503 error", async () => {
  const readStore = createStock({
    client: fakeClient({ requestError: new Error("down") }),
    dispensing: createDispensingStore({ client: fakeClient() }),
  });
  await assert.rejects(readStore.summary(), error => error.status === 503 && error.code === "store-unavailable");

  const writeStore = createStock({
    client: fakeClient({ createError: new Error("down") }),
    dispensing: createDispensingStore({ client: fakeClient() }),
  });
  await assert.rejects(
    writeStore.receive(receipt("A", "1 mg", "L1", 1, "2026-12-31")),
    error => error.status === 503 && error.code === "store-unavailable",
  );
});

test("GET /api/stock returns the lots and their warning counts", async () => {
  const client = fakeClient();
  const stock = createStock({ client, dispensing: createDispensingStore({ client }) });
  const now = Date.now();
  const exp = days => new Date(now + days * DAY_MS).toISOString();

  await stock.receive(receipt("Low", "1 mg", "L1", 10, exp(90)));
  await stock.receive(receipt("Out", "1 mg", "X1", 5, exp(90)));
  await stock.receive(receipt("Expiring", "1 mg", "B1", 100, exp(30)));
  await stock.receive(receipt("Expired", "1 mg", "E1", 100, exp(-1)));
  await stock.receive(receipt("Ok", "1 mg", "O1", 100, exp(120)));
  await client.createRecord("dispensations", { outcome: "dispensed", items: [{ name: "Out", lot: "X1", quantity: 5 }] });

  const app = await startApp({ capabilities: fakeCapabilities(), stock });
  try {
    const response = await request(app, { token: app.signer.sign(), method: "GET", path: "/api/stock", contentType: null });
    assert.equal(response.status, 200);
    assert.equal(response.body.items.length, 5);
    assert.deepEqual(response.body.counts, { low: 1, out: 1, expiring: 1, expired: 1 });
  } finally { await app.close(); }
});

test("POST /api/stock validates the trimmed fields and appends a receipt", async () => {
  const client = fakeClient();
  const stock = createStock({ client, dispensing: createDispensingStore({ client }) });
  const app = await startApp({ capabilities: fakeCapabilities(), stock });
  try {
    const valid = { name: " Clopidogrel ", strength: " 75 mg ", lot: " LOT-1 ", quantity: 5, expiresAt: "2026-12-31" };
    const response = await request(app, { token: app.signer.sign(), path: "/api/stock", body: valid });
    assert.equal(response.status, 201);
    assert.equal(response.body.name, "Clopidogrel");
    assert.equal(response.body.strength, "75 mg");
    assert.equal(response.body.lot, "LOT-1");
    assert.equal(response.body.quantity, 5);
    assert.equal(response.body.receivedBy, "duocsi.nhathuoc");
    assert.equal(client.records.length, 1);

    const invalid = [
      {},
      { ...valid, name: "" },
      { ...valid, name: "x".repeat(161) },
      { ...valid, strength: "" },
      { ...valid, strength: "x".repeat(81) },
      { ...valid, lot: "" },
      { ...valid, lot: "   " },
      { ...valid, lot: "x".repeat(41) },
      { ...valid, quantity: 0 },
      { ...valid, quantity: 1.5 },
      { ...valid, quantity: 100001 },
      { ...valid, quantity: "5" },
      { ...valid, expiresAt: "not-a-date" },
      { ...valid, expiresAt: "2026-02-30" },
      { ...valid, expiresAt: "2026-13-01" },
      { ...valid, expiresAt: "2026-11-01T25:00:00Z" },
      { ...valid, expiresAt: 42 },
      [],
    ];
    for (const body of invalid) {
      const bad = await request(app, { token: app.signer.sign(), path: "/api/stock", body });
      assert.equal(bad.status, 400, JSON.stringify(body));
      assert.deepEqual(bad.body, { error: "invalid-request" });
    }
    assert.equal(client.records.length, 1);

    const wrongType = await request(app, {
      token: app.signer.sign(), path: "/api/stock", body: valid, contentType: "text/plain",
    });
    assert.equal(wrongType.status, 415);
    const huge = await request(app, {
      token: app.signer.sign(), path: "/api/stock", raw: JSON.stringify({ ...valid, name: "x".repeat(5000) }),
    });
    assert.equal(huge.status, 413);
  } finally { await app.close(); }
});

test("POST /api/stock accepts both date-only and full ISO expiry dates", async () => {
  const client = fakeClient();
  const stock = createStock({ client, dispensing: createDispensingStore({ client }) });
  const app = await startApp({ capabilities: fakeCapabilities(), stock });
  try {
    for (const expiresAt of ["2026-12-31", "2026-12-31T08:30:00.000Z", "2026-12-31T15:30:00+07:00"]) {
      const response = await request(app, {
        token: app.signer.sign(),
        path: "/api/stock",
        body: { name: "Clopidogrel", strength: "75 mg", lot: `LOT-${expiresAt.length}`, quantity: 1, expiresAt },
      });
      assert.equal(response.status, 201, expiresAt);
    }
  } finally { await app.close(); }
});

test("the stock routes require a pharmacist and are unavailable without Junctura", async () => {
  const client = fakeClient();
  const stock = createStock({ client, dispensing: createDispensingStore({ client }) });
  const app = await startApp({ capabilities: fakeCapabilities(), stock });
  try {
    const token = app.signer.sign({ preferred_username: "bacsi.benhvien" });
    for (const options of [
      { method: "GET", contentType: null },
      { path: "/api/stock", body: { name: "A", strength: "1 mg", lot: "L1", quantity: 1, expiresAt: "2026-12-31" } },
    ]) {
      const response = await request(app, { token, path: "/api/stock", ...options });
      assert.equal(response.status, 403);
      assert.deepEqual(response.body, { error: "not-pharmacist" });
    }
  } finally { await app.close(); }

  const unavailable = await startApp({ capabilities: fakeCapabilities() });
  try {
    const token = unavailable.signer.sign();
    const get = await request(unavailable, { token, method: "GET", path: "/api/stock", contentType: null });
    assert.equal(get.status, 503);
    assert.deepEqual(get.body, { error: "junctura-not-configured" });
    const post = await request(unavailable, {
      token,
      path: "/api/stock",
      body: { name: "A", strength: "1 mg", lot: "L1", quantity: 1, expiresAt: "2026-12-31" },
    });
    assert.equal(post.status, 503);
    assert.deepEqual(post.body, { error: "junctura-not-configured" });
  } finally { await unavailable.close(); }
});

test("POST /api/dispense refuses a known lot with too little on hand", async () => {
  const client = fakeClient();
  const stock = createStock({ client, dispensing: createDispensingStore({ client }) });
  await stock.receive({
    name: "Clopidogrel", strength: "75 mg", lot: "LOT-A", quantity: 5,
    expiresAt: "2099-01-01", receivedBy: "duocsi.nhathuoc",
  });
  const app = await startApp({ capabilities: fakeCapabilities(), dispensing: createDispensingStore({ client }), stock });
  try {
    const response = await request(app, {
      token: app.signer.sign(),
      path: "/api/dispense",
      body: { qr: `JH1|RX|${CODE}|${PATIENT}`, items: [{ name: "Clopidogrel", quantity: 6, lot: "LOT-A" }] },
    });
    assert.equal(response.status, 409);
    assert.deepEqual(response.body, { error: "insufficient-stock" });
    assert.equal(client.records.filter(record => record.collection === "dispensations").length, 0);
  } finally { await app.close(); }
});

test("POST /api/dispense refuses a known lot that has expired", async () => {
  const client = fakeClient();
  const stock = createStock({ client, dispensing: createDispensingStore({ client }) });
  await stock.receive({
    name: "Clopidogrel", strength: "75 mg", lot: "LOT-OLD", quantity: 50,
    expiresAt: "2000-01-01", receivedBy: "duocsi.nhathuoc",
  });
  const app = await startApp({ capabilities: fakeCapabilities(), dispensing: createDispensingStore({ client }), stock });
  try {
    const response = await request(app, {
      token: app.signer.sign(),
      path: "/api/dispense",
      body: { qr: `JH1|RX|${CODE}|${PATIENT}`, items: [{ name: "Clopidogrel", quantity: 1, lot: "LOT-OLD" }] },
    });
    assert.equal(response.status, 409);
    assert.deepEqual(response.body, { error: "lot-expired" });
    assert.equal(client.records.filter(record => record.collection === "dispensations").length, 0);
  } finally { await app.close(); }
});

test("POST /api/dispense subtracts earlier dispensations from the lot on hand", async () => {
  const client = fakeClient();
  const dispensing = createDispensingStore({ client });
  const stock = createStock({ client, dispensing });
  await stock.receive({
    name: "Clopidogrel", strength: "75 mg", lot: "LOT-A", quantity: 10,
    expiresAt: "2099-01-01", receivedBy: "duocsi.nhathuoc",
  });
  await client.createRecord("dispensations", {
    outcome: "dispensed",
    items: [{ name: "Clopidogrel", lot: "LOT-A", quantity: 8 }],
  });
  const app = await startApp({ capabilities: fakeCapabilities(), dispensing, stock });
  try {
    const response = await request(app, {
      token: app.signer.sign(),
      path: "/api/dispense",
      body: { qr: `JH1|RX|${CODE}|${PATIENT}`, items: [{ name: "Clopidogrel", quantity: 3, lot: "LOT-A" }] },
    });
    assert.equal(response.status, 409);
    assert.deepEqual(response.body, { error: "insufficient-stock" });
  } finally { await app.close(); }
});

test("POST /api/dispense still allows a lot the stock never received", async () => {
  const client = fakeClient();
  const stock = createStock({ client, dispensing: createDispensingStore({ client }) });
  const app = await startApp({ capabilities: fakeCapabilities(), dispensing: createDispensingStore({ client }), stock });
  try {
    const response = await request(app, {
      token: app.signer.sign(),
      path: "/api/dispense",
      body: { qr: `JH1|RX|${CODE}|${PATIENT}`, items: [{ name: "Clopidogrel", quantity: 5, lot: "LOT-UNKNOWN" }] },
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.outcome, "dispensed");
  } finally { await app.close(); }
});

test("POST /api/dispense succeeds when a known lot has enough on hand", async () => {
  const client = fakeClient();
  const dispensing = createDispensingStore({ client });
  const stock = createStock({ client, dispensing });
  await stock.receive({
    name: "Clopidogrel", strength: "75 mg", lot: "LOT-A", quantity: 10,
    expiresAt: "2099-01-01", receivedBy: "duocsi.nhathuoc",
  });
  const app = await startApp({ capabilities: fakeCapabilities(), dispensing, stock });
  try {
    const response = await request(app, {
      token: app.signer.sign(),
      path: "/api/dispense",
      body: { qr: `JH1|RX|${CODE}|${PATIENT}`, items: [{ name: "Clopidogrel", quantity: 6, lot: "LOT-A" }] },
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.outcome, "dispensed");
  } finally { await app.close(); }
});
