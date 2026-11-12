// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { freshAccessToken, type OidcSettings } from "./auth";
import type {
  AdjustStockInput, AdjustStockResult, AuditResult, CallLogResult, DispenseInput, DispenseResult, HistoryItem,
  HistoryResult, Me, OverviewResult, PublicConfig, ReceiveStockInput, RefuseInput, RefuseResult, ReportResult,
  SettingsInput, SettingsResult, StockResult, VerificationResult, VerifyInput,
} from "./types";

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string, readonly blockers?: string[]) {
    super(message);
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  signal?: AbortSignal;
}

type ErrorBody = { error?: string; blockers?: string[] };

async function authHeaders(settings?: OidcSettings): Promise<Record<string, string>> {
  if (!settings) return {};
  const token = await freshAccessToken(settings);
  if (!token) throw new ApiError(401, "unauthenticated", "unauthenticated");
  return { authorization: `Bearer ${token}` };
}

async function failed(response: Response): Promise<ApiError> {
  let parsed: ErrorBody = {};
  try { parsed = await response.json() as ErrorBody; } catch { /* the body is not JSON */ }
  return new ApiError(response.status, parsed.error ?? `request failed (${response.status})`, parsed.error, parsed.blockers);
}

async function request<T>(path: string, settings?: OidcSettings, options: RequestOptions = {}): Promise<T> {
  const headers = await authHeaders(settings);
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(path, { method: options.method ?? "GET", headers, body, signal: options.signal });
  if (!response.ok) throw await failed(response);
  return response.json() as Promise<T>;
}

function rangeQuery(from?: string, to?: string): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  return query ? `?${query}` : "";
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
export const getHistoryItem = (settings: OidcSettings, id: string, signal?: AbortSignal) =>
  request<HistoryItem>(`/api/history/${encodeURIComponent(id)}`, settings, { signal });
export const getAudit = (settings: OidcSettings, signal?: AbortSignal) =>
  request<AuditResult>("/api/audit", settings, { signal });
export const getCallLog = (settings: OidcSettings, signal?: AbortSignal) =>
  request<CallLogResult>("/api/call-log", settings, { signal });
export const getStock = (settings: OidcSettings, signal?: AbortSignal) =>
  request<StockResult>("/api/stock", settings, { signal });
export const getOverview = (settings: OidcSettings, signal?: AbortSignal) =>
  request<OverviewResult>("/api/overview", settings, { signal });
export const receiveStock = (settings: OidcSettings, input: ReceiveStockInput) =>
  request<ReceiveStockInput & { receivedBy: string }>("/api/stock", settings, { method: "POST", body: input });
export const adjustStock = (settings: OidcSettings, input: AdjustStockInput) =>
  request<AdjustStockResult>("/api/stock/adjust", settings, { method: "POST", body: input });
export const getReport = (settings: OidcSettings, from?: string, to?: string) =>
  request<ReportResult>(`/api/report${rangeQuery(from, to)}`, settings);
export const downloadReportCsv = async (settings: OidcSettings, from: string, to: string): Promise<Blob> => {
  const response = await fetch(`/api/report.csv${rangeQuery(from, to)}`, { headers: await authHeaders(settings) });
  if (!response.ok) throw await failed(response);
  return response.blob();
};
export const getSettings = (settings: OidcSettings) =>
  request<SettingsResult>("/api/settings", settings);
export const saveSettings = (settings: OidcSettings, input: SettingsInput) =>
  request<SettingsResult>("/api/settings", settings, { method: "PUT", body: input });
