// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createJuncturaClient } from "@junctura/server-client";
import { loadConfig } from "../server/config.mjs";
import { createDispensingStore } from "../server/dispensing.mjs";
import { createStock } from "../server/stock.mjs";

const DAY_MS = 86_400_000;

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
if (!config.junctura) {
  console.error("Junctura is not configured: set JUNCTURA_URL, JUNCTURA_APP_CLIENT_ID and JUNCTURA_APP_CLIENT_SECRET.");
  process.exit(1);
}

const catalogPath = resolve(config.healthDir, "seed/catalog.mjs");
if (!existsSync(catalogPath)) {
  console.error(`Cannot find the Junctura Health catalog at ${catalogPath}. Clone junctura-health next to this repository or set JUNCTURA_HEALTH_DIR.`);
  process.exit(1);
}
const { HOSPITAL_DRUGS } = await import(pathToFileURL(catalogPath).href);

const now = new Date();
const day = days => new Date(now.getTime() + days * DAY_MS).toISOString().slice(0, 10);

const client = createJuncturaClient({
  baseUrl: config.junctura.url,
  clientId: config.junctura.clientId,
  clientSecret: config.junctura.clientSecret,
});
const dispensing = createDispensingStore({ client });
const stock = createStock({ client, dispensing });

const lots = HOSPITAL_DRUGS.flatMap((drug, index) => {
  const number = String(index + 1).padStart(2, "0");
  return [
    {
      name: drug.name,
      strength: drug.strength,
      lot: `LOT-${number}-A`,
      quantity: index < 3 ? 20 - index * 5 : 60 + index * 10,
      expiresAt: day(365 + index * 30),
    },
    {
      name: drug.name,
      strength: drug.strength,
      lot: `LOT-${number}-B`,
      quantity: 90 + index * 10,
      expiresAt: index === 1 ? day(60) : day(540 + index * 30),
    },
  ];
});

const existing = new Set((await stock.summary()).map(lot => `${lot.name}\u0000${lot.lot}`));
let loaded = 0;
for (const lot of lots) {
  if (existing.has(`${lot.name}\u0000${lot.lot}`)) continue;
  await stock.receive({ ...lot, receivedBy: "seed" });
  loaded++;
}
console.log(`Đã nạp ${loaded} lô thuốc vào kho.`);
