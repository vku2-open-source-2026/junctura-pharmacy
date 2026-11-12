// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHistory } from "./api";
import { History } from "./History";
import { navigate } from "./router";
import { SessionProvider } from "./session";
import type { HistoryItem } from "./types";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  getHistory: vi.fn(),
}));

vi.mock("./router", () => ({ navigate: vi.fn() }));

const mocked = { getHistory: vi.mocked(getHistory), navigate: vi.mocked(navigate) };
const session = { settings: { issuer: "https://id.test", clientId: "c" }, facility: "Nhà thuốc test", expire: () => {}, setCrumbs: () => {} };
const wrap = () => render(<SessionProvider value={session}><History /></SessionProvider>);

const DISPENSED: HistoryItem = {
  id: "rec-1", prescriptionCode: "DT-2026-004521", outcome: "dispensed",
  pharmacist: "duocsi.nhathuoc", pharmacistName: "DS. Võ Thu Trang", at: "2026-11-01T09:00:00.000Z",
  items: [{ name: "Clopidogrel", strength: "75 mg", quantity: 30, lot: "LOT-A" }],
};
const REFUSED: HistoryItem = {
  id: "rec-2", prescriptionCode: "DT-2026-009999", outcome: "refused", reason: "Sai liều",
  pharmacist: "duocsi.nhathuoc", at: "2026-11-01T08:00:00.000Z",
};
const ACCENTED: HistoryItem = {
  id: "rec-3", prescriptionCode: "DT-2026-004530", outcome: "dispensed",
  pharmacist: "duocsi.nhathuoc", at: "2026-11-01T07:00:00.000Z",
  items: [{ name: "Thuốc bổ", strength: "1 viên", quantity: 2, lot: "LOT-C" }],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("history screen", () => {
  it("shows an empty state that points to verification", async () => {
    mocked.getHistory.mockResolvedValue({ items: [] });
    wrap();
    expect(await screen.findByText("Chưa có đơn nào được phát hay từ chối")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Đi tới Xác minh đơn" })).toBeTruthy();
  });

  it("lists dispensed and refused entries with the pharmacist name when known", async () => {
    mocked.getHistory.mockResolvedValue({ items: [DISPENSED, REFUSED] });
    wrap();
    const table = await screen.findByRole("table");
    expect(within(table).getByText("…004521")).toBeTruthy();
    expect(within(table).getByText("…009999")).toBeTruthy();
    expect(within(table).getByTitle("DT-2026-004521")).toBeTruthy();
    expect(within(table).getByTitle("DT-2026-009999")).toBeTruthy();
    expect(within(table).getByText("Đã phát")).toBeTruthy();
    expect(within(table).getByText("Từ chối")).toBeTruthy();
    expect(within(table).getByText("Clopidogrel ×30 (lô LOT-A)")).toBeTruthy();
    expect(within(table).getByText("Sai liều")).toBeTruthy();
    expect(within(table).getByText("DS. Võ Thu Trang")).toBeTruthy();
    expect(within(table).getByText("duocsi.nhathuoc")).toBeTruthy();

    const viewButtons = within(table).getAllByRole("button", { name: "Xem" });
    expect(viewButtons).toHaveLength(2);
    await userEvent.click(viewButtons[0]);
    expect(mocked.navigate).toHaveBeenCalledWith("/lich-su/rec-1");
  });

  it("filters by outcome with counts and searches code or medicine without accents", async () => {
    mocked.getHistory.mockResolvedValue({ items: [DISPENSED, REFUSED, ACCENTED] });
    wrap();
    await screen.findByRole("table");

    expect(screen.getByRole("radio", { name: /Tất cả 3/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Đã phát 2/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Từ chối 1/ })).toBeTruthy();

    await userEvent.click(screen.getByRole("radio", { name: /Từ chối/ }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("…009999")).toBeTruthy();
    expect(within(table).queryByText("…004521")).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: /Tất cả/ }));
    const search = screen.getByLabelText("Tìm theo mã đơn hoặc tên thuốc");
    await userEvent.type(search, "thuoc bo");
    expect(within(table).getByText("…004530")).toBeTruthy();
    expect(within(table).queryByText("…004521")).toBeNull();

    await userEvent.clear(search);
    await userEvent.type(search, "004521");
    expect(within(table).getByText("…004521")).toBeTruthy();
    expect(within(table).queryByText("…009999")).toBeNull();

    await userEvent.clear(search);
    await userEvent.type(search, "không có");
    expect(screen.getByText("Không có đơn phù hợp bộ lọc.")).toBeTruthy();
  });

  it("offers a retry when loading fails", async () => {
    mocked.getHistory.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ items: [] });
    wrap();
    await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có đơn nào được phát hay từ chối")).toBeTruthy();
  });
});
