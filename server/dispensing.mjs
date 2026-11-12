// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { listRecords, storeUnavailable } from "./records.mjs";

const COLLECTION = "dispensations";

/** Persists dispensing and refusal entries in the Junctura record store. */
export function createDispensingStore({ client }) {
  return Object.freeze({
    async add(entry) {
      try {
        await client.createRecord(COLLECTION, entry);
      } catch {
        throw storeUnavailable();
      }
      return entry;
    },

    async list() {
      try {
        return (await listRecords(client, COLLECTION))
          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      } catch {
        throw storeUnavailable();
      }
    },
  });
}
