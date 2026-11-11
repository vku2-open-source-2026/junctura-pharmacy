// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PHARMACY_APP = "junctura-pharmacy";
const FACILITY = "Nhà thuốc";

/**
 * Loads only the pharmacy staff list from a junctura-health checkout. Patient data is
 * never read from a seed: the pharmacy receives it through Junctura.
 */
export async function loadPharmacyData({ healthDir }) {
  const accounts = JSON.parse(readFileSync(resolve(healthDir, "seed/data/accounts.json"), "utf8"));
  return buildPharmacyData({ accounts });
}

export function buildPharmacyData({ accounts }) {
  // Staff are matched by username, which stays stable even if the identity provider re-issues subjects.
  const staff = new Map(accounts.users.filter(user => user.app === PHARMACY_APP).map(user => [user.username, user]));
  return { facility: FACILITY, staff };
}
