// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { listRecords, storeUnavailable } from "./records.mjs";

const COLLECTION = "stock-receipts";
const ADJUSTMENTS = "stock-adjustments";
const DAY_MS = 86_400_000;
const DEFAULT_LOW_ON_HAND = 20;
const DEFAULT_EXPIRING_DAYS = 60;

const lotKey = (name, lot) => `${name}\u0000${lot}`;

/**
 * Stock ledger on the Junctura record store, which only appends: on-hand stock of a lot is
 * what was received, minus what was dispensed, minus what was adjusted (disposed of, or the
 * difference found by a physical count; a count above the books is a negative adjustment).
 */
export function createStock({ client, dispensing, settings }) {
  return Object.freeze({
    async receive({ name, strength, lot, quantity, expiresAt, receivedBy }) {
      const entry = { name, strength, lot, quantity, expiresAt, receivedBy };
      try {
        await client.createRecord(COLLECTION, entry);
      } catch {
        throw storeUnavailable();
      }
      return entry;
    },

    async adjust({ name, lot, kind, removed, reason, by, at }) {
      const entry = { name, lot, kind, removed, reason, by, at };
      try {
        await client.createRecord(ADJUSTMENTS, entry);
      } catch {
        throw storeUnavailable();
      }
      return entry;
    },

    async summary(now = new Date()) {
      try {
        // Thresholds come from the pharmacy settings; an unreadable setting falls back to the defaults.
        const limits = settings ? await settings.current().catch(() => null) : null;
        const lowOnHand = limits?.lowStock ?? DEFAULT_LOW_ON_HAND;
        const expiringDays = limits?.expiringDays ?? DEFAULT_EXPIRING_DAYS;
        const receipts = (await listRecords(client, COLLECTION))
          .filter(entry => typeof entry.name === "string" && typeof entry.lot === "string");

        const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
        const lots = new Map();
        for (const receipt of receipts) {
          const key = lotKey(receipt.name, receipt.lot);
          const existing = lots.get(key);
          const quantity = Number(receipt.quantity) || 0;
          if (existing) {
            existing.received += quantity;
          } else {
            lots.set(key, {
              name: receipt.name,
              strength: receipt.strength,
              lot: receipt.lot,
              expiresAt: receipt.expiresAt,
              received: quantity,
            });
          }
        }

        const dispensedByLot = new Map();
        for (const entry of await dispensing.list()) {
          if (!entry || entry.outcome !== "dispensed" || !Array.isArray(entry.items)) continue;
          for (const item of entry.items) {
            if (!item || typeof item.name !== "string" || typeof item.lot !== "string") continue;
            const key = lotKey(item.name, item.lot);
            dispensedByLot.set(key, (dispensedByLot.get(key) ?? 0) + (Number(item.quantity) || 0));
          }
        }

        const adjustedByLot = new Map();
        for (const entry of await listRecords(client, ADJUSTMENTS)) {
          if (typeof entry.name !== "string" || typeof entry.lot !== "string" || !Number.isInteger(entry.removed)) continue;
          const key = lotKey(entry.name, entry.lot);
          adjustedByLot.set(key, (adjustedByLot.get(key) ?? 0) + entry.removed);
        }

        const items = [...lots.values()].map(lot => {
          const dispensed = dispensedByLot.get(lotKey(lot.name, lot.lot)) ?? 0;
          const adjusted = adjustedByLot.get(lotKey(lot.name, lot.lot)) ?? 0;
          const onHand = lot.received - dispensed - adjusted;
          const expires = Date.parse(lot.expiresAt);
          let status;
          if (Number.isFinite(expires) && expires <= current) status = "expired";
          else if (onHand <= 0) status = "out";
          else if (Number.isFinite(expires) && expires - current <= expiringDays * DAY_MS) status = "expiring";
          else if (onHand <= lowOnHand) status = "low";
          else status = "ok";
          return {
            name: lot.name,
            strength: lot.strength,
            lot: lot.lot,
            expiresAt: lot.expiresAt,
            received: lot.received,
            dispensed,
            adjusted,
            onHand,
            status,
          };
        });

        return items.sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt)
          || a.name.localeCompare(b.name) || a.lot.localeCompare(b.lot));
      } catch (error) {
        if (error?.status === 503) throw error;
        throw storeUnavailable();
      }
    },
  });
}
