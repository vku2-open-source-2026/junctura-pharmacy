// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, downloadReportCsv, getReport } from "./api";
import { Reports } from "./Reports";
import { SessionProvider } from "./session";
import type { ReportResult } from "./types";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  getReport: vi.fn(),
  downloadReportCsv: vi.fn(),
}));

const mocked = {
  getReport: vi.mocked(getReport),
  downloadReportCsv: vi.mocked(downloadReportCsv),
};
const session = {
  settings: { issuer: "https://id.test", clientId: "c" },
  facility: "Nhà thuốc test",
  expire: () => {},
  setCrumbs: () => {},
};
const wrap = () => render(<SessionProvider value={session}><Reports /></SessionProvider>);

const report = (overrides: Partial<ReportResult> = {}): ReportResult => ({
  from: "2026-10-14",
  to: "2026-11-12",
  totals: { dispensed: 5, refused: 2, refusalRate: 28.6, allergyOverrides: 1, noConsent: 3 },
  perDay: [
    { date: "2026-11-10", dispensed: 3, refused: 0 },
    { date: "2026-11-11", dispensed: 0, refused: 0 },
    { date: "2026-11-12", dispensed: 2, refused: 2 },
  ],
  medicines: [{ name: "Amoxicillin", strength: "500 mg", quantity: 40, prescriptions: 4 }],
  refusalReasons: [{ reason: "Sai liều", count: 2 }],
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("reports screen", () => {
  it("shows the totals, the medicines and only the days with activity", async () => {
    mocked.getReport.mockResolvedValue(report());
    wrap();

    expect(await screen.findByText("Báo cáo chỉ có số đếm, không có thông tin người bệnh.")).toBeTruthy();

    const card = (label: string) => {
      for (const node of screen.getAllByText(label)) {
        const text = node.parentElement?.parentElement?.textContent ?? "";
        if (text.startsWith(label) && /^\d/.test(text.slice(label.length))) return text;
      }
      return "";
    };
    expect(card("Đã phát")).toContain("5");
    expect(card("Đã từ chối")).toContain("2");
    expect(card("Tỷ lệ từ chối (%)")).toContain("28,6%");
    expect(card("Phát dù trùng dị ứng")).toContain("1");
    expect(card("Bị chặn vì chưa đồng thuận")).toContain("3");

    expect(screen.getByText("10/11/2026")).toBeTruthy();
    expect(screen.getByText("12/11/2026")).toBeTruthy();
    expect(screen.queryByText("11/11/2026")).toBeNull();
    expect(screen.getByText("Các ngày không có đơn được ẩn")).toBeTruthy();

    expect(screen.getByText("Amoxicillin")).toBeTruthy();
    expect(screen.getByText("500 mg")).toBeTruthy();
    expect(screen.getByText("Sai liều")).toBeTruthy();
  });

  it("explains an invalid range returned as 400", async () => {
    mocked.getReport.mockRejectedValue(new ApiError(400, "invalid-range", "invalid-range"));
    wrap();

    expect(await screen.findByText("Khoảng ngày không hợp lệ (tối đa 92 ngày)")).toBeTruthy();
  });

  it("queries the chosen range and downloads the CSV for that range", async () => {
    mocked.getReport.mockResolvedValue(report());
    mocked.downloadReportCsv.mockResolvedValue(new Blob(["csv"], { type: "text/csv" }));
    wrap();

    await screen.findByText("Báo cáo chỉ có số đếm, không có thông tin người bệnh.");
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-11-05" } });
    await userEvent.click(screen.getByRole("button", { name: "Xem" }));

    await waitFor(() => expect(mocked.getReport).toHaveBeenLastCalledWith(session.settings, "2026-11-01", "2026-11-05"));

    await userEvent.click(screen.getByRole("button", { name: "Tải CSV" }));
    await waitFor(() => expect(mocked.downloadReportCsv).toHaveBeenCalledWith(session.settings, "2026-11-01", "2026-11-05"));
  });
});
