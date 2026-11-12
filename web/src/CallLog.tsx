// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, DataTable, EmptyState, PageHeader, formatDateTime, type Column, type Tone } from "@junctura/health-ui";
import { getCallLog } from "./api";
import { Remote, useRemote, useSession } from "./session";
import type { CallLogItem, CapabilityStatus } from "./types";

const CAPABILITY_LABEL: Record<string, string> = {
  "prescription-verify": "Xác minh đơn thuốc",
  "allergy-list": "Danh sách dị ứng",
};

const PURPOSE_LABEL: Record<string, string> = { dispensing: "Phát thuốc" };

const OUTCOME: Record<CapabilityStatus, { label: string; tone: Tone }> = {
  ok: { label: "Thành công", tone: "ok" },
  "no-consent": { label: "Chưa có đồng thuận", tone: "warn" },
  "not-authorized": { label: "Chưa được cấp quyền", tone: "warn" },
  unavailable: { label: "Không kết nối được", tone: "danger" },
  failed: { label: "Lỗi", tone: "danger" },
  "invalid-output": { label: "Lỗi", tone: "danger" },
};

const COLUMNS: Column<CallLogItem>[] = [
  {
    key: "at",
    header: "Thời gian",
    render: item => <time dateTime={item.at}>{formatDateTime(item.at)}</time>,
  },
  {
    key: "capability",
    header: "Năng lực",
    render: item => CAPABILITY_LABEL[item.capability] ?? "Năng lực khác",
  },
  {
    key: "purpose",
    header: "Mục đích",
    render: item => PURPOSE_LABEL[item.purpose] ?? "Không rõ",
  },
  {
    key: "outcome",
    header: "Kết quả",
    render: item => <Badge tone={OUTCOME[item.outcome]?.tone ?? "neutral"}>{OUTCOME[item.outcome]?.label ?? "Không rõ"}</Badge>,
  },
  { key: "prescriptionCode", header: "Mã đơn", mono: true, render: item => item.prescriptionCode ?? "—" },
  { key: "pharmacist", header: "Dược sĩ", render: item => item.pharmacist },
];

export function CallLog() {
  const { settings } = useSession();
  const { state, reload } = useRemote(signal => getCallLog(settings, signal), [settings]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Nhật ký" description="Các lần nhà thuốc gọi Junctura, mới nhất trước." />
      <p className="text-sm text-muted">Nhật ký không lưu thông tin người bệnh.</p>
      <Remote state={state} reload={reload}>
        {log => log.items.length === 0
          ? <EmptyState title="Chưa có nhật ký">Các lần nhà thuốc gọi Junctura sẽ hiện ở đây sau khi xác minh hoặc phát thuốc.</EmptyState>
          : <DataTable caption="Nhật ký gọi Junctura" columns={COLUMNS} rows={log.items} rowKey={item => `${item.capability}-${item.at}`} />}
      </Remote>
    </div>
  );
}
