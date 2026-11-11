// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, buildLogoutUrl, createPkce } from "./auth";
import { formatDate } from "./format";

const settings = { issuer: "https://id.example.test/identity/realms/junctura", clientId: "health-pharmacy-web" };

describe("PKCE", () => {
  it("derives the S256 challenge from the verifier", async () => {
    const { verifier, challenge, state } = await createPkce();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const expected = Buffer.from(digest).toString("base64url");
    expect(challenge).toBe(expected);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(state).not.toBe(verifier);
  });

  it("never repeats a verifier", async () => {
    expect((await createPkce()).verifier).not.toBe((await createPkce()).verifier);
  });
});

describe("authorize and logout URLs", () => {
  it("asks the identity provider for a code with PKCE", () => {
    const url = new URL(buildAuthorizeUrl(settings, "http://localhost:5184/", { challenge: "abc", state: "xyz" }));
    expect(url.origin + url.pathname).toBe(`${settings.issuer}/protocol/openid-connect/auth`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "health-pharmacy-web", redirect_uri: "http://localhost:5184/", response_type: "code", scope: "openid",
      code_challenge: "abc", code_challenge_method: "S256", state: "xyz",
    });
  });

  it("returns to the app after sign-out", () => {
    const url = new URL(buildLogoutUrl(settings, "http://localhost:5184/", "id-token"));
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe("http://localhost:5184/");
    expect(url.searchParams.get("id_token_hint")).toBe("id-token");
    expect(new URL(buildLogoutUrl(settings, "http://localhost:5184/")).searchParams.has("id_token_hint")).toBe(false);
  });
});

describe("formatting", () => {
  it("formats dates for Vietnamese staff", () => {
    expect(formatDate("2026-10-28")).toBe("28/10/2026");
    expect(formatDate("2026-10-28T09:15:00.000Z")).toBe("28/10/2026");
    expect(formatDate(null)).toBe("—");
  });
});
