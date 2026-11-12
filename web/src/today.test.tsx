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
        received: 100, dispensed: 100, adjusted: 0, onHand: 0, status: "expired",
      },
      {
        name: "Aspirin", strength: "81 mg", lot: "LOT-C", expiresAt: "2026-12-01",
        received: 50, dispensed: 10, adjusted: 0, onHand: 40, status: "expiring",
      },
      {
        name: "Clopidogrel", strength: "75 mg", lot: "LOT-D", expiresAt: "2027-01-01",
        received: 20, dispensed: 18, adjusted: 0, onHand: 2, status: "low",
      },
    ],
  },
  recent: [
    {
      id: "rec-1", prescriptionCode: "DT-2026-004521", outcome: "dispensed", pharmacist: "duocsi.nhathuoc",
      at: "2026-11-12T02:30:00.000Z",
      items: [{ name: "Clopidogrel", strength: "75 mg", quantity: 30, lot: "LOT-A" }],
    },
    {
      id: "rec-2", prescriptionCode: "DT-2026-009999", outcome: "refused", reason: "Sai liều",
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
  it("shows the day's numbers, the work to clear and recent dispensations", async () => {
    mocked.getOverview.mockResolvedValue(overview());
    wrap();

    expect((await screen.findAllByText("Đã phát")).length).toBeGreaterThan(0);
    const stat = (label: string) => {
      const term = screen.getAllByText(label).find(node => node.tagName === "DT");
      return term?.parentElement?.parentElement?.textContent ?? "";
    };
    expect(stat("Đã phát")).toContain("2");
    expect(stat("Đã từ chối")).toContain("1");
    expect(stat("Chưa có đồng thuận")).toContain("1");
    expect(stat("Phát dù trùng dị ứng")).toContain("1");
    expect(screen.getByText("trong 3 lượt xác minh")).toBeTruthy();
    expect(screen.getByText("đơn không phát")).toBeTruthy();
    expect(screen.getByText("người bệnh chưa cho phép")).toBeTruthy();
    expect(screen.getByText("đã ghi lý do")).toBeTruthy();

    expect(screen.getByRole("heading", { name: /Cần xử lý/ })).toBeTruthy();
    expect(screen.getByText("1 lô đã hết hạn")).toBeTruthy();
    expect(screen.getByText("Amoxicillin 500 mg · lô LOT-A")).toBeTruthy();
    expect(screen.getByText("1 lô sắp hết hạn")).toBeTruthy();
    expect(screen.getByText("Aspirin 81 mg · lô LOT-C")).toBeTruthy();
    expect(screen.getByText("1 lô sắp hết")).toBeTruthy();
    expect(screen.getByText("Clopidogrel 75 mg · lô LOT-D")).toBeTruthy();
    expect(screen.getByText("1 đơn bị chặn vì chưa đồng thuận")).toBeTruthy();
    expect(screen.getByText("Người bệnh cần cho phép trong Sổ sức khỏe")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Mở kho" })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Xem nhật ký" })).toBeTruthy();

    expect(screen.getByRole("heading", { name: "Gần đây" })).toBeTruthy();
    expect(screen.getByText("…004521")).toBeTruthy();
    expect(screen.getByText("…009999")).toBeTruthy();
    expect(screen.getByTitle("DT-2026-004521")).toBeTruthy();
    expect(screen.getByText("Clopidogrel ×30")).toBeTruthy();
    expect(screen.getByText("Sai liều")).toBeTruthy();
    expect(screen.getByText("09:30")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xem lịch sử" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xác minh đơn" })).toBeTruthy();
  });

  it("explains what to do when the day is empty", async () => {
    mocked.getOverview.mockResolvedValue(overview({
      today: { verified: 0, dispensed: 0, refused: 0, noConsent: 0, allergyOverrides: 0 },
      stock: { counts: { low: 0, out: 0, expiring: 0, expired: 0 }, attention: [] },
      recent: [],
    }));
    wrap();

    expect(await screen.findByText("Không có việc tồn đọng.")).toBeTruthy();
    expect(screen.getByText("Chưa có đơn nào được phát hay từ chối.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xác minh đơn" })).toBeTruthy();
  });

  it("keeps the rest of the page when one section is unavailable", async () => {
    mocked.getOverview.mockResolvedValue(overview({ stock: null }));
    wrap();

    expect(await screen.findByText("Chưa tải được kho")).toBeTruthy();
    expect(screen.getAllByText("Đã phát").length).toBeGreaterThan(0);
    expect(screen.getByText("…004521")).toBeTruthy();
    expect(screen.queryByText("Không có việc tồn đọng.")).toBeNull();
  });

  it("shows a retry when recent dispensations are unavailable", async () => {
    mocked.getOverview.mockResolvedValue(overview({ recent: null }));
    wrap();

    expect(await screen.findByText("Chưa tải được lịch sử")).toBeTruthy();
    expect(screen.getAllByText("Đã phát").length).toBeGreaterThan(0);
  });
});
