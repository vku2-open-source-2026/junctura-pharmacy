// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getOverview } from "./api";
import { SessionProvider } from "./session";
import { Today } from "./Today";
import type { OverviewResult } from "./types";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  getOverview: vi.fn(),
}));

const mocked = { getOverview: vi.mocked(getOverview) };
const session = { settings: { issuer: "https://id.test", clientId: "c" }, facility: "Nhà thuốc test", expire: () => {}, setCrumbs: () => {} };
const wrap = () => render(<SessionProvider value={session}><Today /></SessionProvider>);

const overview = (overrides: Partial<OverviewResult> = {}): OverviewResult => ({
  date: "2026-11-12",
  today: { verified: 3, dispensed: 2, refused: 1, noConsent: 1, allergyOverrides: 1 },
  stock: {
    counts: { low: 1, out: 0, expiring: 1, expired: 1 },
    attention: [
      {
        name: "Amoxicillin", strength: "500 mg", lot: "LOT-A", expiresAt: "2026-11-01",
        received: 100, dispensed: 100, onHand: 0, status: "expired",
      },
      {
        name: "Aspirin", strength: "81 mg", lot: "LOT-C", expiresAt: "2026-12-01",
        received: 50, dispensed: 10, onHand: 40, status: "expiring",
      },
    ],
  },
  recent: [
    {
      prescriptionCode: "DT-2026-004521", outcome: "dispensed", pharmacist: "duocsi.nhathuoc",
      at: "2026-11-12T02:30:00.000Z",
      items: [{ name: "Clopidogrel", strength: "75 mg", quantity: 30, lot: "LOT-A" }],
    },
    {
      prescriptionCode: "DT-2026-009999", outcome: "refused", reason: "Sai liều",
      pharmacist: "duocsi.nhathuoc", at: "2026-11-12T01:00:00.000Z",
    },
  ],
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("today screen", () => {
  it("shows the day's numbers, the lots to watch and recent dispensations", async () => {
    mocked.getOverview.mockResolvedValue(overview());
    wrap();

    expect(await screen.findByText("Đã xác minh")).toBeTruthy();
    const card = (label: string) => {
      for (const node of screen.getAllByText(label)) {
        const text = node.parentElement?.parentElement?.textContent ?? "";
        if (text.startsWith(label) && /^\d+$/.test(text.slice(label.length))) return text;
      }
      return "";
    };
    expect(card("Đã xác minh")).toContain("3");
    expect(card("Đã phát")).toContain("2");
    expect(card("Đã từ chối")).toContain("1");
    expect(card("Chưa có đồng thuận")).toContain("1");
    expect(card("Phát dù trùng dị ứng")).toContain("1");

    expect(screen.getByText("Kho cần chú ý")).toBeTruthy();
    expect(screen.getByText("Amoxicillin")).toBeTruthy();
    expect(screen.getByText("Đã hết hạn")).toBeTruthy();
    expect(screen.getByText("Sắp hết hạn")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mở kho" })).toBeTruthy();

    expect(screen.getByText("Gần đây")).toBeTruthy();
    expect(screen.getByText("DT-2026-004521")).toBeTruthy();
    expect(screen.getByText("DT-2026-009999")).toBeTruthy();
    expect(screen.getByText("Sai liều")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xem lịch sử" })).toBeTruthy();
  });

  it("explains what to do when the day is empty", async () => {
    mocked.getOverview.mockResolvedValue(overview({
      today: { verified: 0, dispensed: 0, refused: 0, noConsent: 0, allergyOverrides: 0 },
      stock: { counts: { low: 0, out: 0, expiring: 0, expired: 0 }, attention: [] },
      recent: [],
    }));
    wrap();

    expect(await screen.findByText("Kho không có lô cần chú ý")).toBeTruthy();
    expect(screen.getByText("Chưa có đơn nào được phát hay từ chối.")).toBeTruthy();
    expect(screen.getByText("Bắt đầu ở Xác minh đơn.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xác minh đơn" })).toBeTruthy();
  });

  it("keeps the rest of the page when one section is unavailable", async () => {
    mocked.getOverview.mockResolvedValue(overview({ stock: null }));
    wrap();

    expect(await screen.findByText("Chưa tải được kho")).toBeTruthy();
    expect(screen.getByText("Đã xác minh")).toBeTruthy();
    expect(screen.getByText("DT-2026-004521")).toBeTruthy();
    expect(screen.queryByText("Kho không có lô cần chú ý")).toBeNull();
  });
});
