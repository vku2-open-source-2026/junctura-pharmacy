// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { vietnamDate } from "./overview.mjs";

const DAY = 86_400_000;
export const MAX_DAYS = 92;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates an inclusive Vietnam-time date range; defaults to the last 30 days. */
export function reportRange({ from, to } = {}, now = new Date()) {
  const today = vietnamDate(now);
  const end = to ?? today;
  const start = from ?? vietnamDate(new Date(Date.parse(`${end}T12:00:00Z`) - 29 * DAY));
  if (!DATE.test(start) || !DATE.test(end) || vietnamDate(`${start}T12:00:00Z`) !== start || vietnamDate(`${end}T12:00:00Z`) !== end) return null;
  const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1;
  if (days < 1 || days > MAX_DAYS) return null;
  return { from: start, to: end, days };
}

/**
 * Counts only, never names or patients: dispensed and refused prescriptions per day,
 * quantities dispensed per medicine, refusal reasons, allergy overrides and calls
 * Junctura blocked for missing consent, all within the range (Vietnam time).
 */
export function buildReport({ range, history = [], calls = [] }) {
  const inRange = entry => { const day = typeof entry?.at === "string" ? vietnamDate(entry.at) : null; return day && day >= range.from && day <= range.to ? day : null; };
  const days = new Map();
  for (let i = 0; i < range.days; i++) {
    const day = vietnamDate(new Date(Date.parse(`${range.from}T12:00:00Z`) + i * DAY));
    days.set(day, { date: day, dispensed: 0, refused: 0 });
  }
  const medicines = new Map();
  const reasons = new Map();
  let allergyOverrides = 0;
  for (const entry of history) {
    const day = inRange(entry);
    if (!day) continue;
    if (entry.outcome === "dispensed") {
      days.get(day).dispensed++;
      if (entry.allergyOverride) allergyOverrides++;
      for (const item of Array.isArray(entry.items) ? entry.items : []) {
        const key = `${item.name}\u0000${item.strength ?? ""}`;
        const row = medicines.get(key) ?? { name: item.name, strength: item.strength ?? "", quantity: 0, prescriptions: 0 };
        row.quantity += Number(item.quantity) || 0;
        row.prescriptions++;
        medicines.set(key, row);
      }
    } else if (entry.outcome === "refused") {
      days.get(day).refused++;
      const reason = String(entry.reason ?? "").trim() || "Không ghi lý do";
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
  }
  const noConsent = calls.filter(entry => inRange(entry) && entry.capability === "prescription-verify" && entry.outcome === "no-consent").length;
  const perDay = [...days.values()];
  const dispensed = perDay.reduce((sum, row) => sum + row.dispensed, 0);
  const refused = perDay.reduce((sum, row) => sum + row.refused, 0);
  return {
    from: range.from,
    to: range.to,
    totals: { dispensed, refused, refusalRate: dispensed + refused ? Math.round((refused / (dispensed + refused)) * 1000) / 10 : 0, allergyOverrides, noConsent },
    perDay,
    medicines: [...medicines.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)),
    refusalReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

const cell = value => {
  const text = String(value ?? "");
  // Quote every cell and neutralise spreadsheet formulas.
  return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
};

/** CSV with a UTF-8 BOM so Excel opens Vietnamese text correctly. */
export function reportCsv(report) {
  const lines = [
    ["Báo cáo nhà thuốc", `${report.from} đến ${report.to}`],
    [],
    ["Ngày", "Đã phát", "Đã từ chối"],
    ...report.perDay.map(row => [row.date, row.dispensed, row.refused]),
    [],
    ["Thuốc", "Hàm lượng", "Số lượng đã phát", "Số đơn"],
    ...report.medicines.map(row => [row.name, row.strength, row.quantity, row.prescriptions]),
    [],
    ["Lý do từ chối", "Số lần"],
    ...report.refusalReasons.map(row => [row.reason, row.count]),
    [],
    ["Tổng đã phát", report.totals.dispensed],
    ["Tổng đã từ chối", report.totals.refused],
    ["Tỷ lệ từ chối (%)", report.totals.refusalRate],
    ["Phát dù trùng dị ứng", report.totals.allergyOverrides],
    ["Bị chặn vì chưa có đồng thuận", report.totals.noConsent],
  ];
  return `\uFEFF${lines.map(row => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
