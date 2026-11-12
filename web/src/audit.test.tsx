// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAudit } from "./api";
import { Audit } from "./Audit";
import { SessionProvider } from "./session";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  getAudit: vi.fn(),
}));

const mocked = { getAudit: vi.mocked(getAudit) };
const session = { settings: { issuer: "https://id.test", clientId: "c" }, facility: "Nhà thuốc test", expire: () => {}, setCrumbs: () => {} };
const wrap = () => render(<SessionProvider value={session}><Audit /></SessionProvider>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("audit log screen", () => {
  it("shows a Vietnamese label for every staff action", async () => {
    mocked.getAudit.mockResolvedValue({
      items: [
        { action: "verify", by: "duocsi.nhathuoc", displayName: "Nguyễn An", prescriptionCode: "DT-2026-004521", detail: "Đã xác minh đơn", at: "2026-11-01T09:00:00.000Z" },
        { action: "dispense", by: "duocsi.nhathuoc", displayName: "Nguyễn An", prescriptionCode: "DT-2026-004521", detail: "2 thuốc", at: "2026-11-01T08:30:00.000Z" },
        { action: "refuse", by: "duocsi.nhathuoc", displayName: "Nguyễn An", prescriptionCode: "DT-2026-004522", detail: "Từ chối phát", at: "2026-11-01T08:00:00.000Z" },
        { action: "stock-receive", by: "duocsi.nhathuoc", displayName: "Nguyễn An", detail: "Nhập lô LOT-A", at: "2026-11-01T07:00:00.000Z" },
        { action: "stock-adjust", by: "duocsi.nhathuoc", displayName: "Nguyễn An", detail: "Điều chỉnh tồn kho", at: "2026-11-01T06:00:00.000Z" },
      ],
    });
    wrap();

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Xác minh")).toBeTruthy();
    expect(within(table).getByText("Phát thuốc")).toBeTruthy();
    expect(within(table).getByText("Từ chối")).toBeTruthy();
    expect(within(table).getByText("Nhập kho")).toBeTruthy();
    expect(within(table).getByText("Điều chỉnh kho")).toBeTruthy();
    expect(within(table).getAllByText("Nguyễn An").length).toBe(5);
    expect(within(table).getAllByText("duocsi.nhathuoc").length).toBe(5);
    expect(within(table).getAllByText("DT-2026-004521").length).toBe(2);
    expect(within(table).getByText("Nhập lô LOT-A")).toBeTruthy();
    expect(screen.getByText("Nhật ký thao tác không lưu thông tin người bệnh.")).toBeTruthy();
  });

  it("shows an empty state that points to verification", async () => {
    mocked.getAudit.mockResolvedValue({ items: [] });
    wrap();

    expect(await screen.findByText("Chưa có thao tác nào được ghi")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Đi tới Xác minh đơn" })).toBeTruthy();
  });

  it("offers a retry when loading fails", async () => {
    mocked.getAudit.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ items: [] });
    wrap();

    await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có thao tác nào được ghi")).toBeTruthy();
  });
});
