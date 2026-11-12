// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { listRecords, storeUnavailable } from "./records.mjs";

const COLLECTION = "call-log";

/**
 * Records the capabilities this pharmacy calls through Junctura. An entry never
 * includes patient, prescription item or allergy data, only the call metadata.
 */
export function createCallLog({ client }) {
  return Object.freeze({
    async add(entry = {}) {
      const record = {
        capability: entry.capability,
        purpose: entry.purpose,
        outcome: entry.outcome,
        prescriptionCode: entry.prescriptionCode,
        pharmacist: entry.pharmacist,
        at: entry.at,
      };
      try {
        await client.createRecord(COLLECTION, record);
      } catch {
        throw storeUnavailable();
      }
      return record;
    },

    async list() {
      try {
        return (await listRecords(client, COLLECTION))
          .filter(entry => typeof entry.capability === "string")
          .map(({ capability, purpose, outcome, prescriptionCode, pharmacist, at }) => ({
            capability, purpose, outcome, prescriptionCode, pharmacist, at,
          }))
          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      } catch {
        throw storeUnavailable();
      }
    },
  });
}
