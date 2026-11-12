// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createDispensingStore } from "../server/dispensing.mjs";
import { createSettings, DEFAULT_SETTINGS } from "../server/settings.mjs";
import { createStock } from "../server/stock.mjs";
import { startApp } from "./helpers.mjs";

function fakeClient() {
  const records = [];
  let tick = 0;
  return {
    records,
    async createRecord(collection, data) {
      // Distinct times so "newest wins" is deterministic within one millisecond.
      const stamped = collection === "settings" ? { ...data, at: new Date(Date.parse("2026-11-12T00:00:00Z") + ++tick * 1000).toISOString() } : data;
      const record = { id: `r${records.length + 1}`, collection, data: stamped };
      records.push(record);
      return record;
    },
    async request(path) {
      const collection = path.split("/").pop();
      return { json: async () => ({ items: records.filter(item => item.collection === collection).map(item => ({ id: item.id, data: item.data })) }) };
    },
  };
}

async function call(app, method, body) {
  const response = await fetch(`${app.base}/api/settings`, {
    method, headers: { authorization: `Bearer ${app.signer.sign()}`, ...(body && { "content-type": "application/json" }) },
    body: body && JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("defaults apply until settings are saved, then the newest save wins", async () => {
  const client = fakeClient();
  const settings = createSettings({ client });
  const app = await startApp({ settings });
  try {
    const first = await call(app, "GET");
    assert.equal(first.body.lowStock, DEFAULT_SETTINGS.lowStock);
    assert.equal(first.body.expiringDays, DEFAULT_SETTINGS.expiringDays);
    assert.equal((await call(app, "PUT", { lowStock: 5, expiringDays: 30 })).status, 200);
    assert.equal((await call(app, "PUT", { lowStock: 8, expiringDays: 45 })).status, 200);
    const current = await call(app, "GET");
    assert.equal(current.body.lowStock, 8);
    assert.equal(current.body.expiringDays, 45);
    assert.equal(current.body.updatedBy, "duocsi.nhathuoc");
  } finally { await app.close(); }
});

test("settings are validated", async () => {
  const app = await startApp({ settings: createSettings({ client: fakeClient() }) });
  try {
    for (const body of [{ lowStock: -1, expiringDays: 30 }, { lowStock: 5, expiringDays: 0 }, { lowStock: 5, expiringDays: 400 }, { lowStock: "5", expiringDays: 30 }]) {
      assert.equal((await call(app, "PUT", body)).status, 400, JSON.stringify(body));
    }
  } finally { await app.close(); }
});

test("the stock statuses follow the saved thresholds", async () => {
  const client = fakeClient();
  const settings = createSettings({ client });
  const stock = createStock({ client, dispensing: createDispensingStore({ client }), settings });
  const inDays = days => new Date(Date.now() + days * 86_400_000).toISOString();
  await stock.receive({ name: "A", strength: "1 mg", lot: "L1", quantity: 10, expiresAt: inDays(400), receivedBy: "x" });
  await stock.receive({ name: "B", strength: "1 mg", lot: "L2", quantity: 500, expiresAt: inDays(50), receivedBy: "x" });
  let byLot = Object.fromEntries((await stock.summary()).map(item => [item.lot, item.status]));
  assert.deepEqual(byLot, { L1: "low", L2: "expiring" });
  await settings.save({ lowStock: 5, expiringDays: 30 }, "duocsi.nhathuoc");
  byLot = Object.fromEntries((await stock.summary()).map(item => [item.lot, item.status]));
  assert.deepEqual(byLot, { L1: "ok", L2: "ok" });
});
