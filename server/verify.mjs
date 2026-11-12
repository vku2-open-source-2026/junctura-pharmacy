// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { findAllergyConflicts } from "./allergy-check.mjs";

/**
 * Calls both capabilities for one prescription and returns the verification result
 * the API and the dispensing route share.
 */
export async function runVerification({ capabilities, prescriptionCode, patient, now = new Date() }) {
  const context = { purpose: "dispensing", dataSubject: patient };
  const [prescription, allergies] = await Promise.all([
    capabilities.call("prescription-verify", { prescriptionCode }, context),
    capabilities.call("allergy-list", {}, context),
  ]);
  const value = typeof now === "function" ? now() : now;
  const checkedAt = value instanceof Date ? value : new Date(value);
  const { dispensable, blockers } = computeDispensable(prescription, allergies, checkedAt);
  const allergyConflicts = prescription.status === "ok" && allergies.status === "ok"
    ? findAllergyConflicts(prescription.output?.items, allergies.output?.allergies)
    : [];
  return {
    prescriptionCode,
    patient,
    checkedAt: checkedAt.toISOString(),
    prescription,
    allergies,
    dispensable,
    blockers,
    allergyConflicts,
  };
}

/**
 * Pure dispensing decision for one verification result. Allergies never block
 * dispensing: the pharmacist decides, but an unknown allergy state is reported.
 */
export function computeDispensable(prescription, allergies = {}, now = new Date()) {
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const blockers = [];
  let dispensable = true;

  if (!prescription || prescription.status !== "ok") {
    dispensable = false;
    blockers.push("prescription-unavailable");
  } else {
    const output = prescription.output;
    if (!output || output.valid !== true) {
      dispensable = false;
      blockers.push("invalid");
    }
    const expiresAt = output ? new Date(output.expiresAt).getTime() : Number.NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= current) {
      dispensable = false;
      blockers.push("expired");
    }
    if (!output || output.dispensed !== false) {
      dispensable = false;
      blockers.push("already-dispensed");
    }
  }

  // Allergies are shown to the pharmacist but never withhold a prescription;
  // an unknown allergy state is still reported alongside the decision.
  if (!allergies || allergies.status !== "ok") blockers.push("allergies-unknown");

  return { dispensable, blockers };
}
