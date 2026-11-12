// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createDispensingStore } from "../server/dispensing.mjs";
import { createStaffLog } from "../server/staff-log.mjs";
import { createStock } from "../server/stock.mjs";
import { startApp } from "./helpers.mjs";

function fakeClient() {
  const records = [];
  return {
    records,
    async createRecord(collection, data) { const record = { id: `r${records.length + 1}`, collection, data }; records.push(record); return record; },
    async request(path) {
      const collection = path.split("/").pop();
      return { json: async () => ({ items: records.filter(item => item.collection === collection).map(item => ({ id: item.id, data: item.data })) }) };
    },
  };
}

async function setup() {
  const client = fakeClient();
  const dispensing = createDispensingStore({ client });
  const stock = createStock({ client, dispensing });
  await stock.receive({ name: "Clopidogrel", strength: "75 mg", lot: "LOT-A", quantity: 50, expiresAt: "2099-01-01", receivedBy: "duocsi.nhathuoc" });
  const app = await startApp({ dispensing, stock, staffLog: createStaffLog({ client }) });
  return { app, stock, client };
}

async function adjust(app, body, token = app.signer.sign()) {
  const response = await fetch(`${app.base}/api/stock/adjust`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const lotOf = async stock => (await stock.summary()).find(item => item.lot === "LOT-A");

test("disposing of part of a lot lowers the stock on hand", async () => {
  const { app, stock } = await setup();
  try {
    const response = await adjust(app, { name: "Clopidogrel", lot: "LOT-A", kind: "dispose", quantity: 5, reason: "Vỉ bị ẩm" });
    assert.equal(response.status, 201);
    assert.equal((await lotOf(stock)).onHand, 45);
    assert.equal((await lotOf(stock)).adjusted, 5);
  } finally { await app.close(); }
});

test("a physical count sets the stock on hand, below or above the books", async () => {
  const { app, stock } = await setup();
  try {
    assert.equal((await adjust(app, { name: "Clopidogrel", lot: "LOT-A", kind: "count", counted: 47, reason: "Kiểm kê cuối tháng" })).status, 201);
    assert.equal((await lotOf(stock)).onHand, 47);
    assert.equal((await adjust(app, { name: "Clopidogrel", lot: "LOT-A", kind: "count", counted: 49, reason: "Đếm lại, tìm thấy 2 hộp" })).status, 201);
    assert.equal((await lotOf(stock)).onHand, 49);
  } finally { await app.close(); }
});

test("adjustments are validated and logged", async () => {
  const { app, client } = await setup();
  try {
    assert.equal((await adjust(app, { name: "Clopidogrel", lot: "LOT-A", kind: "dispose", quantity: 51, reason: "Hỏng cả lô" })).status, 409);
    assert.equal((await adjust(app, { name: "Clopidogrel", lot: "LOT-Z", kind: "dispose", quantity: 1, reason: "Không có lô" })).status, 404);
    assert.equal((await adjust(app, { name: "Clopidogrel", lot: "LOT-A", kind: "dispose", quantity: 1, reason: "x" })).status, 400);
    assert.equal((await adjust(app, { name: "Clopidogrel", lot: "LOT-A", kind: "move", quantity: 1, reason: "Chuyển kho" })).status, 400);
    assert.equal((await adjust(app, { name: "Clopidogrel", lot: "LOT-A", kind: "dispose", quantity: 2, reason: "Vỉ bị ẩm" })).status, 201);
    const logged = client.records.filter(record => record.collection === "staff-actions");
    assert.deepEqual(logged.map(record => record.data.action), ["stock-adjust"]);
    const other = app.signer.sign({ preferred_username: "bacsi.benhvien" });
    assert.equal((await adjust(app, { name: "Clopidogrel", lot: "LOT-A", kind: "dispose", quantity: 1, reason: "Vỉ bị ẩm" }, other)).status, 403);
  } finally { await app.close(); }
});
