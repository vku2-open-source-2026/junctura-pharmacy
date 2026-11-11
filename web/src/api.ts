// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { freshAccessToken, type OidcSettings } from "./auth";
import type { Me, PublicConfig } from "./types";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, settings?: OidcSettings): Promise<T> {
  const headers: Record<string, string> = {};
  if (settings) {
    const token = await freshAccessToken(settings);
    if (!token) throw new ApiError(401, "unauthenticated");
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(path, { headers });
  if (!response.ok) throw new ApiError(response.status, `request failed (${response.status})`);
  return response.json();
}

export const getConfig = () => request<PublicConfig>("/api/config");
export const getMe = (settings: OidcSettings) => request<Me>("/api/me", settings);
