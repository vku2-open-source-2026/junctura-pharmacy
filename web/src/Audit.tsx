// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, DataTable, EmptyState, IdChip, PageHeader, formatDateTime, type Column, type Tone } from "@junctura/health-ui";
import { ArrowRight } from "lucide-react";
import { getAudit } from "./api";
import { navigate } from "./router";
import { Remote, useRemote, useSession } from "./session";
import type { AuditAction, AuditItem } from "./types";

const ACTION: Record<AuditAction, { label: string; tone: Tone }> = {
  verify: { label: "Xác minh", tone: "brand" },
  dispense: { label: "Phát thuốc", tone: "ok" },
  refuse: { label: "Từ chối", tone: "danger" },
  "stock-receive": { label: "Nhập kho", tone: "neutral" },
  "stock-adjust": { label: "Điều chỉnh kho", tone: "warn" },
};

const COLUMNS: Column<AuditItem>[] = [
  {
    key: "at",
    header: "Thời gian",
    render: item => <time dateTime={item.at}>{formatDateTime(item.at)}</time>,
  },
  {
    key: "by",
    header: "Người",
    render: item => (
      <span className="block text-sm">
        <span className="font-medium text-ink">{item.displayName}</span>
        <span className="block text-xs text-muted">{item.by}</span>
      </span>
    ),
  },
  {
    key: "action",
    header: "Thao tác",
    render: item => <Badge className="whitespace-nowrap" tone={ACTION[item.action]?.tone ?? "neutral"}>{ACTION[item.action]?.label ?? item.action}</Badge>,
  },
  { key: "prescriptionCode", header: "Mã đơn", render: item => item.prescriptionCode ? <IdChip value={item.prescriptionCode} /> : "—" },
  { key: "detail", header: "Chi tiết", render: item => item.detail || "—" },
];

export function Audit() {
  const { settings } = useSession();
  const { state, reload } = useRemote(signal => getAudit(settings, signal), [settings]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Nhật ký thao tác" description="Ai đã xác minh, phát, từ chối, nhập kho hay điều chỉnh kho, mới nhất trước." />
      <p className="text-sm text-muted">Nhật ký thao tác không lưu thông tin người bệnh.</p>
      <Remote state={state} reload={reload}>
        {audit => audit.items.length === 0
          ? (
            <EmptyState
              title="Chưa có thao tác nào được ghi"
              action={<Button icon={<ArrowRight aria-hidden className="size-4" />} onClick={() => navigate("/")}>Đi tới Xác minh đơn</Button>}
            >
              Mỗi lần xác minh, phát, từ chối hay điều chỉnh kho sẽ hiện ở đây.
            </EmptyState>
          )
          : <DataTable caption="Nhật ký thao tác của nhân viên" columns={COLUMNS} rows={audit.items} rowKey={item => `${item.action}-${item.by}-${item.at}`} />}
      </Remote>
    </div>
  );
}
