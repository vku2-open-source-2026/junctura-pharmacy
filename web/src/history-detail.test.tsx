// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getHistoryItem } from "./api";
import { HistoryDetail } from "./HistoryDetail";
import { navigate } from "./router";
import { SessionProvider } from "./session";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  getHistoryItem: vi.fn(),
}));

vi.mock("./router", () => ({ navigate: vi.fn() }));

const mocked = { getHistoryItem: vi.mocked(getHistoryItem), navigate: vi.mocked(navigate) };
const session = { settings: { issuer: "https://id.test", clientId: "c" }, facility: "Nhà thuốc test", expire: () => {}, setCrumbs: () => {} };
const wrap = (id = "rec-1") => render(<SessionProvider value={session}><HistoryDetail id={id} /></SessionProvider>);
const print = vi.spyOn(window, "print").mockImplementation(() => {});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("history detail screen", () => {
  it("shows a dispensed sheet with medicines and the allergy override reason", async () => {
    mocked.getHistoryItem.mockResolvedValue({
      id: "rec-1",
      prescriptionCode: "DT-2026-004521",
      outcome: "dispensed",
      items: [
        { name: "Clopidogrel", strength: "75 mg", quantity: 30, lot: "LOT-A" },
        { name: "Aspirin", strength: "81 mg", quantity: 60, lot: "LOT-B" },
      ],
      allergyOverride: "Người bệnh đã được bác sĩ tư vấn và đồng ý.",
      pharmacist: "duocsi.nhathuoc",
      at: "2026-11-01T09:00:00.000Z",
    });
    wrap();

    expect(await screen.findByRole("heading", { name: "Phiếu phát thuốc" })).toBeTruthy();
    expect(screen.getByText("DT-2026-004521")).toBeTruthy();
    expect(screen.getByText("duocsi.nhathuoc")).toBeTruthy();
    const table = screen.getByRole("table", { name: "Thuốc đã phát" });
    expect(within(table).getByText("Clopidogrel")).toBeTruthy();
    expect(within(table).getByText("75 mg")).toBeTruthy();
    expect(within(table).getByText("LOT-A")).toBeTruthy();
    expect(within(table).getByText("60")).toBeTruthy();
    expect(screen.getByText("Lý do phát dù trùng dị ứng")).toBeTruthy();
    expect(screen.getByText("Người bệnh đã được bác sĩ tư vấn và đồng ý.")).toBeTruthy();
    expect(screen.getByText("Phát hành bởi Junctura Pharmacy · dữ liệu giả lập")).toBeTruthy();
  });

  it("shows a refusal sheet with the reason", async () => {
    mocked.getHistoryItem.mockResolvedValue({
      id: "rec-2",
      prescriptionCode: "DT-2026-009999",
      outcome: "refused",
      reason: "Sai liều so với chỉ định",
      pharmacist: "duocsi.nhathuoc",
      at: "2026-11-01T08:00:00.000Z",
    });
    wrap("rec-2");

    expect(await screen.findByRole("heading", { name: "Phiếu từ chối" })).toBeTruthy();
    expect(screen.getByText("DT-2026-009999")).toBeTruthy();
    expect(screen.getByText("Sai liều so với chỉ định")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows a not-found state when the record does not exist", async () => {
    mocked.getHistoryItem.mockRejectedValue(new ApiError(404, "not-found"));
    wrap("missing");

    expect(await screen.findByText("Không tìm thấy phiếu này")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Quay lại lịch sử" }));
    expect(mocked.navigate).toHaveBeenCalledWith("/lich-su");
  });

  it("prints the sheet and can go back to the history", async () => {
    mocked.getHistoryItem.mockResolvedValue({
      id: "rec-1",
      prescriptionCode: "DT-2026-004521",
      outcome: "refused",
      reason: "Sai liều",
      pharmacist: "duocsi.nhathuoc",
      at: "2026-11-01T08:00:00.000Z",
    });
    wrap();

    await userEvent.click(await screen.findByRole("button", { name: "In phiếu" }));
    expect(print).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Quay lại lịch sử" }));
    expect(mocked.navigate).toHaveBeenCalledWith("/lich-su");
  });
});
