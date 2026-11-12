// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AlertBanner, Button, Card, DataTable, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, TextField,
  formatDate, formatNumber, type Column,
} from "@junctura/health-ui";
import { Download } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, downloadReportCsv, getReport } from "./api";
import { useSession } from "./session";
import type { ReportDay, ReportMedicine, ReportRefusalReason, ReportResult } from "./types";

const INVALID_RANGE = "Khoảng ngày không hợp lệ (tối đa 92 ngày)";

const DAY_COLUMNS: Column<ReportDay>[] = [
  {
    key: "date",
    header: "Ngày",
    render: row => <time dateTime={row.date}>{formatDate(row.date)}</time>,
  },
  { key: "dispensed", header: "Đã phát", align: "right", render: row => formatNumber(row.dispensed) },
  { key: "refused", header: "Đã từ chối", align: "right", render: row => formatNumber(row.refused) },
];

const MEDICINE_COLUMNS: Column<ReportMedicine>[] = [
  { key: "name", header: "Tên thuốc", render: row => row.name },
  { key: "strength", header: "Hàm lượng", render: row => row.strength || "—" },
  { key: "quantity", header: "Số lượng", align: "right", render: row => formatNumber(row.quantity) },
  { key: "prescriptions", header: "Số đơn", align: "right", render: row => formatNumber(row.prescriptions) },
];

const REASON_COLUMNS: Column<ReportRefusalReason>[] = [
  { key: "reason", header: "Lý do", render: row => row.reason },
  { key: "count", header: "Số lần", align: "right", render: row => formatNumber(row.count) },
];

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: ReportResult }
  | { kind: "invalid" }
  | { kind: "error"; forbidden: boolean };

type Range = { from?: string; to?: string };

export function Reports() {
  const { settings, expire } = useSession();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState<Range>({});
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const initialized = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getReport(settings, range.from, range.to).then(
      data => {
        if (cancelled) return;
        setState({ kind: "ready", data });
        if (!initialized.current) {
          initialized.current = true;
          setFrom(data.from);
          setTo(data.to);
        }
      },
      error => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) return expire();
        if (error instanceof ApiError && error.status === 400) return setState({ kind: "invalid" });
        setState({ kind: "error", forbidden: error instanceof ApiError && error.status === 403 });
      },
    );
    return () => { cancelled = true; };
  }, [settings, range, attempt, expire]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setDownloadError(null);
    setRange({ from: from || undefined, to: to || undefined });
  };

  const download = async () => {
    if (downloading || !from || !to) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await downloadReportCsv(settings, from, to);
      if (typeof URL.createObjectURL !== "function") return;
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `bao-cao-nha-thuoc-${from}-${to}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return expire();
      setDownloadError(error instanceof ApiError && error.status === 400
        ? INVALID_RANGE
        : "Không tải được tệp CSV. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Báo cáo"
        description="Số liệu phát thuốc và từ chối theo khoảng ngày, tính theo giờ Việt Nam."
        actions={(
          <Button
            type="button"
            variant="secondary"
            icon={<Download aria-hidden className="size-4" />}
            loading={downloading}
            onClick={download}
          >
            Tải CSV
          </Button>
        )}
      />

      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submit}>
        <div className="flex-1">
          <TextField
            label="Từ ngày"
            type="date"
            value={from}
            onChange={event => setFrom(event.target.value)}
          />
        </div>
        <div className="flex-1">
          <TextField
            label="Đến ngày"
            type="date"
            value={to}
            onChange={event => setTo(event.target.value)}
          />
        </div>
        <Button type="submit">Xem</Button>
      </form>

      {downloadError && <p role="alert" className="text-sm font-medium text-danger">{downloadError}</p>}

      {state.kind === "loading" && <Skeleton lines={6} />}

      {state.kind === "invalid" && (
        <AlertBanner level="critical" title={INVALID_RANGE}>
          Chọn khoảng ngày ngắn hơn rồi bấm Xem.
        </AlertBanner>
      )}

      {state.kind === "error" && (
        state.forbidden
          ? <ErrorState title="Tài khoản này không phải dược sĩ">Liên hệ quản trị Junctura để được cấp quyền xem báo cáo.</ErrorState>
          : <ErrorState onRetry={() => setAttempt(value => value + 1)}>
              Không tải được báo cáo từ máy chủ Nhà thuốc. Kiểm tra kết nối rồi thử lại.
            </ErrorState>
      )}

      {state.kind === "ready" && (() => {
        const report = state.data;
        const days = report.perDay.filter(row => row.dispensed !== 0 || row.refused !== 0);
        return (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard label="Đã phát" value={formatNumber(report.totals.dispensed)} />
              <StatCard label="Đã từ chối" value={formatNumber(report.totals.refused)} />
              <StatCard label="Tỷ lệ từ chối (%)" value={`${formatNumber(report.totals.refusalRate)}%`} />
              <StatCard label="Phát dù trùng dị ứng" value={formatNumber(report.totals.allergyOverrides)} />
              <StatCard label="Bị chặn vì chưa đồng thuận" value={formatNumber(report.totals.noConsent)} />
            </div>

            <Card title="Theo ngày">
              {days.length === 0
                ? <EmptyState title="Không có đơn nào trong khoảng ngày này" />
                : (
                  <DataTable
                    caption="Số đơn đã phát và từ chối theo ngày"
                    columns={DAY_COLUMNS}
                    rows={days}
                    rowKey={row => row.date}
                  />
                )}
              <p className="mt-3 text-xs text-muted">Các ngày không có đơn được ẩn</p>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Thuốc đã phát">
                {report.medicines.length === 0 ? (
                  <EmptyState title="Chưa phát thuốc nào trong khoảng này" />
                ) : (
                  <DataTable
                    caption="Thuốc đã phát theo tên và hàm lượng"
                    columns={MEDICINE_COLUMNS}
                    rows={report.medicines}
                    rowKey={row => `${row.name}-${row.strength}`}
                  />
                )}
              </Card>

              <Card title="Lý do từ chối">
                {report.refusalReasons.length === 0 ? (
                  <EmptyState title="Chưa có đơn nào bị từ chối" />
                ) : (
                  <DataTable
                    caption="Số lần theo lý do từ chối"
                    columns={REASON_COLUMNS}
                    rows={report.refusalReasons}
                    rowKey={row => row.reason}
                  />
                )}
              </Card>
            </div>

            <p className="text-xs text-muted">Báo cáo chỉ có số đếm, không có thông tin người bệnh.</p>
          </div>
        );
      })()}
    </div>
  );
}
