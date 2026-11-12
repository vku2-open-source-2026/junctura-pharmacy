// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { listRecords, storeUnavailable } from "./records.mjs";

const COLLECTION = "staff-actions";
export const ACTIONS = ["verify", "dispense", "refuse", "stock-receive"];

/**
 * Who did what in the pharmacy app and when. Unlike the call log (what the pharmacy asked
 * Junctura), this records staff actions. An entry never includes the patient, the
 * medicines' allergies or a refusal reason, only a short description.
 */
export function createStaffLog({ client }) {
  const pick = ({ action, by, displayName, prescriptionCode, detail, at }) => ({ action, by, displayName, prescriptionCode, detail, at });
  return Object.freeze({
    async add(entry) {
      const record = pick(entry);
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
          .filter(entry => ACTIONS.includes(entry.action))
          .map(pick)
          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      } catch {
        throw storeUnavailable();
      }
    },
  });
}
