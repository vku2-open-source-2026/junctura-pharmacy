// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCallLog } from "./api";
import { CallLog, groupCalls } from "./CallLog";
import { SessionProvider } from "./session";
import type { CallLogItem, CapabilityStatus } from "./types";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  getCallLog: vi.fn(),
}));

const mocked = { getCallLog: vi.mocked(getCallLog) };
const session = { settings: { issuer: "https://id.test", clientId: "c" }, facility: "Nhà thuốc test", expire: () => {}, setCrumbs: () => {} };
const wrap = () => render(<SessionProvider value={session}><CallLog /></SessionProvider>);

const call = (overrides: Partial<CallLogItem> & { capability: string; at: string }): CallLogItem => ({
  purpose: "dispensing",
  outcome: "ok" as CapabilityStatus,
  prescriptionCode: "DT-2026-004521",
  pharmacist: "duocsi.nhathuoc",
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("groupCalls", () => {
  it("merges consecutive calls for one prescription, pharmacist and minute", () => {
    const groups = groupCalls([
      call({ capability: "allergy-list", outcome: "unavailable", at: "2026-11-01T09:00:30.000Z", pharmacistName: "DS. Võ Thu Trang" }),
      call({ capability: "prescription-verify", outcome: "ok", at: "2026-11-01T09:00:00.000Z" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].at).toBe("2026-11-01T09:00:30.000Z");
    expect(groups[0].calls.map(entry => entry.capability)).toEqual(["allergy-list", "prescription-verify"]);
    expect(groups[0].outcome).toBe("unavailable");
    expect(groups[0].pharmacistName).toBe("DS. Võ Thu Trang");
  });

  it("keeps calls apart when the code, pharmacist or minute differs", () => {
    const groups = groupCalls([
      call({ capability: "prescription-verify", at: "2026-11-01T09:01:01.000Z" }),
      call({ capability: "allergy-list", at: "2026-11-01T09:00:00.000Z" }),
      call({ capability: "allergy-list", at: "2026-11-01T08:00:00.000Z", prescriptionCode: "DT-2026-009999" }),
      call({ capability: "prescription-verify", at: "2026-11-01T07:00:00.000Z", pharmacist: "duocsi.khac" }),
    ]);

    expect(groups).toHaveLength(4);
    expect(groups.map(group => group.at)).toEqual([
      "2026-11-01T09:01:01.000Z",
      "2026-11-01T09:00:00.000Z",
      "2026-11-01T08:00:00.000Z",
      "2026-11-01T07:00:00.000Z",
    ]);
  });
});

describe("call log screen", () => {
  it("shows Vietnamese labels for every capability and outcome, without patient data", async () => {
    mocked.getCallLog.mockResolvedValue({
      items: [
        { capability: "prescription-verify", purpose: "dispensing", outcome: "ok", prescriptionCode: "DT-2026-004521", pharmacist: "duocsi.nhathuoc", pharmacistName: "DS. Võ Thu Trang", at: "2026-11-01T09:00:00.000Z" },
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
    expect(within(table).getByText("Thành công")).toBeTruthy();
    expect(within(table).getByText("Chưa có đồng thuận")).toBeTruthy();
    expect(within(table).getByText("Chưa được cấp quyền")).toBeTruthy();
    expect(within(table).getByText("Không kết nối được")).toBeTruthy();
    expect(within(table).getAllByText("Lỗi").length).toBe(2);
    expect(within(table).getByText("…004521")).toBeTruthy();
    expect(within(table).getByTitle("DT-2026-004521")).toBeTruthy();
    expect(within(table).getByText("DS. Võ Thu Trang")).toBeTruthy();
    expect(within(table).getAllByText("duocsi.nhathuoc").length).toBe(5);
    expect(screen.getByText("Mỗi dòng là một lần nhà thuốc hỏi Junctura khi xác minh đơn, mới nhất trước.")).toBeTruthy();
    expect(screen.getByText("Nhật ký không lưu thông tin người bệnh.")).toBeTruthy();
    expect(screen.queryByText("Người bệnh")).toBeNull();
    expect(screen.queryByText("Mã người bệnh")).toBeNull();
  });

  it("shows one row for the two calls of one verification", async () => {
    mocked.getCallLog.mockResolvedValue({
      items: [
        { capability: "allergy-list", purpose: "dispensing", outcome: "unavailable", prescriptionCode: "DT-2026-004521", pharmacist: "duocsi.nhathuoc", pharmacistName: "DS. Võ Thu Trang", at: "2026-11-01T09:00:00.000Z" },
        { capability: "prescription-verify", purpose: "dispensing", outcome: "ok", prescriptionCode: "DT-2026-004521", pharmacist: "duocsi.nhathuoc", pharmacistName: "DS. Võ Thu Trang", at: "2026-11-01T09:00:00.000Z" },
      ],
    });
    wrap();

    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByText("Xác minh đơn thuốc")).toBeTruthy();
    expect(within(table).getByText("Danh sách dị ứng")).toBeTruthy();
    expect(within(table).getByText("Không kết nối được")).toBeTruthy();
    expect(within(table).queryByText("Thành công")).toBeNull();
  });

  it("shows an empty state that points to verification", async () => {
    mocked.getCallLog.mockResolvedValue({ items: [] });
    wrap();

    expect(await screen.findByText("Chưa có lần gọi Junctura nào")).toBeTruthy();
    expect(screen.getByText("Mỗi lần xác minh đơn sẽ được ghi ở đây.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Đi tới Xác minh đơn" })).toBeTruthy();
    expect(screen.getByText("Nhật ký không lưu thông tin người bệnh.")).toBeTruthy();
  });

  it("offers a retry when loading fails", async () => {
    mocked.getCallLog.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ items: [] });
    wrap();

    await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có lần gọi Junctura nào")).toBeTruthy();
  });
});
