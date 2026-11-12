// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
export interface PublicConfig { issuer: string; clientId: string; facility: string }
export interface Me { username: string; displayName: string; role: string }

export type CapabilityStatus = "ok" | "no-consent" | "not-authorized" | "unavailable" | "failed" | "invalid-output";

export interface PrescriptionItem {
  name: string;
  strength: string;
  quantity: number;
  instructions: string;
}

export interface PrescriptionOutput {
  valid: boolean;
  issuedAt: string;
  expiresAt: string;
  items: PrescriptionItem[];
  dispensed: boolean;
}

export interface PrescriptionResult {
  status: CapabilityStatus;
  output?: PrescriptionOutput;
  receivedAt?: string;
}

export type AllergyState = "recorded" | "none-known" | "not-recorded";

export interface Allergy {
  substance: string;
  severity: string;
  reaction: string;
}

export interface AllergyOutput {
  allergies: Allergy[];
  allergyState: AllergyState;
  updatedAt: string;
}

export interface AllergyResult {
  status: CapabilityStatus;
  output?: AllergyOutput;
  receivedAt?: string;
}

export type Blocker = "prescription-unavailable" | "invalid" | "expired" | "already-dispensed" | "allergies-unknown";

export interface VerificationResult {
  prescriptionCode: string;
  patient: string;
  checkedAt: string;
  prescription: PrescriptionResult;
  allergies: AllergyResult;
  dispensable: boolean;
  blockers: Blocker[];
  /** Prescribed medicines that match a recorded allergy (by name or allergy class). */
  allergyConflicts?: AllergyConflict[];
}

export interface AllergyConflict { medicine: string; allergen: string; severity: string }

export type VerifyInput = { qr: string } | { prescriptionCode: string; patient: string };

export interface DispenseItem {
  name: string;
  quantity: number;
  lot: string;
}

export type DispenseInput = VerifyInput & { items: DispenseItem[]; allergyOverride?: string };

export interface DispensedItem extends DispenseItem {
  strength: string;
}

export interface DispenseResult {
  prescriptionCode: string;
  outcome: "dispensed";
  items: DispensedItem[];
  pharmacist: string;
  at: string;
}

export type RefuseInput = VerifyInput & { reason: string };

export interface RefuseResult {
  prescriptionCode: string;
  outcome: "refused";
  reason: string;
  pharmacist: string;
  at: string;
}

export interface HistoryItem {
  id: string;
  prescriptionCode: string;
  outcome: "dispensed" | "refused";
  reason?: string;
  items?: DispensedItem[];
  allergyOverride?: string;
  pharmacist: string;
  at: string;
}

export interface HistoryResult {
  items: HistoryItem[];
}

export type AuditAction = "verify" | "dispense" | "refuse" | "stock-receive" | "stock-adjust";

export interface AuditItem {
  action: AuditAction;
  by: string;
  displayName: string;
  prescriptionCode?: string;
  detail: string;
  at: string;
}

export interface AuditResult {
  items: AuditItem[];
}

export interface CallLogItem {
  capability: string;
  purpose: string;
  outcome: CapabilityStatus;
  prescriptionCode?: string;
  pharmacist: string;
  at: string;
}

export interface CallLogResult {
  items: CallLogItem[];
}

export type StockStatus = "ok" | "low" | "out" | "expiring" | "expired";

export interface StockItem {
  name: string;
  strength: string;
  lot: string;
  expiresAt: string;
  received: number;
  dispensed: number;
  adjusted: number;
  onHand: number;
  status: StockStatus;
}

export interface StockCounts {
  low: number;
  out: number;
  expiring: number;
  expired: number;
}

export interface StockResult {
  items: StockItem[];
  counts: StockCounts;
}

export interface ReceiveStockInput {
  name: string;
  strength: string;
  lot: string;
  quantity: number;
  expiresAt: string;
}

export type AdjustStockInput =
  | { name: string; lot: string; kind: "dispose"; quantity: number; reason: string }
  | { name: string; lot: string; kind: "count"; counted: number; reason: string };

export interface AdjustStockResult {
  name: string;
  lot: string;
  kind: "dispose" | "count";
  removed: number;
  reason: string;
  by: string;
  at: string;
}

export interface OverviewToday {
  verified: number;
  dispensed: number;
  refused: number;
  noConsent: number;
  allergyOverrides: number;
}

export interface OverviewStock {
  counts: StockCounts;
  attention: StockItem[];
}

export interface OverviewResult {
  date: string;
  today: OverviewToday | null;
  stock: OverviewStock | null;
  recent: HistoryItem[] | null;
}

export interface ReportTotals {
  dispensed: number;
  refused: number;
  refusalRate: number;
  allergyOverrides: number;
  noConsent: number;
}

export interface ReportDay {
  date: string;
  dispensed: number;
  refused: number;
}

export interface ReportMedicine {
  name: string;
  strength: string;
  quantity: number;
  prescriptions: number;
}

export interface ReportRefusalReason {
  reason: string;
  count: number;
}

export interface ReportResult {
  from: string;
  to: string;
  totals: ReportTotals;
  perDay: ReportDay[];
  medicines: ReportMedicine[];
  refusalReasons: ReportRefusalReason[];
}

export interface SettingsResult {
  lowStock: number;
  expiringDays: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SettingsInput {
  lowStock: number;
  expiringDays: number;
}
