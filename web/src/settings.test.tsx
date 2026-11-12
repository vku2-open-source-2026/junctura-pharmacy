// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSettings, saveSettings } from "./api";
import { SessionProvider } from "./session";
import { Settings } from "./Settings";
import type { SettingsResult } from "./types";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

const mocked = { getSettings: vi.mocked(getSettings), saveSettings: vi.mocked(saveSettings) };
const session = {
  settings: { issuer: "https://id.test", clientId: "c" },
  facility: "Nhà thuốc test",
  expire: () => {},
  setCrumbs: () => {},
};
const wrap = () => render(<SessionProvider value={session}><Settings /></SessionProvider>);

const settings = (overrides: Partial<SettingsResult> = {}): SettingsResult => ({
  lowStock: 20,
  expiringDays: 60,
  updatedAt: null,
  updatedBy: null,
  ...overrides,
});

const lowStockInput = () => screen.getByLabelText("Coi là sắp hết khi còn tối đa") as HTMLInputElement;
const expiringInput = () => screen.getByLabelText("Coi là sắp hết hạn trong") as HTMLInputElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("settings screen", () => {
  it("starts with the server defaults", async () => {
    mocked.getSettings.mockResolvedValue(settings());
    wrap();

    expect(await screen.findByText("Đang dùng giá trị mặc định")).toBeTruthy();
    expect(lowStockInput().value).toBe("20");
    expect(expiringInput().value).toBe("60");
  });

  it("checks both thresholds before sending anything", async () => {
    mocked.getSettings.mockResolvedValue(settings());
    wrap();

    await screen.findByText("Đang dùng giá trị mặc định");
    fireEvent.change(lowStockInput(), { target: { value: "10001" } });
    fireEvent.change(expiringInput(), { target: { value: "0" } });
    await userEvent.click(screen.getByRole("button", { name: "Lưu cài đặt" }));

    expect(await screen.findByText("Số đơn vị phải là số nguyên từ 0 đến 10.000.")).toBeTruthy();
    expect(screen.getByText("Số ngày phải là số nguyên từ 1 đến 365.")).toBeTruthy();
    expect(mocked.saveSettings).not.toHaveBeenCalled();
  });

  it("saves the entered thresholds and confirms the change", async () => {
    mocked.getSettings.mockResolvedValue(settings());
    mocked.saveSettings.mockResolvedValue(settings({
      lowStock: 15,
      expiringDays: 90,
      updatedAt: "2026-11-12T03:00:00.000Z",
      updatedBy: "duocsi.nhathuoc",
    }));
    wrap();

    await screen.findByText("Đang dùng giá trị mặc định");
    fireEvent.change(lowStockInput(), { target: { value: "15" } });
    fireEvent.change(expiringInput(), { target: { value: "90" } });
    await userEvent.click(screen.getByRole("button", { name: "Lưu cài đặt" }));

    await waitFor(() => expect(mocked.saveSettings).toHaveBeenCalledWith(session.settings, {
      lowStock: 15,
      expiringDays: 90,
    }));
    expect(await screen.findByText("Đã lưu. Trang Kho và Hôm nay dùng ngưỡng mới.")).toBeTruthy();
    expect(screen.getByText(/duocsi\.nhathuoc/)).toBeTruthy();
  });
});
