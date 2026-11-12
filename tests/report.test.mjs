// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { buildReport, reportCsv, reportRange } from "../server/report.mjs";
import { startApp } from "./helpers.mjs";

const NOW = new Date("2026-11-12T03:00:00.000Z");

test("the default range is the last 30 days in Vietnam time and ranges are bounded", () => {
  assert.deepEqual(reportRange({}, NOW), { from: "2026-10-14", to: "2026-11-12", days: 30 });
  assert.deepEqual(reportRange({ from: "2026-11-01", to: "2026-11-01" }, NOW), { from: "2026-11-01", to: "2026-11-01", days: 1 });
  assert.equal(reportRange({ from: "2026-11-10", to: "2026-11-01" }, NOW), null);
  assert.equal(reportRange({ from: "2026-02-30", to: "2026-03-01" }, NOW), null);
  assert.equal(reportRange({ from: "2026-01-01", to: "2026-11-01" }, NOW), null, "more than 92 days");
});

const history = [
  { outcome: "dispensed", at: "2026-11-10T17:30:00.000Z", items: [{ name: "Clopidogrel", strength: "75 mg", quantity: 30 }], patient: "p-1" },
  { outcome: "dispensed", at: "2026-11-11T02:00:00.000Z", allergyOverride: "Bác sĩ đã xác nhận", items: [{ name: "Amoxicillin", strength: "500 mg", quantity: 21 }, { name: "Clopidogrel", strength: "75 mg", quantity: 10 }] },
  { outcome: "refused", at: "2026-11-11T03:00:00.000Z", reason: "Đơn sai liều" },
  { outcome: "refused", at: "2026-11-11T04:00:00.000Z", reason: "=HYPERLINK(1)" },
  { outcome: "dispensed", at: "2026-10-01T02:00:00.000Z", items: [{ name: "Gliclazid", strength: "30 mg", quantity: 30 }] },
];
const calls = [
  { capability: "prescription-verify", outcome: "no-consent", at: "2026-11-11T05:00:00.000Z" },
  { capability: "allergy-list", outcome: "no-consent", at: "2026-11-11T05:00:00.000Z" },
];

test("the report counts per Vietnam day, per medicine and per reason", () => {
  const report = buildReport({ range: { from: "2026-11-11", to: "2026-11-12", days: 2 }, history, calls });
  // 2026-11-10T17:30Z is 00:30 on 11 November in Vietnam.
  assert.deepEqual(report.perDay, [{ date: "2026-11-11", dispensed: 2, refused: 2 }, { date: "2026-11-12", dispensed: 0, refused: 0 }]);
  assert.deepEqual(report.medicines[0], { name: "Clopidogrel", strength: "75 mg", quantity: 40, prescriptions: 2 });
  assert.equal(report.medicines.length, 2, "outside the range is left out");
  assert.deepEqual(report.totals, { dispensed: 2, refused: 2, refusalRate: 50, allergyOverrides: 1, noConsent: 1 });
  assert.ok(!JSON.stringify(report).includes("p-1"));
});

test("the CSV opens in Excel and neutralises formulas", () => {
  const csv = reportCsv(buildReport({ range: { from: "2026-11-11", to: "2026-11-11", days: 1 }, history, calls }));
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"Đơn sai liều","1"'));
  assert.ok(csv.includes(`"'=HYPERLINK(1)"`));
});

test("GET /api/report validates the range and serves JSON and CSV to pharmacists", async () => {
  const dispensing = { list: async () => history };
  const app = await startApp({ dispensing });
  const get = async (path, token = app.signer.sign()) => fetch(app.base + path, { headers: { authorization: `Bearer ${token}` } });
  try {
    const json = await get("/api/report?from=2026-11-11&to=2026-11-11");
    assert.equal(json.status, 200);
    assert.equal((await json.json()).totals.dispensed, 2);
    assert.equal((await get("/api/report?from=2026-11-11&to=2026-10-01")).status, 400);
    const csv = await get("/api/report.csv?from=2026-11-11&to=2026-11-11");
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type"), /^text\/csv/);
    assert.match(csv.headers.get("content-disposition"), /bao-cao-nha-thuoc-2026-11-11-2026-11-11\.csv/);
    assert.equal((await get("/api/report", app.signer.sign({ preferred_username: "bacsi.benhvien" }))).status, 403);
  } finally { await app.close(); }
});
