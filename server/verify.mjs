// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0

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
