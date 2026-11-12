// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHistory } from "./api";
import { History } from "./History";
import { SessionProvider } from "./session";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  getHistory: vi.fn(),
}));

const mocked = { getHistory: vi.mocked(getHistory) };
const session = { settings: { issuer: "https://id.test", clientId: "c" }, facility: "Nhà thuốc test", expire: () => {}, setCrumbs: () => {} };
const wrap = () => render(<SessionProvider value={session}><History /></SessionProvider>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("history screen", () => {
  it("shows an empty state when there is no history", async () => {
    mocked.getHistory.mockResolvedValue({ items: [] });
    wrap();
    expect(await screen.findByText("Chưa có lịch sử")).toBeTruthy();
  });

  it("lists dispensed and refused entries", async () => {
    mocked.getHistory.mockResolvedValue({
      items: [
        {
          prescriptionCode: "DT-2026-004521", outcome: "dispensed", pharmacist: "duocsi.nhathuoc", at: "2026-11-01T09:00:00.000Z",
          items: [{ name: "Clopidogrel", strength: "75 mg", quantity: 30, lot: "LOT-A" }],
        },
        {
          prescriptionCode: "DT-2026-009999", outcome: "refused", reason: "Sai liều", pharmacist: "duocsi.nhathuoc", at: "2026-11-01T08:00:00.000Z",
        },
      ],
    });
    wrap();
    expect(await screen.findByText("DT-2026-004521")).toBeTruthy();
    expect(screen.getByText("DT-2026-009999")).toBeTruthy();
    expect(screen.getByText("Đã phát")).toBeTruthy();
    expect(screen.getByText("Từ chối")).toBeTruthy();
    expect(screen.getByText("Clopidogrel ×30 (lô LOT-A)")).toBeTruthy();
    expect(screen.getByText("Sai liều")).toBeTruthy();
  });

  it("offers a retry when loading fails", async () => {
    mocked.getHistory.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ items: [] });
    wrap();
    await userEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có lịch sử")).toBeTruthy();
  });
});
