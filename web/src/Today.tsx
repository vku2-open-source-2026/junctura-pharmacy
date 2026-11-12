// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Badge, Button, Card, DataTable, EmptyState, ErrorState, IdChip, PageHeader, StatCard,
  formatDate, formatDateTime, formatNumber, type Column, type Tone,
} from "@junctura/health-ui";
import { ArrowRight } from "lucide-react";
import { getOverview } from "./api";
import { navigate } from "./router";
import { Remote, useRemote, useSession } from "./session";
import type { HistoryItem, StockStatus } from "./types";

const STATUS: Record<StockStatus, { label: string; tone: Tone }> = {
  ok: { label: "Còn hàng", tone: "ok" },
  low: { label: "Sắp hết", tone: "warn" },
  out: { label: "Hết hàng", tone: "danger" },
  expiring: { label: "Sắp hết hạn", tone: "warn" },
  expired: { label: "Đã hết hạn", tone: "danger" },
};

const RECENT_COLUMNS: Column<HistoryItem>[] = [
  {
    key: "at",
    header: "Thời gian",
    render: item => <time dateTime={item.at}>{formatDateTime(item.at)}</time>,
  },
  { key: "code", header: "Mã đơn", render: item => <IdChip value={item.prescriptionCode} /> },
  {
    key: "outcome",
    header: "Kết quả",
    render: item => item.outcome === "dispensed"
      ? <Badge tone="ok">Đã phát</Badge>
      : <Badge tone="danger">Từ chối</Badge>,
  },
  {
    key: "detail",
    header: "Chi tiết",
    render: item => item.outcome === "dispensed"
      ? (item.items ?? []).map(drug => `${drug.name} ×${drug.quantity} (lô ${drug.lot})`).join("; ") || "—"
      : item.reason ?? "—",
  },
];

const toKho = () => navigate("/kho");
const toHistory = () => navigate("/lich-su");
const toVerify = () => navigate("/");

export function Today() {
  const { settings, facility } = useSession();
  const { state, reload } = useRemote(signal => getOverview(settings, signal), [settings]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Hôm nay"
        description="Tình hình trong ngày của nhà thuốc, cập nhật theo giờ Việt Nam."
        meta={state.status === "ready" ? `${formatDate(state.data.date)} · ${facility}` : facility}
      />

      <Remote state={state} reload={reload}>
        {overview => (
          <div className="space-y-5">
            {overview.today ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard label="Đã xác minh" value={formatNumber(overview.today.verified)} />
                <StatCard label="Đã phát" value={formatNumber(overview.today.dispensed)} />
                <StatCard label="Đã từ chối" value={formatNumber(overview.today.refused)} />
                <StatCard label="Chưa có đồng thuận" value={formatNumber(overview.today.noConsent)} />
                <StatCard label="Phát dù trùng dị ứng" value={formatNumber(overview.today.allergyOverrides)} />
              </div>
            ) : (
              <ErrorState title="Chưa tải được số liệu hôm nay" onRetry={reload}>
                Số liệu xác minh và phát thuốc chưa sẵn sàng. Các phần khác vẫn xem được.
              </ErrorState>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <Card
                title="Kho cần chú ý"
                actions={<Button variant="secondary" icon={<ArrowRight aria-hidden className="size-4" />} onClick={toKho}>Mở kho</Button>}
              >
                {overview.stock ? (
                  overview.stock.attention.length === 0 ? (
                    <p className="text-sm text-muted">Kho không có lô cần chú ý</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {overview.stock.attention.map(item => (
                        <li key={`${item.name}-${item.lot}`} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                          <span className="text-sm">
                            <span className="font-medium text-ink">{item.name}</span>
                            <span className="text-muted"> · {item.strength} · lô {item.lot}</span>
                          </span>
                          <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>
                        </li>
                      ))}
                    </ul>
                  )
                ) : (
                  <ErrorState title="Chưa tải được kho" onRetry={reload}>
                    Tồn kho chưa sẵn sàng. Các phần khác vẫn xem được.
                  </ErrorState>
                )}
              </Card>

              <Card
                title="Gần đây"
                actions={<Button variant="secondary" icon={<ArrowRight aria-hidden className="size-4" />} onClick={toHistory}>Xem lịch sử</Button>}
              >
                {overview.recent ? (
                  overview.recent.length === 0 ? (
                    <EmptyState
                      title="Chưa có đơn nào được phát hay từ chối."
                      action={<Button icon={<ArrowRight aria-hidden className="size-4" />} onClick={toVerify}>Xác minh đơn</Button>}
                    >
                      Bắt đầu ở Xác minh đơn.
                    </EmptyState>
                  ) : (
                    <DataTable
                      caption="Đơn gần đây"
                      columns={RECENT_COLUMNS}
                      rows={overview.recent}
                      rowKey={item => `${item.prescriptionCode}-${item.at}`}
                    />
                  )
                ) : (
                  <ErrorState title="Chưa tải được lịch sử" onRetry={reload}>
                    Lịch sử phát thuốc chưa sẵn sàng. Các phần khác vẫn xem được.
                  </ErrorState>
                )}
              </Card>
            </div>
          </div>
        )}
      </Remote>
    </div>
  );
}
