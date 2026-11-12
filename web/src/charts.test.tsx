// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadReportCsv, getReport } from "./api";
import { DailyBars, HorizontalBars } from "./charts";
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

const report = (): ReportResult => ({
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
});

function todayInVietnam(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") =>
    Number(parts.find(item => item.type === type)?.value ?? 0);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

function formatUtcDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("report charts", () => {
  it("draws one daily column per day and a tooltip with the exact counts", () => {
    const { container } = render(<DailyBars days={[
      { date: "2026-11-10", dispensed: 3, refused: 0 },
      { date: "2026-11-11", dispensed: 0, refused: 0 },
      { date: "2026-11-12", dispensed: 2, refused: 2 },
    ]} />);

    expect(container.querySelectorAll("[data-date]")).toHaveLength(3);
    expect(container.querySelector('[data-date="2026-11-10"] title')?.textContent)
      .toBe("10/11/2026: 3 phát, 0 từ chối");
    expect(container.querySelector('[data-date="2026-11-12"] title')?.textContent)
      .toBe("12/11/2026: 2 phát, 2 từ chối");
    expect(screen.getByRole("img", { name: /Biểu đồ cột theo ngày/ })).toBeTruthy();
    expect(screen.getByText("Xem dạng bảng")).toBeTruthy();
  });

  it("gives the widest horizontal bar to the largest value", () => {
    const { container } = render(
      <HorizontalBars
        items={[
          { key: "a", label: "Thuốc A", value: 10 },
          { key: "b", label: "Thuốc B", value: 30 },
          { key: "c", label: "Thuốc C", value: 5 },
        ]}
        ariaLabel="Thuốc phát nhiều nhất"
        table={<div>Bảng thuốc</div>}
      />,
    );

    const bars = [...container.querySelectorAll<HTMLElement>("[data-value]")];
    expect(bars).toHaveLength(3);
    const widest = bars.reduce((best, bar) =>
      Number(bar.dataset.percent) > Number(best.dataset.percent) ? bar : best);
    expect(widest.getAttribute("data-value")).toBe("30");
    expect(screen.getByRole("img", { name: "Thuốc phát nhiều nhất" })).toBeTruthy();
  });

  it("loads a seven-day range when the quick range button is used", async () => {
    mocked.getReport.mockResolvedValue(report());
    render(<SessionProvider value={session}><Reports /></SessionProvider>);

    await screen.findByText("Báo cáo chỉ có số đếm, không có thông tin người bệnh.");
    await userEvent.click(screen.getByRole("button", { name: "7 ngày" }));

    const end = todayInVietnam();
    const start = new Date(end.getTime());
    start.setUTCDate(start.getUTCDate() - 6);
    await waitFor(() => expect(mocked.getReport).toHaveBeenLastCalledWith(
      session.settings,
      formatUtcDate(start),
      formatUtcDate(end),
    ));
  });
});
