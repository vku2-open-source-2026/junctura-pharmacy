// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { listRecords, storeUnavailable } from "./records.mjs";

const COLLECTION = "settings";
export const DEFAULT_SETTINGS = Object.freeze({ lowStock: 20, expiringDays: 60 });

/** Returns the cleaned settings or null when a value is out of range. */
export function validSettings(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { lowStock, expiringDays } = body;
  if (!Number.isInteger(lowStock) || lowStock < 0 || lowStock > 10000) return null;
  if (!Number.isInteger(expiringDays) || expiringDays < 1 || expiringDays > 365) return null;
  return { lowStock, expiringDays };
}

/**
 * Pharmacy settings on the append-only record store: every save is a new record and the
 * newest one is in force. Without any saved record the defaults apply.
 */
export function createSettings({ client }) {
  return Object.freeze({
    async current() {
      let records;
      try {
        records = await listRecords(client, COLLECTION);
      } catch {
        throw storeUnavailable();
      }
      const latest = records
        .filter(entry => validSettings(entry) && typeof entry.at === "string")
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
      return latest
        ? { ...validSettings(latest), updatedAt: latest.at, updatedBy: latest.by }
        : { ...DEFAULT_SETTINGS, updatedAt: null, updatedBy: null };
    },

    async save(values, by) {
      const entry = { ...values, by, at: new Date().toISOString() };
      try {
        await client.createRecord(COLLECTION, entry);
      } catch {
        throw storeUnavailable();
      }
      return { ...values, updatedAt: entry.at, updatedBy: by };
    },
  });
}
