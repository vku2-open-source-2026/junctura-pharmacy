// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShortCode } from "./code";

const writeText = vi.fn(() => Promise.resolve());

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("short code", () => {
  it("shows the last six characters but keeps the full code in the title", () => {
    render(<ShortCode value="DT-2026-004521" />);

    expect(screen.getByText("…004521")).toBeTruthy();
    expect(screen.getByTitle("DT-2026-004521")).toBeTruthy();
    expect(screen.queryByText("DT-2026-004521")).toBeNull();
  });

  it("keeps short codes whole", () => {
    render(<ShortCode value="DT-1234" />);

    expect(screen.getByText("DT-1234")).toBeTruthy();
  });

  it("copies the full code from the compact chip", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShortCode value="DT-2026-004521" />);

    await userEvent.click(screen.getByRole("button", { name: "Sao chép DT-2026-004521" }));
    expect(writeText).toHaveBeenCalledWith("DT-2026-004521");
    await waitFor(() => expect(screen.getByRole("button", { name: "Đã sao chép DT-2026-004521" })).toBeTruthy());
  });

  it("can show the full code while still offering the copy button", () => {
    render(<ShortCode value="DT-2026-004521" full />);

    expect(screen.getByText("DT-2026-004521")).toBeTruthy();
    expect(screen.queryByText("…004521")).toBeNull();
  });
});
