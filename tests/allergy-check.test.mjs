// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { findAllergyConflicts } from "../server/allergy-check.mjs";
import { createDispensingStore } from "../server/dispensing.mjs";
import { startApp } from "./helpers.mjs";

const PATIENT = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const QR = `JH1|RX|DT-2026-004521|${PATIENT}`;
const penicillin = { substance: "Penicillin", severity: "severe", reaction: "Nổi mề đay, khó thở" };
const rx = (...names) => names.map(name => ({ name, strength: "500 mg", quantity: 21, instructions: "Uống" }));

test("a penicillin allergy flags amoxicillin through its class", () => {
  assert.deepEqual(findAllergyConflicts(rx("Amoxicillin"), [penicillin]),
    [{ medicine: "Amoxicillin", allergen: "Penicillin", severity: "severe" }]);
});

test("matching ignores case and Vietnamese diacritics", () => {
  const conflicts = findAllergyConflicts(rx("SULFAMETHOXAZOL + Trimethoprim"), [{ substance: "Sulfamid", severity: "moderate" }]);
  assert.equal(conflicts.length, 1);
});

test("an allergen outside the class table still matches by name", () => {
  const conflicts = findAllergyConflicts(rx("Metformin XR"), [{ substance: "Metformin", severity: "mild" }]);
  assert.deepEqual(conflicts.map(item => item.medicine), ["Metformin XR"]);
});

test("unrelated medicines and food allergies raise nothing", () => {
  assert.deepEqual(findAllergyConflicts(rx("Clopidogrel", "Bisoprolol"), [penicillin, { substance: "Hải sản", severity: "mild" }]), []);
  assert.deepEqual(findAllergyConflicts(rx("Amoxicillin"), []), []);
});

function fakeCapabilities(allergies) {
  return {
    async call(slug) {
      if (slug === "prescription-verify") {
        return { status: "ok", receivedAt: "2026-11-01T00:00:00.000Z", output: {
          valid: true, issuedAt: "2026-10-29T03:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", dispensed: false,
          items: [...rx("Amoxicillin"), { name: "Clopidogrel", strength: "75 mg", quantity: 30, instructions: "Uống" }],
        } };
      }
      return allergies;
    },
  };
}

const known = { status: "ok", receivedAt: "2026-11-01T00:00:00.000Z", output: { allergies: [penicillin], allergyState: "recorded", updatedAt: "2026-10-28T09:15:00.000Z" } };

function fakeClient() {
  const records = [];
  return {
    records,
    async createRecord(collection, data) { records.push({ collection, data }); return { id: String(records.length), data }; },
    async request() { return { json: async () => ({ items: records.map((record, index) => ({ id: String(index), data: record.data })) }) }; },
  };
}

async function post(app, path, body) {
  const response = await fetch(app.base + path, {
    method: "POST",
    headers: { authorization: `Bearer ${app.signer.sign()}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("POST /api/verify lists the medicines that match a recorded allergy", async () => {
  const app = await startApp({ capabilities: fakeCapabilities(known) });
  try {
    const response = await post(app, "/api/verify", { qr: QR });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.allergyConflicts, [{ medicine: "Amoxicillin", allergen: "Penicillin", severity: "severe" }]);
    assert.equal(response.body.dispensable, true, "the pharmacist decides; a conflict alone does not block");
  } finally { await app.close(); }
});

test("dispensing a conflicting medicine needs a written reason, which is kept", async () => {
  const client = fakeClient();
  const app = await startApp({ capabilities: fakeCapabilities(known), dispensing: createDispensingStore({ client }) });
  try {
    const items = [{ name: "Amoxicillin", quantity: 21, lot: "LOT-06-A" }];
    const refused = await post(app, "/api/dispense", { qr: QR, items });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, "allergy-conflict");
    assert.equal(refused.body.conflicts[0].allergen, "Penicillin");
    assert.equal(client.records.length, 0);

    const tooShort = await post(app, "/api/dispense", { qr: QR, items, allergyOverride: "ok" });
    assert.equal(tooShort.status, 400);

    const reason = "Đã hỏi lại người bệnh: chỉ từng nổi mẩn nhẹ, bác sĩ đã xác nhận";
    const done = await post(app, "/api/dispense", { qr: QR, items, allergyOverride: `  ${reason}  ` });
    assert.equal(done.status, 201);
    assert.equal(done.body.allergyOverride, reason);
    assert.equal(client.records[0].data.allergyOverride, reason);
  } finally { await app.close(); }
});

test("a medicine without a conflict is dispensed without a reason", async () => {
  const client = fakeClient();
  const app = await startApp({ capabilities: fakeCapabilities(known), dispensing: createDispensingStore({ client }) });
  try {
    const done = await post(app, "/api/dispense", { qr: QR, items: [{ name: "Clopidogrel", quantity: 30, lot: "LOT-01-A" }] });
    assert.equal(done.status, 201);
    assert.equal(done.body.allergyOverride, undefined);
  } finally { await app.close(); }
});

test("no conflict is computed when the allergies could not be read", async () => {
  const app = await startApp({ capabilities: fakeCapabilities({ status: "no-consent" }) });
  try {
    const response = await post(app, "/api/verify", { qr: QR });
    assert.deepEqual(response.body.allergyConflicts, []);
    assert.ok(response.body.blockers.includes("allergies-unknown"));
  } finally { await app.close(); }
});
