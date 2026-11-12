// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { freshAccessToken, type OidcSettings } from "./auth";
import type {
  CallLogResult, DispenseInput, DispenseResult, HistoryResult, Me, PublicConfig, ReceiveStockInput,
  RefuseInput, RefuseResult, StockResult, VerificationResult, VerifyInput,
} from "./types";

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string, readonly blockers?: string[]) {
    super(message);
  }
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
}

type ErrorBody = { error?: string; blockers?: string[] };

async function request<T>(path: string, settings?: OidcSettings, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined) headers["content-type"] = "application/json";
  if (settings) {
    const token = await freshAccessToken(settings);
    if (!token) throw new ApiError(401, "unauthenticated", "unauthenticated");
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(path, { method: options.method ?? "GET", headers, body, signal: options.signal });
  if (!response.ok) {
    let parsed: ErrorBody = {};
    try { parsed = await response.json() as ErrorBody; } catch { /* the body is not JSON */ }
    throw new ApiError(response.status, parsed.error ?? `request failed (${response.status})`, parsed.error, parsed.blockers);
  }
  return response.json() as Promise<T>;
}

export const getConfig = () => request<PublicConfig>("/api/config");
export const getMe = (settings: OidcSettings) => request<Me>("/api/me", settings);
export const verifyPrescription = (settings: OidcSettings, input: VerifyInput, signal?: AbortSignal) =>
  request<VerificationResult>("/api/verify", settings, { method: "POST", body: input, signal });
export const dispense = (settings: OidcSettings, input: DispenseInput) =>
  request<DispenseResult>("/api/dispense", settings, { method: "POST", body: input });
export const refuse = (settings: OidcSettings, input: RefuseInput) =>
  request<RefuseResult>("/api/refuse", settings, { method: "POST", body: input });
export const getHistory = (settings: OidcSettings, signal?: AbortSignal) =>
  request<HistoryResult>("/api/history", settings, { signal });
export const getCallLog = (settings: OidcSettings, signal?: AbortSignal) =>
  request<CallLogResult>("/api/call-log", settings, { signal });
export const getStock = (settings: OidcSettings, signal?: AbortSignal) =>
  request<StockResult>("/api/stock", settings, { signal });
export const receiveStock = (settings: OidcSettings, input: ReceiveStockInput) =>
  request<ReceiveStockInput & { receivedBy: string }>("/api/stock", settings, { method: "POST", body: input });
