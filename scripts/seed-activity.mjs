// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
// Loads about 30 days of SYNTHETIC pharmacy activity (dispensing, refusals, Junctura calls,
// staff actions, one disposal) into the Junctura record store, so the today, report, history
// and log screens have something to show. Prescription codes DT-2026-1000xx are made up and do
// not match any prescription a provider knows. Runs once: a second run changes nothing.
//
//   npm run seed:stock      # first, the stock lots used here
//   npm run seed:activity
import { createJuncturaClient } from "@junctura/server-client";
import { createCallLog } from "../server/call-log.mjs";
import { loadConfig } from "../server/config.mjs";
import { loadPharmacyData } from "../server/data.mjs";
import { createDispensingStore } from "../server/dispensing.mjs";
import { createStaffLog } from "../server/staff-log.mjs";
import { createStock } from "../server/stock.mjs";

const DAY = 86_400_000;
const VIETNAM = 7 * 3_600_000;
const REASONS = ["Đơn thiếu chữ ký bác sĩ", "Người bệnh muốn đổi sang thuốc khác", "Hết thuốc trong kho, hẹn quay lại", "Liều trên đơn không rõ, cần xác nhận lại"];

// Deterministic pseudo-random numbers so every run plans the same activity.
let state = 20261112;
const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
const pick = list => list[Math.floor(random() * list.length)];

const config = loadConfig();
if (!config.junctura) throw new Error("Junctura is not configured: run npm run demo:setup in junctura-health first");
const client = createJuncturaClient({ baseUrl: config.junctura.url, clientId: config.junctura.clientId, clientSecret: config.junctura.clientSecret });
const dispensing = createDispensingStore({ client });
const callLog = createCallLog({ client });
const staffLog = createStaffLog({ client });
const stock = createStock({ client, dispensing });

if ((await dispensing.list()).some(entry => entry.simulated)) {
  console.log("Đã có dữ liệu giả lập, không nạp lại.");
  process.exit(0);
}
const lots = (await stock.summary()).filter(lot => lot.status !== "expired" && lot.onHand > 10);
if (!lots.length) throw new Error("Kho chưa có lô thuốc: chạy npm run seed:stock trước");
const pharmacist = [...(await loadPharmacyData({ healthDir: config.healthDir })).staff.values()][0];
const budget = new Map(lots.map(lot => [`${lot.name}\u0000${lot.lot}`, Math.floor(lot.onHand * 0.3)]));

// 20 dispensed, 4 refused and 4 blocked for missing consent, spread over the last 30 days
// (two of them today) at working hours in Vietnam time.
const today = Math.floor((Date.now() + VIETNAM) / DAY);
const kinds = [...Array(20).fill("dispensed"), ...Array(4).fill("refused"), ...Array(4).fill("no-consent")];
const events = kinds.map((kind, index) => {
  const day = index < 2 ? today : today - 1 - Math.floor(random() * 29);
  const minutes = 7 * 60 + Math.floor(random() * 12 * 60);
  return { kind, at: new Date(day * DAY - VIETNAM + minutes * 60_000) };
}).sort((a, b) => a.at - b.at);

const log = (action, prescriptionCode, detail, at) =>
  staffLog.add({ action, by: pharmacist.username, displayName: pharmacist.displayName, prescriptionCode, detail, at: at.toISOString() });
const calls = (prescriptionCode, outcome, at) => Promise.all(["prescription-verify", "allergy-list"].map(capability =>
  callLog.add({ capability, purpose: "dispensing", outcome, prescriptionCode, pharmacist: pharmacist.username, at: at.toISOString() })));

let sequence = 0;
let overrides = 0;
const counts = { dispensed: 0, refused: 0, "no-consent": 0 };
for (const event of events) {
  const prescriptionCode = `DT-2026-1000${String(++sequence).padStart(2, "0")}`;
  const verifiedAt = new Date(event.at.getTime() - 60_000);
  if (event.kind === "no-consent") {
    await calls(prescriptionCode, "no-consent", verifiedAt);
    await log("verify", prescriptionCode, "Đơn chưa phát được", verifiedAt);
  } else if (event.kind === "refused") {
    await calls(prescriptionCode, "ok", verifiedAt);
    await log("verify", prescriptionCode, "Đơn phát được", verifiedAt);
    await dispensing.add({ prescriptionCode, outcome: "refused", reason: pick(REASONS), pharmacist: pharmacist.username, at: event.at.toISOString(), simulated: true });
    await log("refuse", prescriptionCode, "Từ chối phát", event.at);
  } else {
    const items = [];
    for (const lot of [pick(lots), pick(lots)]) {
      const key = `${lot.name}\u0000${lot.lot}`;
      const quantity = Math.min(budget.get(key), 1 + Math.floor(random() * 14));
      if (quantity < 1 || items.some(item => item.name === lot.name)) continue;
      budget.set(key, budget.get(key) - quantity);
      items.push({ name: lot.name, strength: lot.strength, quantity, lot: lot.lot });
    }
    if (!items.length) continue;
    const allergyOverride = overrides === 0 && sequence > 5 ? "Bác sĩ kê đơn đã xác nhận qua điện thoại (giả lập)" : undefined;
    if (allergyOverride) overrides++;
    await calls(prescriptionCode, "ok", verifiedAt);
    await log("verify", prescriptionCode, "Đơn phát được", verifiedAt);
    await dispensing.add({ prescriptionCode, outcome: "dispensed", items, ...(allergyOverride && { allergyOverride }), pharmacist: pharmacist.username, at: event.at.toISOString(), simulated: true });
    await log("dispense", prescriptionCode, `${items.length} thuốc${allergyOverride ? " · có ghi lý do vì trùng dị ứng" : ""}`, event.at);
  }
  counts[event.kind]++;
}

// One disposal of a damaged box, a few days ago.
const damaged = lots[0];
const disposedAt = new Date((today - 3) * DAY - VIETNAM + 15 * 3_600_000);
await stock.adjust({ name: damaged.name, lot: damaged.lot, kind: "dispose", removed: 2, reason: "Hộp móp méo khi nhận hàng (giả lập)", by: pharmacist.username, at: disposedAt.toISOString() });
await log("stock-adjust", undefined, `Xuất hủy 2 ${damaged.name} · lô ${damaged.lot}`, disposedAt);

console.log(`Đã nạp dữ liệu giả lập: ${counts.dispensed} lần phát, ${counts.refused} lần từ chối, ${counts["no-consent"]} lần bị chặn vì chưa đồng thuận, 1 lần xuất hủy.`);
