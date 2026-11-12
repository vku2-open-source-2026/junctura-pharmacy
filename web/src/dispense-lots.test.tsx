// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiError, dispense, getStock, verifyPrescription } from "./api";
import { SessionProvider } from "./session";
import type { StockItem, VerificationResult } from "./types";
import { Verify } from "./Verify";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  verifyPrescription: vi.fn(),
  dispense: vi.fn(),
  getStock: vi.fn(),
}));

const QR = "JH1|RX|DT-2026-004521|0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const ITEM = { name: "Amoxicillin", strength: "500 mg", quantity: 21, instructions: "Uống 1 viên x 3 lần/ngày" };

const result: VerificationResult = {
  prescriptionCode: "DT-2026-004521",
  patient: "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d",
  checkedAt: "2026-11-01T08:00:00.000Z",
  prescription: {
    status: "ok",
    output: { valid: true, issuedAt: "2026-10-29T03:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", items: [ITEM], dispensed: false },
    receivedAt: "2026-11-01T08:00:00.000Z",
  },
  allergies: {
    status: "ok",
    output: { allergies: [], allergyState: "none-known", updatedAt: "2026-10-28T09:15:00.000Z" },
    receivedAt: "2026-11-01T08:00:00.000Z",
  },
  dispensable: true,
  blockers: [],
};

const lots: StockItem[] = [
  { name: "Amoxicillin", strength: "500 mg", lot: "LOT-EXPIRED", expiresAt: "2025-01-01T00:00:00.000Z", received: 100, dispensed: 0, adjusted: 0, onHand: 100, status: "expired" },
  { name: "Amoxicillin", strength: "500 mg", lot: "LOT-LATE", expiresAt: "2027-06-01T00:00:00.000Z", received: 100, dispensed: 0, adjusted: 0, onHand: 100, status: "ok" },
  { name: "Amoxicillin", strength: "500 mg", lot: "LOT-EARLY", expiresAt: "2027-01-01T00:00:00.000Z", received: 100, dispensed: 0, adjusted: 0, onHand: 100, status: "ok" },
  { name: "Amoxicillin", strength: "500 mg", lot: "LOT-SMALL", expiresAt: "2026-12-01T00:00:00.000Z", received: 5, dispensed: 0, adjusted: 0, onHand: 5, status: "low" },
];

const session = { settings: { issuer: "https://id.test", clientId: "c" }, facility: "Nhà thuốc test", expire: () => {}, setCrumbs: () => {} };
const wrap = () => render(<SessionProvider value={session}><Verify /></SessionProvider>);

async function verify() {
  vi.mocked(verifyPrescription).mockResolvedValue(result);
  wrap();
  await userEvent.type(screen.getByLabelText("Mã QR trên đơn"), `${QR}{Enter}`);
  await screen.findByRole("button", { name: "Xác nhận phát thuốc" });
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new Event("close")); };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("dispense lots", () => {
  it("preselects the earliest usable lot (FEFO) and hides expired lots", async () => {
    vi.mocked(getStock).mockResolvedValue({ items: lots, counts: { low: 1, out: 0, expiring: 0, expired: 1 } });
    await verify();

    const select = await screen.findByLabelText("Lô Amoxicillin") as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("LOT-EARLY"));
    expect(screen.queryByRole("option", { name: /LOT-EXPIRED/ })).toBeNull();
    expect(screen.getByRole("option", { name: /LOT-SMALL · còn 5 · hạn .*\(không đủ\)/ })).toBeTruthy();
  });

  it("shows a manual lot field when the pharmacist chooses another lot", async () => {
    vi.mocked(getStock).mockResolvedValue({ items: lots, counts: { low: 1, out: 0, expiring: 0, expired: 1 } });
    await verify();

    await userEvent.selectOptions(await screen.findByLabelText("Lô Amoxicillin"), "Lô khác (nhập tay)");
    expect(screen.getByLabelText("Số lô Amoxicillin")).toBeTruthy();
  });

  it("still accepts a typed lot when the stock cannot be loaded", async () => {
    vi.mocked(getStock).mockRejectedValue(new ApiError(503, "stock unavailable"));
    vi.mocked(dispense).mockResolvedValue({} as Awaited<ReturnType<typeof dispense>>);
    await verify();

    await userEvent.type(await screen.findByLabelText("Số lô Amoxicillin"), "LOT-MANUAL");
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận phát thuốc" }));
    await userEvent.click(await screen.findByRole("button", { name: "Phát thuốc" }));
    await waitFor(() => expect(vi.mocked(dispense)).toHaveBeenCalledWith(session.settings, {
      qr: QR,
      items: [{ name: "Amoxicillin", quantity: 21, lot: "LOT-MANUAL" }],
    }));
  });

  it("does not send anything when the pharmacist chooses Quay lại", async () => {
    vi.mocked(getStock).mockResolvedValue({ items: lots, counts: { low: 1, out: 0, expiring: 0, expired: 1 } });
    await verify();

    await userEvent.click(screen.getByRole("button", { name: "Xác nhận phát thuốc" }));
    expect(await screen.findByText("Sau khi phát, đơn được ghi là đã phát tại nhà thuốc và không phát lại được.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    expect(vi.mocked(dispense)).not.toHaveBeenCalled();
  });
});
