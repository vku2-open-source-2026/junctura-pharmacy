// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { listRecords, storeUnavailable } from "./records.mjs";

const COLLECTION = "dispensations";

/** Persists dispensing and refusal entries in the Junctura record store. */
export function createDispensingStore({ client }) {
  return Object.freeze({
    async add(entry) {
      let record;
      try {
        record = await client.createRecord(COLLECTION, entry);
      } catch {
        throw storeUnavailable();
      }
      return typeof record?.id === "string" ? { ...entry, id: record.id } : entry;
    },

    /** One record by id, or null when it does not exist. */
    async get(id) {
      try {
        const record = await client.getRecord(COLLECTION, id);
        return record?.data && typeof record.data === "object" ? { ...record.data, id: record.id ?? id } : null;
      } catch (error) {
        if (error?.status === 404) return null;
        throw storeUnavailable();
      }
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
