// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispense, verifyPrescription } from "./api";
import { SessionProvider } from "./session";
import type { VerificationResult } from "./types";
import { Verify } from "./Verify";

vi.mock("./api", async importOriginal => ({
  ...(await importOriginal<typeof import("./api")>()),
  verifyPrescription: vi.fn(),
  dispense: vi.fn(),
}));

const QR = "JH1|RX|DT-2026-004521|0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const result: VerificationResult = {
  prescriptionCode: "DT-2026-004521",
  patient: "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d",
  checkedAt: "2026-11-01T08:00:00.000Z",
  prescription: {
    status: "ok",
    output: {
      valid: true, issuedAt: "2026-10-29T03:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", dispensed: false,
      items: [{ name: "Amoxicillin", strength: "500 mg", quantity: 21, instructions: "Uống 1 viên x 3 lần/ngày" }],
    },
    receivedAt: "2026-11-01T08:00:00.000Z",
  },
  allergies: {
    status: "ok",
    output: { allergies: [{ substance: "Penicillin", severity: "severe", reaction: "Nổi mề đay, khó thở" }], allergyState: "recorded", updatedAt: "2026-10-28T09:15:00.000Z" },
    receivedAt: "2026-11-01T08:00:00.000Z",
  },
  dispensable: true,
  blockers: [],
  allergyConflicts: [{ medicine: "Amoxicillin", allergen: "Penicillin", severity: "severe" }],
};

const session = { settings: { issuer: "https://id.test", clientId: "c" }, facility: "Nhà thuốc test", expire: () => {}, setCrumbs: () => {} };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function verify() {
  vi.mocked(verifyPrescription).mockResolvedValue(result);
  render(<SessionProvider value={session}><Verify /></SessionProvider>);
  await userEvent.type(screen.getByLabelText("Mã QR trên đơn"), `${QR}{Enter}`);
  await screen.findByText("Thuốc trong đơn trùng với dị ứng đã ghi nhận");
}

describe("allergy conflicts", () => {
  it("marks the conflicting medicine and explains the risk", async () => {
    await verify();
    expect(screen.getByText("Trùng dị ứng: Penicillin")).toBeTruthy();
    expect(screen.getByText(/Amoxicillin: người bệnh dị ứng Penicillin/)).toBeTruthy();
  });

  it("does not dispense without a written reason", async () => {
    await verify();
    await userEvent.type(screen.getByLabelText("Số lô Amoxicillin"), "LOT-06-A");
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận phát thuốc" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(vi.mocked(dispense)).not.toHaveBeenCalled();
  });

  it("sends the reason with the dispensed items", async () => {
    vi.mocked(dispense).mockResolvedValue({} as Awaited<ReturnType<typeof dispense>>);
    await verify();
    await userEvent.type(screen.getByLabelText("Số lô Amoxicillin"), "LOT-06-A");
    await userEvent.type(screen.getByLabelText(/Lý do vẫn phát thuốc trùng dị ứng/), "Bác sĩ kê đơn đã xác nhận qua điện thoại");
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận phát thuốc" }));
    await waitFor(() => expect(vi.mocked(dispense)).toHaveBeenCalledWith(session.settings, {
      qr: QR,
      items: [{ name: "Amoxicillin", quantity: 21, lot: "LOT-06-A" }],
      allergyOverride: "Bác sĩ kê đơn đã xác nhận qua điện thoại",
    }));
  });
});
