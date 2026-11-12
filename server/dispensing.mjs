// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0

const COLLECTION = "dispensations";

function storeUnavailable() {
  const error = new Error("store-unavailable");
  error.status = 503;
  error.code = "store-unavailable";
  return error;
}

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
        const response = await client.request(`/v2/data/${COLLECTION}`);
        if (response.ok === false) throw storeUnavailable();
        const body = await response.json();
        const items = Array.isArray(body?.items) ? body.items : [];
        return items
          .map(item => item?.data)
          .filter(entry => entry && typeof entry === "object" && !Array.isArray(entry))
          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      } catch {
        throw storeUnavailable();
      }
    },
  });
}
