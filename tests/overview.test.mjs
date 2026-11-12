// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { buildOverview, vietnamDate } from "../server/overview.mjs";
import { startApp } from "./helpers.mjs";

const PATIENT = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";

async function request(app, { token, method = "GET" } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${app.base}/api/overview`, { method, headers });
  const text = await response.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* keep the raw text */ }
  return { status: response.status, body: parsed };
}

const entry = (overrides = {}) => ({
  prescriptionCode: "DT-2026-004521",
  outcome: "dispensed",
  pharmacist: "duocsi.nhathuoc",
  at: "2026-11-12T03:00:00.000Z",
  ...overrides,
});

test("the overview day follows Vietnam time at the UTC midnight boundary", () => {
  const calls = [
    { capability: "prescription-verify", outcome: "ok", at: "2026-11-11T16:30:00.000Z" },
    { capability: "prescription-verify", outcome: "no-consent", at: "2026-11-11T17:00:00.000Z" },
    { capability: "allergy-list", outcome: "no-consent", at: "2026-11-11T16:45:00.000Z" },
  ];
  const history = [
    entry({ outcome: "dispensed", allergyOverride: "Đã hỏi bác sĩ", at: "2026-11-11T15:00:00.000Z" }),
    entry({ outcome: "refused", reason: "Sai liều", at: "2026-11-11T17:00:00.000Z" }),
  ];

  const beforeMidnight = buildOverview({ now: new Date("2026-11-11T16:59:59.000Z"), calls, history, stock: [] });
  assert.equal(beforeMidnight.date, "2026-11-11");
  assert.deepEqual(beforeMidnight.today, {
    verified: 1, dispensed: 1, refused: 0, noConsent: 1, allergyOverrides: 1,
  });

  const atMidnight = buildOverview({ now: new Date("2026-11-11T17:00:00.000Z"), calls, history, stock: [] });
  assert.equal(atMidnight.date, "2026-11-12");
  assert.deepEqual(atMidnight.today, {
    verified: 1, dispensed: 0, refused: 1, noConsent: 1, allergyOverrides: 0,
  });
  assert.equal(vietnamDate("2026-11-11T16:59:59.000Z"), "2026-11-11");
  assert.equal(vietnamDate("2026-11-11T17:00:00.000Z"), "2026-11-12");
});

test("the overview counts today, prioritises stock attention and keeps patients out of recent", () => {
  const now = new Date("2026-11-12T03:00:00.000Z");
  const calls = [
    { capability: "prescription-verify", outcome: "ok", at: "2026-11-12T01:00:00.000Z" },
    { capability: "prescription-verify", outcome: "no-consent", at: "2026-11-12T02:00:00.000Z" },
    { capability: "allergy-list", outcome: "ok", at: "2026-11-12T02:00:00.000Z" },
    { capability: "prescription-verify", outcome: "ok", at: "2026-11-11T10:00:00.000Z" },
  ];
  const history = [
    entry({ patient: PATIENT, outcome: "dispensed", allergyOverride: "Đã hỏi bác sĩ", at: "2026-11-12T02:30:00.000Z" }),
    entry({ patient: PATIENT, outcome: "dispensed", at: "2026-11-12T01:30:00.000Z" }),
    entry({ patient: PATIENT, outcome: "refused", reason: "Sai liều", at: "2026-11-12T01:00:00.000Z" }),
    entry({ patient: PATIENT, outcome: "dispensed", at: "2026-11-11T12:00:00.000Z" }),
    entry({ patient: PATIENT, outcome: "dispensed", at: "2026-11-10T12:00:00.000Z" }),
    entry({ patient: PATIENT, outcome: "refused", reason: "Hết hàng", at: "2026-11-09T12:00:00.000Z" }),
  ];
  const stock = [
    { name: "A", lot: "LOW-1", status: "low" },
    { name: "B", lot: "EXP-1", status: "expired" },
    { name: "C", lot: "OK-1", status: "ok" },
    { name: "D", lot: "OUT-1", status: "out" },
    { name: "E", lot: "EXP-2", status: "expired" },
    { name: "F", lot: "EXPIRING-1", status: "expiring" },
    { name: "G", lot: "LOW-2", status: "low" },
  ];

  const overview = buildOverview({ now, calls, history, stock });

  assert.equal(overview.date, "2026-11-12");
  assert.deepEqual(overview.today, {
    verified: 2, dispensed: 2, refused: 1, noConsent: 1, allergyOverrides: 1,
  });
  assert.deepEqual(overview.stock.counts, { low: 2, out: 1, expiring: 1, expired: 2 });
  assert.deepEqual(overview.stock.attention.map(lot => lot.lot), ["EXP-1", "EXP-2", "OUT-1", "EXPIRING-1", "LOW-1"]);
  assert.equal(overview.recent.length, 5);
  assert.deepEqual(overview.recent.map(item => item.at), [
    "2026-11-12T02:30:00.000Z",
    "2026-11-12T01:30:00.000Z",
    "2026-11-12T01:00:00.000Z",
    "2026-11-11T12:00:00.000Z",
    "2026-11-10T12:00:00.000Z",
  ]);
  assert.ok(overview.recent.every(item => !("patient" in item)));
  assert.equal(JSON.stringify(overview.recent).includes(PATIENT), false);
});

test("GET /api/overview keeps the healthy sections when one store fails", async () => {
  const calls = [{ capability: "prescription-verify", outcome: "ok", at: "2026-11-12T03:00:00.000Z" }];
  const history = [
    entry({ patient: PATIENT, at: new Date().toISOString() }),
    entry({ patient: PATIENT, outcome: "refused", reason: "Sai liều", at: new Date(Date.now() - 60_000).toISOString() }),
  ];
  const lots = [{ name: "A", lot: "L1", status: "low" }];

  const stockDown = await startApp({
    callLog: { list: async () => calls },
    dispensing: { list: async () => history },
    stock: { summary: async () => { throw new Error("down"); } },
  });
  try {
    const response = await request(stockDown, { token: stockDown.signer.sign() });
    assert.equal(response.status, 200);
    assert.equal(response.body.stock, null);
    assert.equal(response.body.today.verified, 1);
    assert.equal(response.body.recent.length, 2);
    assert.equal(JSON.stringify(response.body.recent).includes(PATIENT), false);
  } finally { await stockDown.close(); }

  const callsDown = await startApp({
    callLog: { list: async () => { throw new Error("down"); } },
    dispensing: { list: async () => history },
    stock: { summary: async () => lots },
  });
  try {
    const response = await request(callsDown, { token: callsDown.signer.sign() });
    assert.equal(response.status, 200);
    assert.equal(response.body.today, null);
    assert.equal(response.body.recent.length, 2);
    assert.deepEqual(response.body.stock.counts, { low: 1, out: 0, expiring: 0, expired: 0 });
  } finally { await callsDown.close(); }

  const historyDown = await startApp({
    callLog: { list: async () => calls },
    dispensing: { list: async () => { throw new Error("down"); } },
    stock: { summary: async () => lots },
  });
  try {
    const response = await request(historyDown, { token: historyDown.signer.sign() });
    assert.equal(response.status, 200);
    assert.equal(response.body.today, null);
    assert.equal(response.body.recent, null);
    assert.deepEqual(response.body.stock.attention.map(lot => lot.lot), ["L1"]);
  } finally { await historyDown.close(); }
});

test("GET /api/overview requires a pharmacist and only 503s when all stores are missing", async () => {
  const app = await startApp({
    callLog: { list: async () => [] },
    dispensing: { list: async () => [] },
    stock: { summary: async () => [] },
  });
  try {
    const token = app.signer.sign({ preferred_username: "bacsi.benhvien" });
    const response = await request(app, { token });
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "not-pharmacist" });
  } finally { await app.close(); }

  const empty = await startApp({});
  try {
    const response = await request(empty, { token: empty.signer.sign() });
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: "junctura-not-configured" });
  } finally { await empty.close(); }

  const stockOnly = await startApp({ stock: { summary: async () => [] } });
  try {
    const response = await request(stockOnly, { token: stockOnly.signer.sign() });
    assert.equal(response.status, 200);
    assert.equal(response.body.today, null);
    assert.equal(response.body.recent, null);
    assert.deepEqual(response.body.stock, { counts: { low: 0, out: 0, expiring: 0, expired: 0 }, attention: [] });
  } finally { await stockOnly.close(); }
});
