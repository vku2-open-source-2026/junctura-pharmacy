// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { JuncturaError } from "@junctura/server-client";
import { getContract } from "@junctura/health-contracts";
import { createCapabilityCaller } from "../server/junctura.mjs";

const PROVIDER = "00000000-0000-0000-0000-000000000001";
const context = { purpose: "dispensing", dataSubject: "patient-1" };
const input = { prescriptionCode: "RX-100" };
const output = {
  valid: true,
  issuedAt: "2026-01-01T08:00:00.000Z",
  expiresAt: "2026-02-01T08:00:00.000Z",
  items: [{ name: "Amoxicillin", strength: "500 mg", quantity: 21, instructions: "3 lần mỗi ngày" }],
  dispensed: false,
};

function reference(slug) {
  return {
    state: "published",
    version: getContract(slug).version,
    digest: `sha256:${slug}`,
    manifest: { capabilityId: `urn:junctura:capability:${PROVIDER}:${slug}` },
  };
}

function fakeClient({ pages = () => ({ items: [reference("prescription-verify"), reference("allergy-list")], nextCursor: null }), execute, wait } = {}) {
  const calls = { discover: [], execute: [], wait: [] };
  return {
    calls,
    async discover(query = {}) {
      calls.discover.push(query);
      return pages(query);
    },
    async execute(target, value, idempotencyKey, executionContext) {
      calls.execute.push({ target, value, idempotencyKey, context: executionContext });
      return execute ? execute(calls.execute.length) : { executionId: "exec-1", state: "accepted" };
    },
    async waitForExecution(executionId, options) {
      calls.wait.push({ executionId, options });
      return wait ? wait(calls.wait.length) : { executionId, state: "succeeded", output };
    },
  };
}

test("a successful call returns the validated output and its receipt time", async () => {
  const client = fakeClient();
  const caller = createCapabilityCaller({ client, now: () => new Date("2026-03-04T05:06:07.000Z") });
  const result = await caller.call("prescription-verify", input, context);

  assert.deepEqual(result, { status: "ok", output, receivedAt: "2026-03-04T05:06:07.000Z" });
  assert.deepEqual(client.calls.execute[0].target, {
    kind: "capability",
    capability: {
      capabilityId: `urn:junctura:capability:${PROVIDER}:prescription-verify`,
      version: getContract("prescription-verify").version,
      manifestDigest: "sha256:prescription-verify",
    },
  });
  assert.deepEqual(client.calls.execute[0].context, context);
  assert.deepEqual(client.calls.wait[0].options, { timeoutMs: 10000 });
});

test("output that does not match the contract schema is rejected", async () => {
  const client = fakeClient({ wait: () => ({ executionId: "exec-1", state: "succeeded", output: { valid: true } }) });
  const result = await createCapabilityCaller({ client }).call("prescription-verify", input, context);
  assert.deepEqual(result, { status: "invalid-output" });
});

test("a consent refusal from Junctura is reported as no-consent", async () => {
  const client = fakeClient({ execute: () => { throw new JuncturaError(403, "consent_required"); } });
  const result = await createCapabilityCaller({ client }).call("allergy-list", {}, context);
  assert.deepEqual(result, { status: "no-consent" });
});

test("other 403 refusals are reported as not-authorized with the Junctura code", async () => {
  const client = fakeClient({ execute: () => { throw new JuncturaError(403, "grant_missing"); } });
  const result = await createCapabilityCaller({ client }).call("allergy-list", {}, context);
  assert.deepEqual(result, { status: "not-authorized", reason: "grant_missing" });
});

test("a disconnected gateway is reported as unavailable", async () => {
  const client = fakeClient({ execute: () => { throw new JuncturaError(0, "gateway_unavailable"); } });
  const result = await createCapabilityCaller({ client }).call("allergy-list", {}, context);
  assert.deepEqual(result, { status: "unavailable", reason: "gateway_unavailable" });
});

test("a published capability that is absent from discover is unavailable without executing", async () => {
  const client = fakeClient({
    pages: () => ({
      items: [
        { ...reference("prescription-verify"), state: "draft" },
        { ...reference("prescription-verify"), version: "9.9.9" },
        { ...reference("allergy-list"), manifest: { capabilityId: `urn:junctura:capability:${PROVIDER}:not-prescription-verify` } },
      ],
      nextCursor: null,
    }),
  });
  const result = await createCapabilityCaller({ client }).call("prescription-verify", input, context);
  assert.deepEqual(result, { status: "unavailable", reason: "capability_not_found" });
  assert.equal(client.calls.execute.length, 0);
});

test("discover follows nextCursor and caches the published reference", async () => {
  const client = fakeClient({
    pages: query => query.cursor === "page-2"
      ? { items: [reference("prescription-verify")], nextCursor: null }
      : { items: [reference("allergy-list")], nextCursor: "page-2" },
  });
  const caller = createCapabilityCaller({ client });

  assert.equal((await caller.call("prescription-verify", input, context)).status, "ok");
  assert.deepEqual(client.calls.discover, [{}, { cursor: "page-2" }]);

  assert.equal((await caller.call("prescription-verify", input, context)).status, "ok");
  assert.equal(client.calls.discover.length, 2, "the discovered reference is reused from memory");
  assert.equal(client.calls.execute.length, 2);
});

test("a 404 on execute clears the cache and retries exactly once", async () => {
  const client = fakeClient({
    execute: attempt => {
      if (attempt === 1) throw new JuncturaError(404, "capability_not_found");
      return { executionId: "exec-2", state: "accepted" };
    },
  });
  const result = await createCapabilityCaller({ client }).call("prescription-verify", input, context);

  assert.equal(result.status, "ok");
  assert.equal(client.calls.execute.length, 2);
  assert.equal(client.calls.discover.length, 2, "the stale cached reference is rediscovered once");
});

test("a second 404 after the retry is unavailable and is not retried again", async () => {
  const client = fakeClient({ execute: () => { throw new JuncturaError(404, "capability_not_found"); } });
  const result = await createCapabilityCaller({ client }).call("prescription-verify", input, context);

  assert.deepEqual(result, { status: "unavailable", reason: "capability_not_found" });
  assert.equal(client.calls.execute.length, 2);
  assert.equal(client.calls.discover.length, 2);
});

test("a missing dataSubject is refused before any network call", async () => {
  const client = fakeClient();
  const caller = createCapabilityCaller({ client });
  const result = await caller.call("allergy-list", {}, { purpose: "dispensing" });

  assert.deepEqual(result, { status: "not-authorized", reason: "data_subject_required" });
  assert.equal(client.calls.discover.length + client.calls.execute.length + client.calls.wait.length, 0);
});

test("an unsupported purpose is refused before any network call", async () => {
  const client = fakeClient();
  const result = await createCapabilityCaller({ client }).call("prescription-verify", input, { purpose: "treatment", dataSubject: "patient-1" });
  assert.deepEqual(result, { status: "not-authorized", reason: "purpose_not_allowed" });
  assert.equal(client.calls.discover.length, 0);
});
