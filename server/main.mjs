// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { createServer } from "node:http";
import { createApp } from "./app.mjs";
import { loadConfig } from "./config.mjs";
import { loadPharmacyData } from "./data.mjs";
import { createVerifier } from "./jwt.mjs";

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const data = await loadPharmacyData({ healthDir: config.healthDir }).catch(error => {
  console.error(`Cannot load the demo accounts from ${config.healthDir}: ${error.message}\nClone junctura-health next to this repository or set JUNCTURA_HEALTH_DIR.`);
  process.exit(1);
});
const portFlag = process.argv.indexOf("--port");
if (portFlag !== -1) config = Object.freeze({ ...config, port: Number(process.argv[portFlag + 1]) });
const verifier = createVerifier({ issuer: config.issuer, clientId: config.webClientId });

const server = createServer(createApp({ config, data, verifier }));
server.listen(config.port, config.host, () => {
  console.log(`Junctura Pharmacy (${data.facility}) listening on http://${config.host}:${server.address().port}`);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
