// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiError, getStock, receiveStock } from "./api";
import { SessionProvider } from "./session";
import { Stock } from "./Stock";
import type { StockItem, StockResult, StockStatus } from "./types";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  getStock: vi.fn(),
  receiveStock: vi.fn(),
}));

const mocked = { getStock: vi.mocked(getStock), receiveStock: vi.mocked(receiveStock) };
const session = { settings: { issuer: "https://id.test", clientId: "c" }, facility: "Nhà thuốc test", expire: () => {}, setCrumbs: () => {} };
const wrap = () => render(<SessionProvider value={session}><Stock /></SessionProvider>);

const item = (overrides: Partial<StockItem>): StockItem => ({
  name: "Thuốc", strength: "1 mg", lot: "LOT", expiresAt: "2027-01-01",
  received: 100, dispensed: 0, onHand: 100, status: "ok", ...overrides,
});

function stockResult(items: StockItem[]): StockResult {
  const count = (status: StockStatus) => items.filter(entry => entry.status === status).length;
  return {
    items,
    counts: { low: count("low"), out: count("out"), expiring: count("expiring"), expired: count("expired") },
  };
}

const ITEMS = [
  item({ name: "Amoxicillin", strength: "500 mg", lot: "LOT-A", onHand: 5, status: "low" }),
  item({ name: "Paracetamol", strength: "500 mg", lot: "LOT-B", onHand: 0, dispensed: 100, status: "out" }),
  item({ name: "Aspirin", strength: "81 mg", lot: "LOT-C", expiresAt: "2026-12-01", onHand: 40, dispensed: 10, status: "expiring" }),
  item({ name: "Ibuprofen", strength: "400 mg", lot: "LOT-D", expiresAt: "2026-01-01", onHand: 0, dispensed: 50, status: "expired" }),
  item({ name: "Clopidogrel", strength: "75 mg", lot: "LOT-E", onHand: 90, dispensed: 10, status: "ok" }),
];

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new Event("close")); };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function fillForm(quantity = "20", expiresAt = "2027-12-31") {
  await userEvent.type(screen.getByLabelText("Tên thuốc"), "Amoxicillin");
  await userEvent.type(screen.getByLabelText("Hàm lượng"), "500 mg");
  await userEvent.type(screen.getByLabelText("Số lô"), "LOT-NEW");
  await userEvent.type(screen.getByLabelText("Số lượng"), quantity);
  fireEvent.change(screen.getByLabelText("Hạn dùng"), { target: { value: expiresAt } });
}

describe("stock screen", () => {
  it("shows the warning counts and the status of every lot", async () => {
    mocked.getStock.mockResolvedValue(stockResult(ITEMS));
    wrap();

    expect(await screen.findByText("Có lô đã hết hạn: không phát thuốc từ các lô này")).toBeTruthy();
    expect(screen.getByText("Có lô đã hết hàng")).toBeTruthy();

    const card = (hint: string) => screen.getByText(hint).parentElement?.textContent ?? "";
    expect(card("Còn từ 20 sản phẩm trở xuống")).toContain("Lô sắp hết");
    expect(card("Còn từ 20 sản phẩm trở xuống")).toContain("1");
    expect(card("Không còn sản phẩm nào")).toContain("Hết hàng");
    expect(card("Không còn sản phẩm nào")).toContain("1");
    expect(card("Trong vòng 60 ngày tới")).toContain("Sắp hết hạn");
    expect(card("Trong vòng 60 ngày tới")).toContain("1");
    expect(card("Không được phát")).toContain("Đã hết hạn");
    expect(card("Không được phát")).toContain("1");

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Sắp hết")).toBeTruthy();
    expect(within(table).getByText("Hết hàng")).toBeTruthy();
    expect(within(table).getByText("Sắp hết hạn")).toBeTruthy();
    expect(within(table).getByText("Đã hết hạn")).toBeTruthy();
    expect(within(table).getByText("Còn hàng")).toBeTruthy();
    expect(within(table).getByText("Tồn / đã nhập")).toBeTruthy();
    expect(within(table).getByText("5 / 100")).toBeTruthy();
  });

  it("suggests importing a lot or seeding when the stock is empty", async () => {
    mocked.getStock.mockResolvedValue(stockResult([]));
    wrap();

    expect(await screen.findByText("Kho chưa có lô thuốc")).toBeTruthy();
    expect(screen.getByText("npm run seed:stock")).toBeTruthy();
  });

  it("sends the received lot and reloads the stock", async () => {
    mocked.getStock.mockResolvedValue(stockResult([ITEMS[0]]));
    mocked.receiveStock.mockResolvedValue({
      name: "Amoxicillin", strength: "500 mg", lot: "LOT-NEW", quantity: 20, expiresAt: "2027-12-31", receivedBy: "duocsi.nhathuoc",
    });
    wrap();

    await userEvent.click(await screen.findByRole("button", { name: "Nhập lô" }));
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Lưu lô" }));

    await waitFor(() => expect(mocked.receiveStock).toHaveBeenCalledWith(session.settings, {
      name: "Amoxicillin", strength: "500 mg", lot: "LOT-NEW", quantity: 20, expiresAt: "2027-12-31",
    }));
    await waitFor(() => expect(mocked.getStock).toHaveBeenCalledTimes(2));
  });

  it("explains a rejected lot without showing the technical error", async () => {
    mocked.getStock.mockResolvedValue(stockResult([ITEMS[0]]));
    mocked.receiveStock.mockRejectedValue(new ApiError(400, "invalid-request", "invalid-request"));
    wrap();

    await userEvent.click(await screen.findByRole("button", { name: "Nhập lô" }));
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Lưu lô" }));

    expect(await screen.findByText("Thông tin lô chưa hợp lệ. Kiểm tra lại các trường rồi thử lại.")).toBeTruthy();
    expect(screen.queryByText(/invalid-request/)).toBeNull();
  });

  it("checks the fields before sending a lot", async () => {
    mocked.getStock.mockResolvedValue(stockResult([ITEMS[0]]));
    wrap();

    await userEvent.click(await screen.findByRole("button", { name: "Nhập lô" }));
    await userEvent.click(screen.getByRole("button", { name: "Lưu lô" }));

    expect(await screen.findByText("Tên thuốc cần từ 1 đến 160 ký tự.")).toBeTruthy();
    expect(screen.getByText("Chọn hạn dùng hợp lệ.")).toBeTruthy();
    expect(mocked.receiveStock).not.toHaveBeenCalled();
  });
});
