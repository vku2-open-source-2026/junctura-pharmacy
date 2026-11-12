// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * A small safety net for the demo, NOT a drug-interaction database: it flags medicines
 * on a prescription that share a name or a well-known allergy class with an allergy the
 * patient has on record. The pharmacist still decides; the list only makes the risk
 * visible and forces a written reason before dispensing.
 */

/** Allergen (folded) -> medicine name fragments (folded) of the same class. */
const CLASSES = new Map([
  ["penicillin", ["penicillin", "amoxicillin", "ampicillin", "oxacillin", "cloxacillin", "piperacillin"]],
  ["sulfamid", ["sulfamethoxazol", "cotrimoxazol", "sulfadiazin", "sulfasalazin"]],
  ["aspirin", ["aspirin", "acid acetylsalicylic", "ibuprofen", "diclofenac", "naproxen", "meloxicam", "ketoprofen"]],
  ["ibuprofen", ["ibuprofen", "aspirin", "diclofenac", "naproxen", "meloxicam", "ketoprofen"]],
]);

/** Folds case and Vietnamese diacritics so "Sulfamid" matches "sulfamid". */
export const fold = text => String(text ?? "").normalize("NFD").replace(/\p{M}/gu, "")
  .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();

/**
 * Returns `{ medicine, allergen, severity }` for every prescribed medicine that matches a
 * recorded allergy, either by name or through the class table above.
 */
export function findAllergyConflicts(items = [], allergies = []) {
  const conflicts = [];
  for (const item of items) {
    const medicine = fold(item?.name);
    if (medicine.length < 3) continue;
    for (const allergy of allergies) {
      const allergen = fold(allergy?.substance);
      if (allergen.length < 3) continue;
      const fragments = CLASSES.get(allergen) ?? [allergen];
      const sameName = medicine.includes(allergen) || allergen.includes(medicine);
      if (sameName || fragments.some(fragment => medicine.includes(fragment))) {
        conflicts.push({ medicine: item.name, allergen: allergy.substance, severity: allergy.severity });
      }
    }
  }
  return conflicts;
}
