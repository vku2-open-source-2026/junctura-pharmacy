// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dispense, getStock, refuse, verifyPrescription } from "./api";
import { SessionProvider } from "./session";
import type { VerificationResult } from "./types";
import { Verify } from "./Verify";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  verifyPrescription: vi.fn(),
  dispense: vi.fn(),
  refuse: vi.fn(),
  getStock: vi.fn(),
}));

const mocked = {
  verify: vi.mocked(verifyPrescription),
  dispense: vi.mocked(dispense),
  refuse: vi.mocked(refuse),
  getStock: vi.mocked(getStock),
};

const QR = "JH1|RX|DT-2026-004521|0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const PATIENT = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const ITEMS = [
  { name: "Clopidogrel", strength: "75 mg", quantity: 30, instructions: "Uống 1 viên/ngày" },
  { name: "Aspirin", strength: "81 mg", quantity: 10, instructions: "Uống 1 viên/ngày" },
];

const okResult = (overrides: Partial<VerificationResult> = {}): VerificationResult => ({
  prescriptionCode: "DT-2026-004521",
  patient: PATIENT,
  checkedAt: "2026-11-01T08:00:00.000Z",
  prescription: {
    status: "ok",
    output: { valid: true, issuedAt: "2026-10-29T03:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", items: ITEMS, dispensed: false },
    receivedAt: "2026-11-01T08:00:00.000Z",
  },
  allergies: {
    status: "ok",
    output: { allergies: [], allergyState: "none-known", updatedAt: "2026-10-28T09:15:00.000Z" },
    receivedAt: "2026-11-01T08:00:00.000Z",
  },
  dispensable: true,
  blockers: [],
  ...overrides,
});

const session = { settings: { issuer: "https://id.test", clientId: "c" }, facility: "Nhà thuốc test", expire: () => {}, setCrumbs: () => {} };
const wrap = () => render(<SessionProvider value={session}><Verify /></SessionProvider>);

async function enterQr(value = QR) {
  const input = screen.getByLabelText("Mã QR trên đơn");
  await userEvent.clear(input);
  await userEvent.type(input, `${value}{Enter}`);
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new Event("close")); };
  mocked.getStock.mockResolvedValue({ items: [], counts: { low: 0, out: 0, expiring: 0, expired: 0 } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("verify screen", () => {
  it("sends the QR value when the scanner enters it", async () => {
    mocked.verify.mockResolvedValue(okResult());
    wrap();
    await enterQr();
    await waitFor(() => expect(mocked.verify).toHaveBeenCalledWith(session.settings, { qr: QR }));
  });

  it("switches to manual entry and sends the prescription and patient codes", async () => {
    mocked.verify.mockResolvedValue(okResult());
    wrap();
    await userEvent.click(screen.getByRole("button", { name: "Nhập tay" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Mã đơn" }), "DT-2026-004521");
    await userEvent.type(screen.getByRole("textbox", { name: "Mã người bệnh" }), PATIENT);
    await userEvent.click(screen.getByRole("button", { name: "Xác minh" }));
    await waitFor(() => expect(mocked.verify).toHaveBeenCalledWith(session.settings, { prescriptionCode: "DT-2026-004521", patient: PATIENT }));
  });

  it("shows the medicines and their source for a valid prescription", async () => {
    mocked.verify.mockResolvedValue(okResult());
    wrap();
    await enterQr();
    expect((await screen.findAllByText("Clopidogrel")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Aspirin").length).toBeGreaterThan(0);
    expect(screen.getByText(/Nguồn: Bệnh viện/)).toBeTruthy();
    expect(screen.getByText(/Nguồn: Trạm y tế/)).toBeTruthy();
    expect(screen.getByText("Đơn hợp lệ")).toBeTruthy();
  });

  it("asks for permission when the patient has not consented", async () => {
    mocked.verify.mockResolvedValue(okResult({
      prescription: { status: "no-consent" },
      dispensable: false,
      blockers: ["prescription-unavailable"],
    }));
    wrap();
    await enterQr();
    expect(await screen.findByText("Người bệnh chưa đồng ý cho nhà thuốc xem thông tin này.")).toBeTruthy();
  });

  it("never calls an empty allergy list with not-recorded state no allergy", async () => {
    mocked.verify.mockResolvedValue(okResult({
      allergies: { status: "ok", output: { allergies: [], allergyState: "not-recorded", updatedAt: "2026-10-28T09:15:00.000Z" } },
    }));
    wrap();
    await enterQr();
    expect(await screen.findByText("Chưa ghi nhận dị ứng")).toBeTruthy();
    expect(screen.queryByText(/không (có )?dị ứng/i)).toBeNull();
  });

  it("sends the confirmation quantities and lots for dispensing", async () => {
    mocked.verify.mockResolvedValue(okResult());
    mocked.dispense.mockResolvedValue({
      prescriptionCode: "DT-2026-004521", outcome: "dispensed", pharmacist: "duocsi.nhathuoc", at: "2026-11-01T09:00:00.000Z",
      items: [{ name: "Clopidogrel", strength: "75 mg", quantity: 30, lot: "LOT-A" }, { name: "Aspirin", strength: "81 mg", quantity: 10, lot: "LOT-B" }],
    });
    wrap();
    await enterQr();
    await userEvent.type(await screen.findByLabelText(/Số lô Clopidogrel/), "LOT-A");
    await userEvent.type(screen.getByLabelText(/Số lô Aspirin/), "LOT-B");
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận phát thuốc" }));
    await userEvent.click(await screen.findByRole("button", { name: "Phát thuốc" }));
    await waitFor(() => expect(mocked.dispense).toHaveBeenCalledWith(session.settings, {
      qr: QR,
      items: [{ name: "Clopidogrel", quantity: 30, lot: "LOT-A" }, { name: "Aspirin", quantity: 10, lot: "LOT-B" }],
    }));
  });

  it("explains blockers in Vietnamese", async () => {
    mocked.verify.mockResolvedValue(okResult({
      prescription: {
        status: "ok",
        output: { valid: true, issuedAt: "2026-10-29T03:00:00.000Z", expiresAt: "2026-01-01T00:00:00.000Z", items: ITEMS, dispensed: true },
        receivedAt: "2026-11-01T08:00:00.000Z",
      },
      dispensable: false,
      blockers: ["expired", "already-dispensed"],
    }));
    wrap();
    await enterQr();
    expect(await screen.findByText("Đơn đã hết hạn")).toBeTruthy();
    expect(screen.getByText("Đơn đã được phát")).toBeTruthy();
  });

  it("refuses a prescription with a reason", async () => {
    mocked.verify.mockResolvedValue(okResult());
    mocked.refuse.mockResolvedValue({
      prescriptionCode: "DT-2026-004521", outcome: "refused", reason: "Sai liều", pharmacist: "duocsi.nhathuoc", at: "2026-11-01T09:00:00.000Z",
    });
    wrap();
    await enterQr();
    await userEvent.click(await screen.findByRole("button", { name: "Từ chối phát" }));
    await userEvent.type(screen.getByLabelText(/Lý do từ chối/), "Sai liều");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Từ chối phát" }));
    await waitFor(() => expect(mocked.refuse).toHaveBeenCalledWith(session.settings, { qr: QR, reason: "Sai liều" }));
  });
});
