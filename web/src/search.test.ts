// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { searchAll } from "./search";
import type { HistoryItem, StockItem, StockResult } from "./types";

const PAGES = [
  { id: "/", label: "Xác minh đơn" },
  { id: "/hom-nay", label: "Hôm nay" },
  { id: "/lich-su", label: "Lịch sử" },
  { id: "/kho", label: "Kho" },
  { id: "/bao-cao", label: "Báo cáo" },
];

const history = (items: HistoryItem[]) => ({ items });

const stock = (items: StockItem[]): StockResult => ({
  items,
  counts: { low: 0, out: 0, expiring: 0, expired: 0 },
});

const item = (overrides: Partial<StockItem>): StockItem => ({
  name: "Thuốc", strength: "1 mg", lot: "LOT", expiresAt: "2027-01-01",
  received: 100, dispensed: 0, adjusted: 0, onHand: 100, status: "ok", ...overrides,
});

describe("searchAll", () => {
  it("finds a page without diacritics or case", () => {
    const results = searchAll("lich su", { pages: PAGES, history: history([]), stock: stock([]) });

    expect(results).toEqual([{ id: "page:/lich-su", title: "Lịch sử" }]);
  });

  it("returns the pages for an empty query", () => {
    const results = searchAll("  ", { pages: PAGES, history: history([]), stock: stock([]) });

    expect(results.map(result => result.id)).toEqual([
      "page:/", "page:/hom-nay", "page:/lich-su", "page:/kho", "page:/bao-cao",
    ]);
  });

  it("finds a prescription code in the history", () => {
    const results = searchAll("dt-2026-004521", {
      pages: PAGES,
      history: history([
        {
          id: "rec-1", prescriptionCode: "DT-2026-004521", outcome: "dispensed",
          pharmacist: "duocsi.nhathuoc", at: "2026-11-01T09:00:00.000Z",
        },
      ]),
      stock: stock([]),
    });

    expect(results).toEqual([
      { id: "history:rec-1", title: "DT-2026-004521", subtitle: "Đã phát · 01/11/2026" },
    ]);
  });

  it("finds a medicine without diacritics", () => {
    const results = searchAll("thuoc giam dau", {
      pages: PAGES,
      history: history([]),
      stock: stock([item({ name: "Thuốc giảm đau", lot: "LOT-A", onHand: 40 })]),
    });

    expect(results).toEqual([
      { id: "stock:Thuốc giảm đau", title: "Thuốc giảm đau", subtitle: "Lô LOT-A · còn 40" },
    ]);
  });

  it("finds a lot number", () => {
    const results = searchAll("lot-b", {
      pages: PAGES,
      history: history([]),
      stock: stock([
        item({ name: "Paracetamol", lot: "LOT-A" }),
        item({ name: "Aspirin", lot: "LOT-B", onHand: 12 }),
      ]),
    });

    expect(results).toEqual([
      { id: "stock:Aspirin", title: "Aspirin", subtitle: "Lô LOT-B · còn 12" },
    ]);
  });

  it("returns at most eight results", () => {
    const items = Array.from({ length: 12 }, (_, index) => item({ name: `Thuốc ${index + 1}`, lot: `LOT-${index + 1}` }));
    const results = searchAll("thuoc", { pages: [], history: history([]), stock: stock(items) });

    expect(results).toHaveLength(8);
  });
});
