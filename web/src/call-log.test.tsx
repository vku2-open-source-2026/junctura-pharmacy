// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCallLog } from "./api";
import { CallLog } from "./CallLog";
import { SessionProvider } from "./session";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  getCallLog: vi.fn(),
}));

const mocked = { getCallLog: vi.mocked(getCallLog) };
const session = { settings: { issuer: "https://id.test", clientId: "c" }, facility: "Nhà thuốc test", expire: () => {}, setCrumbs: () => {} };
const wrap = () => render(<SessionProvider value={session}><CallLog /></SessionProvider>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("call log screen", () => {
  it("shows Vietnamese labels for every capability and outcome, without patient data", async () => {
    mocked.getCallLog.mockResolvedValue({
      items: [
        { capability: "prescription-verify", purpose: "dispensing", outcome: "ok", prescriptionCode: "DT-2026-004521", pharmacist: "duocsi.nhathuoc", at: "2026-11-01T09:00:00.000Z" },
        { capability: "allergy-list", purpose: "dispensing", outcome: "no-consent", prescriptionCode: "DT-2026-004522", pharmacist: "duocsi.nhathuoc", at: "2026-11-01T08:00:00.000Z" },
        { capability: "prescription-verify", purpose: "dispensing", outcome: "not-authorized", prescriptionCode: "DT-2026-004523", pharmacist: "duocsi.nhathuoc", at: "2026-11-01T07:00:00.000Z" },
        { capability: "allergy-list", purpose: "dispensing", outcome: "unavailable", prescriptionCode: "DT-2026-004524", pharmacist: "duocsi.nhathuoc", at: "2026-11-01T06:00:00.000Z" },
        { capability: "prescription-verify", purpose: "dispensing", outcome: "failed", prescriptionCode: "DT-2026-004525", pharmacist: "duocsi.nhathuoc", at: "2026-11-01T05:00:00.000Z" },
        { capability: "allergy-list", purpose: "dispensing", outcome: "invalid-output", prescriptionCode: "DT-2026-004526", pharmacist: "duocsi.nhathuoc", at: "2026-11-01T04:00:00.000Z" },
      ],
    });
    wrap();

    const table = await screen.findByRole("table");
    expect(within(table).getAllByText("Xác minh đơn thuốc").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Danh sách dị ứng").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Phát thuốc").length).toBeGreaterThan(0);
    expect(within(table).getByText("Thành công")).toBeTruthy();
    expect(within(table).getByText("Chưa có đồng thuận")).toBeTruthy();
    expect(within(table).getByText("Chưa được cấp quyền")).toBeTruthy();
    expect(within(table).getByText("Không kết nối được")).toBeTruthy();
    expect(within(table).getAllByText("Lỗi").length).toBe(2);
    expect(within(table).getByText("DT-2026-004521")).toBeTruthy();
    expect(within(table).getAllByText("duocsi.nhathuoc").length).toBeGreaterThan(0);
    expect(screen.getByText("Nhật ký không lưu thông tin người bệnh.")).toBeTruthy();
    expect(screen.queryByText("Người bệnh")).toBeNull();
    expect(screen.queryByText("Mã người bệnh")).toBeNull();
  });

  it("shows an empty state when nothing has been called yet", async () => {
    mocked.getCallLog.mockResolvedValue({ items: [] });
    wrap();

    expect(await screen.findByText("Chưa có nhật ký")).toBeTruthy();
    expect(screen.getByText("Nhật ký không lưu thông tin người bệnh.")).toBeTruthy();
  });

  it("offers a retry when loading fails", async () => {
    mocked.getCallLog.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ items: [] });
    wrap();

    await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có nhật ký")).toBeTruthy();
  });
});
