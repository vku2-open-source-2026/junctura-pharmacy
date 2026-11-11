// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0

const MAX_PRESCRIPTION_CODE_LENGTH = 32;
const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isLowercaseUuid = value => typeof value === "string" && LOWERCASE_UUID.test(value);

export const isValidPrescriptionCode = value => typeof value === "string"
  && !value.includes("|")
  && [...value].length >= 1
  && [...value].length <= MAX_PRESCRIPTION_CODE_LENGTH;

/**
 * Temporary QR convention for pharmacy prescriptions: `JH1|RX|<prescriptionCode>|<subject>`.
 * It will move to a shared parser in @junctura/health-contracts once that package has one.
 */
export function parsePrescriptionQr(text) {
  if (typeof text !== "string") return null;
  const parts = text.split("|");
  if (parts.length !== 4 || parts[0] !== "JH1" || parts[1] !== "RX") return null;
  const [, , prescriptionCode, subject] = parts;
  if (!isValidPrescriptionCode(prescriptionCode) || !isLowercaseUuid(subject)) return null;
  return { prescriptionCode, patient: subject };
}
