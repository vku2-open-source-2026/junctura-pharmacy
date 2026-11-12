// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0

/** Error every store raises when the Junctura record store cannot be reached. */
export function storeUnavailable() {
  const error = new Error("store-unavailable");
  error.status = 503;
  error.code = "store-unavailable";
  return error;
}

/** Lists the record bodies of one collection with their record id (the record store returns at most 100). */
export async function listRecords(client, collection) {
  const response = await client.request(`/v2/data/${collection}`);
  if (response.ok === false) throw storeUnavailable();
  const body = await response.json();
  return (Array.isArray(body?.items) ? body.items : [])
    .filter(item => item?.data && typeof item.data === "object" && !Array.isArray(item.data))
    .map(item => (typeof item.id === "string" ? { ...item.data, id: item.id } : { ...item.data }));
}
