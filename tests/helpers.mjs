// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { createSign, generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { createApp } from "../server/app.mjs";
import { buildPharmacyData } from "../server/data.mjs";
import { createVerifier } from "../server/jwt.mjs";

export const ISSUER = "https://id.example.test/identity/realms/junctura";
export const CLIENT = "health-pharmacy-web";

export function makeSigner(kid = "k1") {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" };
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const sign = (claims = {}, { header = {}, key = privateKey } = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const body = { iss: ISSUER, azp: CLIENT, exp: now + 300, preferred_username: "duocsi.nhathuoc", ...claims };
    const head = encode({ alg: "RS256", typ: "JWT", kid, ...header });
    const input = `${head}.${encode(body)}`;
    return `${input}.${createSign("RSA-SHA256").update(input).sign(key).toString("base64url")}`;
  };
  return { jwk, sign, privateKey };
}

export const fixture = {
  accounts: {
    users: [
      { subject: "u-1", username: "duocsi.nhathuoc", displayName: "DS. Võ Thu Trang", role: "pharmacist", app: "junctura-pharmacy" },
      { subject: "u-2", username: "bacsi.benhvien", displayName: "BS. Phạm Minh Quang", role: "physician", app: "junctura-hospital" },
    ],
  },
};

/** Starts the real app on an ephemeral port with a fake identity provider key set. */
export async function startApp({ staticDir = "/nonexistent", capabilities } = {}) {
  const signer = makeSigner();
  const config = { issuer: ISSUER, webClientId: CLIENT, staticDir };
  const verifier = createVerifier({ issuer: ISSUER, clientId: CLIENT, getJson: async () => ({ keys: [signer.jwk] }) });
  const server = createServer(createApp({ config, data: buildPharmacyData(fixture), verifier, capabilities }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { signer, base, close: () => new Promise(resolve => server.close(resolve)) };
}
