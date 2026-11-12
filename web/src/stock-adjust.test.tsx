// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiError, adjustStock, getStock } from "./api";
import { SessionProvider } from "./session";
import { Stock } from "./Stock";
import type { AdjustStockResult, StockItem, StockResult, StockStatus } from "./types";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  getStock: vi.fn(),
  adjustStock: vi.fn(),
}));

const mocked = { getStock: vi.mocked(getStock), adjustStock: vi.mocked(adjustStock) };
const session = { settings: { issuer: "https://id.test", clientId: "c" }, facility: "Nhà thuốc test", expire: () => {}, setCrumbs: () => {} };
const wrap = () => render(<SessionProvider value={session}><Stock /></SessionProvider>);

const item = (overrides: Partial<StockItem>): StockItem => ({
  name: "Thuốc", strength: "1 mg", lot: "LOT", expiresAt: "2027-01-01",
  received: 100, dispensed: 0, adjusted: 0, onHand: 100, status: "ok", ...overrides,
});

function stockResult(items: StockItem[]): StockResult {
  const count = (status: StockStatus) => items.filter(entry => entry.status === status).length;
  return {
    items,
    counts: { low: count("low"), out: count("out"), expiring: count("expiring"), expired: count("expired") },
  };
}

const CLOPIDOGREL_A = item({
  name: "Clopidogrel", strength: "75 mg", lot: "LOT-01-A", expiresAt: "2027-06-01",
  received: 50, adjusted: 3, onHand: 47, status: "ok",
});
const CLOPIDOGREL_B = item({
  name: "Clopidogrel", strength: "75 mg", lot: "LOT-02-B", expiresAt: "2026-12-01",
  received: 10, onHand: 10, status: "low",
});
const AMOXICILLIN = item({
  name: "Amoxicillin", strength: "500 mg", lot: "LOT-AMOX", expiresAt: "2026-12-15",
  received: 5, onHand: 5, status: "low",
});
const PARACETAMOL = item({
  name: "Paracetamol", strength: "500 mg", lot: "LOT-PARA", expiresAt: "2027-03-01",
  received: 100, dispensed: 100, onHand: 0, status: "out",
});
const IBUPROFEN = item({
  name: "Ibuprofen", strength: "400 mg", lot: "LOT-IBU", expiresAt: "2026-01-01",
  received: 50, dispensed: 50, onHand: 0, status: "expired",
});

const ALL = [CLOPIDOGREL_A, CLOPIDOGREL_B, AMOXICILLIN, PARACETAMOL, IBUPROFEN];

function adjustedResult(kind: "dispose" | "count", removed: number): AdjustStockResult {
  return {
    name: "Clopidogrel", lot: "LOT-01-A", kind, removed,
    reason: kind === "dispose" ? "Hộp bị hỏng" : "Kiểm kê tháng 11", by: "duocsi.nhathuoc", at: "2026-11-12T02:30:00.000Z",
  };
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new Event("close")); };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openAdjust(mode: "Xuất hủy" | "Kiểm kê", lot = "LOT-01-A") {
  const row = (await screen.findByText(lot)).closest("tr");
  expect(row).toBeTruthy();
  await userEvent.click(within(row as HTMLElement).getByRole("button", { name: mode }));
  return screen.getByRole("dialog", { name: mode === "Kiểm kê" ? "Kiểm kê lô" : "Xuất hủy lô" });
}

describe("stock adjustments", () => {
  it("sends a disposal with the quantity and reason", async () => {
    mocked.getStock.mockResolvedValue(stockResult([CLOPIDOGREL_A]));
    mocked.adjustStock.mockResolvedValue(adjustedResult("dispose", 5));
    wrap();

    const dialog = await openAdjust("Xuất hủy");
    expect(within(dialog).getByText("Số lượng này sẽ bị trừ khỏi tồn kho của lô LOT-01-A.")).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText("Số lượng"), "5");
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), "Hộp bị hỏng");
    await userEvent.click(within(dialog).getByRole("button", { name: "Xuất hủy" }));

    await waitFor(() => expect(mocked.adjustStock).toHaveBeenCalledWith(session.settings, {
      name: "Clopidogrel", lot: "LOT-01-A", kind: "dispose", quantity: 5, reason: "Hộp bị hỏng",
    }));
    await waitFor(() => expect(mocked.getStock).toHaveBeenCalledTimes(2));
  });

  it("sends a count and shows the difference from the books", async () => {
    mocked.getStock.mockResolvedValue(stockResult([CLOPIDOGREL_A]));
    mocked.adjustStock.mockResolvedValue(adjustedResult("count", 2));
    wrap();

    const dialog = await openAdjust("Kiểm kê");
    await userEvent.type(within(dialog).getByLabelText("Số đếm thực tế"), "45");
    expect(within(dialog).getByText("Sổ: 47 · Thực tế: 45 · Chênh: −2")).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), "Kiểm kê tháng 11");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu kiểm kê" }));

    await waitFor(() => expect(mocked.adjustStock).toHaveBeenCalledWith(session.settings, {
      name: "Clopidogrel", lot: "LOT-01-A", kind: "count", counted: 45, reason: "Kiểm kê tháng 11",
    }));
  });

  it("explains a 409 without showing the technical error", async () => {
    mocked.getStock.mockResolvedValue(stockResult([CLOPIDOGREL_A]));
    mocked.adjustStock.mockRejectedValue(new ApiError(409, "exceeds-on-hand", "exceeds-on-hand"));
    wrap();

    const dialog = await openAdjust("Xuất hủy");
    await userEvent.type(within(dialog).getByLabelText("Số lượng"), "5");
    await userEvent.type(within(dialog).getByLabelText(/Lý do/), "Hết hạn");
    await userEvent.click(within(dialog).getByRole("button", { name: "Xuất hủy" }));

    expect(await screen.findByText("Số lượng vượt quá tồn kho hiện tại của lô. Giảm số lượng rồi thử lại.")).toBeTruthy();
    expect(screen.queryByText(/exceeds-on-hand/)).toBeNull();
  });

  it("groups lots by medicine with the total on hand and the worst status", async () => {
    mocked.getStock.mockResolvedValue(stockResult(ALL));
    wrap();

    await screen.findByText("LOT-01-A");
    await userEvent.click(screen.getByRole("tab", { name: /Theo thuốc/ }));

    const row = (await screen.findByText("Clopidogrel")).closest("tr");
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText("57")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("2")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("Sắp hết")).toBeTruthy();
  });

  it("finds medicines and lots without Vietnamese accents", async () => {
    mocked.getStock.mockResolvedValue(stockResult(ALL));
    wrap();

    await screen.findByText("LOT-01-A");
    const search = screen.getByLabelText("Tìm theo tên thuốc hoặc số lô");
    await userEvent.type(search, "clopidogrel");
    await waitFor(() => expect(screen.queryByText("LOT-AMOX")).toBeNull());
    expect(screen.getByText("LOT-01-A")).toBeTruthy();
    expect(screen.getByText("LOT-02-B")).toBeTruthy();

    await userEvent.clear(search);
    await userEvent.type(search, "lot-01");
    await waitFor(() => expect(screen.queryByText("LOT-02-B")).toBeNull());
    expect(screen.getByText("LOT-01-A")).toBeTruthy();
  });

  it("filters to the lots that need attention", async () => {
    mocked.getStock.mockResolvedValue(stockResult(ALL));
    wrap();

    await screen.findByText("LOT-01-A");
    await userEvent.selectOptions(screen.getByLabelText("Trạng thái"), "attention");

    await waitFor(() => expect(screen.queryByText("LOT-01-A")).toBeNull());
    expect(screen.getByText("LOT-02-B")).toBeTruthy();
    expect(screen.getByText("LOT-AMOX")).toBeTruthy();
    expect(screen.getByText("LOT-PARA")).toBeTruthy();
    expect(screen.getByText("LOT-IBU")).toBeTruthy();
  });
});
