// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, DataTable, EmptyState, PageHeader, formatDateTime, type Column } from "@junctura/health-ui";
import { getHistory } from "./api";
import { Remote, useRemote, useSession } from "./session";
import type { HistoryItem } from "./types";

const COLUMNS: Column<HistoryItem>[] = [
  {
    key: "at",
    header: "Thời gian",
    render: item => <time dateTime={item.at}>{formatDateTime(item.at)}</time>,
  },
  { key: "code", header: "Mã đơn", mono: true, render: item => item.prescriptionCode },
  {
    key: "outcome",
    header: "Kết quả",
    render: item => item.outcome === "dispensed"
      ? <Badge tone="ok">Đã phát</Badge>
      : <Badge tone="danger">Từ chối</Badge>,
  },
  {
    key: "detail",
    header: "Thuốc đã phát hoặc lý do",
    render: item => item.outcome === "dispensed"
      ? (item.items ?? []).map(drug => `${drug.name} ×${drug.quantity} (lô ${drug.lot})`).join("; ") || "—"
      : item.reason ?? "—",
  },
  { key: "pharmacist", header: "Dược sĩ", render: item => item.pharmacist },
];

export function History() {
  const { settings } = useSession();
  const { state, reload } = useRemote(signal => getHistory(settings, signal), [settings]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Lịch sử" description="Các lần phát thuốc và từ chối tại nhà thuốc, mới nhất trước." />
      <Remote state={state} reload={reload}>
        {history => history.items.length === 0
          ? <EmptyState title="Chưa có lịch sử">Các lần phát thuốc và từ chối sẽ hiện ở đây sau khi bạn xác nhận.</EmptyState>
          : <DataTable caption="Lịch sử phát thuốc" columns={COLUMNS} rows={history.items} rowKey={item => `${item.prescriptionCode}-${item.at}`} />}
      </Remote>
    </div>
  );
}
