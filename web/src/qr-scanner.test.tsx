// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QrScanner } from "./QrScanner";

const QR = "JH1|RX|DT-2026-004521|0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
const PERMISSION = "Trình duyệt chưa cho dùng camera. Cho phép camera rồi thử lại, hoặc dùng máy quét/nhập tay.";

let getUserMedia: ReturnType<typeof vi.fn>;

const streamWith = (stop: ReturnType<typeof vi.fn>) => ({
  getTracks: () => [{ stop }],
}) as unknown as MediaStream;

class DetectorReturning {
  constructor(_options?: { formats?: string[] }) {}
  async detect() {
    return [{ rawValue: QR }];
  }
}

class DetectorWithoutCode {
  constructor(_options?: { formats?: string[] }) {}
  async detect() {
    return [];
  }
}

beforeAll(() => {
  HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
  HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new Event("close")); };
});

beforeEach(() => {
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (globalThis as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
});

describe("QR camera scanner", () => {
  it("returns the scanned code and stops the camera tracks", async () => {
    const stop = vi.fn();
    getUserMedia.mockResolvedValue(streamWith(stop));
    (globalThis as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = DetectorReturning;
    const onResult = vi.fn();

    render(<QrScanner onResult={onResult} />);
    await userEvent.click(screen.getByRole("button", { name: "Quét bằng camera" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(QR));
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      video: expect.objectContaining({ facingMode: "environment" }),
      audio: false,
    }));
    expect(stop).toHaveBeenCalled();
  });

  it("explains a denied camera permission", async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    render(<QrScanner onResult={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Quét bằng camera" }));

    expect(await screen.findByText(PERMISSION)).toBeTruthy();
  });

  it("stops the camera when the dialog is closed", async () => {
    const stop = vi.fn();
    getUserMedia.mockResolvedValue(streamWith(stop));
    (globalThis as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = DetectorWithoutCode;
    render(<QrScanner onResult={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Quét bằng camera" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Đóng" }));

    expect(stop).toHaveBeenCalled();
  });

  it("refuses the camera outside HTTPS or localhost", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    render(<QrScanner onResult={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Quét bằng camera" }));

    expect(await screen.findByText("Camera chỉ dùng được trên HTTPS hoặc localhost")).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
