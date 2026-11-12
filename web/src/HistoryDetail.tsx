// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AlertBanner, Button, Card, DataTable, EmptyState, PageHeader, formatDateTime, type Column,
} from "@junctura/health-ui";
import { ArrowLeft, Printer } from "lucide-react";
import { ApiError, getHistoryItem } from "./api";
import { ShortCode } from "./code";
import { navigate } from "./router";
import { Remote, useRemote, useSession } from "./session";
import type { DispensedItem, HistoryItem } from "./types";

const MEDICINE_COLUMNS: Column<DispensedItem>[] = [
  { key: "name", header: "Tên thuốc", render: drug => drug.name },
  { key: "strength", header: "Hàm lượng", render: drug => drug.strength },
  { key: "quantity", header: "Số lượng", align: "right", render: drug => drug.quantity },
  { key: "lot", header: "Lô", mono: true, render: drug => drug.lot },
];

const backToHistory = () => navigate("/lich-su");

function Sheet({ record }: { record: HistoryItem }) {
  const dispensed = record.outcome === "dispensed";

  return (
    <div className="print-sheet space-y-5">
      <PageHeader
        title={dispensed ? "Phiếu phát thuốc" : "Phiếu từ chối"}
        meta={dispensed ? "Phiếu xác nhận thuốc đã được phát cho người bệnh." : "Phiếu ghi nhận lý do từ chối phát thuốc."}
        actions={(
          <div className="no-print flex flex-wrap gap-2">
            <Button icon={<Printer aria-hidden className="size-4" />} onClick={() => window.print()}>In phiếu</Button>
            <Button variant="secondary" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={backToHistory}>Quay lại lịch sử</Button>
          </div>
        )}
      />

      <Card>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Mã đơn</dt>
            <dd className="mt-1"><ShortCode value={record.prescriptionCode} full /></dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Thời điểm</dt>
            <dd className="mt-1 text-ink"><time dateTime={record.at}>{formatDateTime(record.at)}</time></dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Dược sĩ</dt>
            <dd className="mt-1 text-ink">{record.pharmacist}</dd>
          </div>
        </dl>
      </Card>

      {dispensed ? (
        <div className="space-y-4">
          <DataTable
            caption="Thuốc đã phát"
            columns={MEDICINE_COLUMNS}
            rows={record.items ?? []}
            rowKey={drug => `${drug.name}-${drug.lot}`}
            empty={<p className="text-sm text-muted">Không có thuốc nào được ghi nhận.</p>}
          />
          {record.allergyOverride && (
            <AlertBanner level="warning" title="Lý do phát dù trùng dị ứng">
              {record.allergyOverride}
            </AlertBanner>
          )}
        </div>
      ) : (
        <Card title="Lý do từ chối">
          <p className="text-sm text-ink">{record.reason ?? "—"}</p>
        </Card>
      )}

      <p className="text-xs text-muted">Phát hành bởi Junctura Pharmacy · dữ liệu giả lập</p>
    </div>
  );
}

export function HistoryDetail({ id }: { id: string }) {
  const { settings } = useSession();
  const { state, reload } = useRemote<HistoryItem | null>(
    signal => getHistoryItem(settings, id, signal).catch(error => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }),
    [settings, id],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Remote state={state} reload={reload}>
        {record => record === null
          ? (
            <EmptyState
              title="Không tìm thấy phiếu này"
              action={<Button icon={<ArrowLeft aria-hidden className="size-4" />} onClick={backToHistory}>Quay lại lịch sử</Button>}
            >
              Phiếu có thể đã bị xoá hoặc đường dẫn không còn đúng.
            </EmptyState>
          )
          : <Sheet record={record} />}
      </Remote>
    </div>
  );
}
