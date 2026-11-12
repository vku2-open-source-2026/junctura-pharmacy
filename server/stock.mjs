// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { listRecords, storeUnavailable } from "./records.mjs";

const COLLECTION = "stock-receipts";
const DAY_MS = 86_400_000;
const LOW_ON_HAND = 20;
const EXPIRING_DAYS = 60;

const lotKey = (name, lot) => `${name}\u0000${lot}`;

/**
 * Read-only ledger of stock receipts: the Junctura record store only appends, so
 * on-hand stock is the receipts of a lot minus the lots already dispensed.
 */
export function createStock({ client, dispensing }) {
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

    async summary(now = new Date()) {
      try {
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

        const items = [...lots.values()].map(lot => {
          const dispensed = dispensedByLot.get(lotKey(lot.name, lot.lot)) ?? 0;
          const onHand = lot.received - dispensed;
          const expires = Date.parse(lot.expiresAt);
          let status;
          if (Number.isFinite(expires) && expires <= current) status = "expired";
          else if (onHand <= 0) status = "out";
          else if (Number.isFinite(expires) && expires - current <= EXPIRING_DAYS * DAY_MS) status = "expiring";
          else if (onHand <= LOW_ON_HAND) status = "low";
          else status = "ok";
          return {
            name: lot.name,
            strength: lot.strength,
            lot: lot.lot,
            expiresAt: lot.expiresAt,
            received: lot.received,
            dispensed,
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
