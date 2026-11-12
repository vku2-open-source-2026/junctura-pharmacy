// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignInPage } from "@junctura/health-ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Landing } from "./Landing";

afterEach(cleanup);

describe("public pages", () => {
  it("landing page shows the three values, source links and sends the user to sign-in", async () => {
    const onSignIn = vi.fn();
    render(<Landing facility="Nhà thuốc test" onSignIn={onSignIn} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Xác minh đơn/);
    for (const value of [/Xác minh đơn trong vài giây/, /Cảnh báo dị ứng trước khi phát/, /Không cần xem toàn bộ hồ sơ/]) {
      expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(/Câu hỏi thường gặp/)[0]).toBeTruthy();
    expect(screen.getByRole("link", { name: "Mã nguồn" }).getAttribute("href")).toBe(
      "https://github.com/vku2-open-source-2026/junctura-pharmacy",
    );
    expect(screen.getByRole("link", { name: "Junctura Health" }).getAttribute("href")).toBe(
      "https://github.com/vku2-open-source-2026/junctura-health",
    );
    await userEvent.click(screen.getAllByRole("button", { name: /Đăng nhập với Junctura/ })[0]);
    expect(onSignIn).toHaveBeenCalled();
  });

  it("sign-in page explains a failed attempt and can go back", async () => {
    const onSignIn = vi.fn();
    const onBack = vi.fn();
    render(<SignInPage product="Pharmacy" onSignIn={onSignIn} onBack={onBack} message="Phiên đăng nhập đã hết hạn." />);
    expect(screen.getByText("Phiên đăng nhập đã hết hạn.")).toBeTruthy();
    await userEvent.click(screen.getAllByRole("button", { name: /Đăng nhập/ })[0]);
    expect(onSignIn).toHaveBeenCalled();
  });
});
