// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The date of an instant in Vietnam time, as YYYY-MM-DD. */
export function vietnamDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(dateFormat.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const ATTENTION_PRIORITY = { expired: 0, out: 1, expiring: 2, low: 3 };

const dayOf = entry => (typeof entry?.at === "string" ? vietnamDate(entry.at) : null);

/**
 * Pure summary of a pharmacy day. A null input means that store is unconfigured or
 * failed; only the sections using it become null, the rest of the page still renders.
 */
export function buildOverview({ now = new Date(), calls, history, stock } = {}) {
  const date = vietnamDate(now);

  let today = null;
  if (Array.isArray(calls) && Array.isArray(history)) {
    const callsToday = calls.filter(entry => dayOf(entry) === date);
    const historyToday = history.filter(entry => dayOf(entry) === date);
    today = {
      verified: callsToday.filter(entry => entry.capability === "prescription-verify").length,
      dispensed: historyToday.filter(entry => entry.outcome === "dispensed").length,
      refused: historyToday.filter(entry => entry.outcome === "refused").length,
      noConsent: callsToday.filter(entry => entry.outcome === "no-consent").length,
      allergyOverrides: historyToday.filter(entry => entry.outcome === "dispensed" && Boolean(entry.allergyOverride)).length,
    };
  }

  let stockSection = null;
  if (Array.isArray(stock)) {
    const counts = { low: 0, out: 0, expiring: 0, expired: 0 };
    for (const item of stock) {
      if (item && Object.hasOwn(counts, item.status)) counts[item.status]++;
    }
    const attention = stock
      .filter(item => item && item.status !== "ok" && Object.hasOwn(ATTENTION_PRIORITY, item.status))
      .sort((a, b) => ATTENTION_PRIORITY[a.status] - ATTENTION_PRIORITY[b.status])
      .slice(0, 5);
    stockSection = { counts, attention };
  }

  let recent = null;
  if (Array.isArray(history)) {
    recent = history
      .filter(entry => entry && typeof entry === "object")
      .slice()
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 5)
      .map(({ patient: omitted, ...entry }) => entry);
  }

  return { date, today, stock: stockSection, recent };
}
