// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { JuncturaError } from "@junctura/server-client";
import { checkContext, getContract, validateValue } from "@junctura/health-contracts";

const UNAVAILABLE_STATUSES = new Set([0, 404, 502, 503, 504]);

function failure(error) {
  if (error instanceof JuncturaError || (error && typeof error.status === "number")) {
    const status = error.status;
    const code = typeof error.code === "string" ? error.code : "";
    const reason = code || error.message || "request_failed";
    if (status === 403) {
      return code.toLowerCase().includes("consent") ? { status: "no-consent" } : { status: "not-authorized", reason };
    }
    if (UNAVAILABLE_STATUSES.has(status)) return { status: "unavailable", reason };
    return { status: "failed", reason };
  }
  return { status: "failed", reason: error instanceof Error ? error.message : "request_failed" };
}

/**
 * Server-side caller for the capability providers of the other Junctura Health apps.
 * Every result is a value, never a thrown error, so an API route can map it directly.
 */
export function createCapabilityCaller({ client, now = () => new Date() }) {
  const references = new Map();

  async function findReference(slug, contract) {
    let cursor;
    while (true) {
      const page = await client.discover(cursor === undefined ? {} : { cursor });
      for (const item of page?.items ?? []) {
        if (item?.state !== "published" || item.version !== contract.version) continue;
        const capabilityId = item.manifest?.capabilityId;
        if (typeof capabilityId !== "string" || !capabilityId.endsWith(`:${slug}`)) continue;
        if (typeof item.digest !== "string") continue;
        const reference = { capabilityId, version: item.version, manifestDigest: item.digest };
        references.set(slug, reference);
        return reference;
      }
      cursor = page?.nextCursor;
      if (!cursor) return null;
    }
  }

  async function targetFor(slug, contract) {
    return references.get(slug) ?? findReference(slug, contract);
  }

  async function executeOnce(reference, input, context) {
    return client.execute({ kind: "capability", capability: reference }, input, undefined, context);
  }

  async function call(slug, input, { purpose, dataSubject } = {}) {
    let contract;
    try {
      contract = getContract(slug);
    } catch {
      return { status: "unavailable", reason: "capability_not_found" };
    }
    const decision = checkContext(contract, { purpose, dataSubject });
    if (!decision.allowed) return { status: "not-authorized", reason: decision.reason };

    const context = { purpose, dataSubject };
    try {
      let reference = await targetFor(slug, contract);
      if (!reference) return { status: "unavailable", reason: "capability_not_found" };

      let execution;
      try {
        execution = await executeOnce(reference, input, context);
      } catch (error) {
        if (!(error instanceof JuncturaError) || error.status !== 404) return failure(error);
        references.delete(slug);
        reference = await findReference(slug, contract);
        if (!reference) return { status: "unavailable", reason: "capability_not_found" };
        try {
          execution = await executeOnce(reference, input, context);
        } catch (retryError) {
          return failure(retryError);
        }
      }

      let result;
      try {
        result = await client.waitForExecution(execution.executionId, { timeoutMs: 10000 });
      } catch (error) {
        return failure(error);
      }
      if (result.state !== "succeeded") return { status: "failed", reason: result.state };
      if (validateValue(contract.outputSchema, result.output).length > 0) return { status: "invalid-output" };
      return { status: "ok", output: result.output, receivedAt: now().toISOString() };
    } catch (error) {
      return failure(error);
    }
  }

  return Object.freeze({ call });
}
