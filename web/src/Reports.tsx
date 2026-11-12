// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AlertBanner, Button, DataTable, EmptyState, ErrorState, PageHeader, Section, Skeleton, StatStrip, TextField,
  formatNumber, type Column,
} from "@junctura/health-ui";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, downloadReportCsv, getReport } from "./api";
import { DailyBars, HorizontalBars, type HorizontalBarItem } from "./charts";
import { useSession } from "./session";
import type { ReportMedicine, ReportRefusalReason, ReportResult } from "./types";

const INVALID_RANGE = "Khoảng ngày không hợp lệ (tối đa 92 ngày)";

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

function todayInVietnam(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") =>
    Number(parts.find(item => item.type === type)?.value ?? 0);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

function formatUtcDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function quickRange(days: number): { from: string; to: string } {
  const end = todayInVietnam();
  const start = new Date(end.getTime());
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: formatUtcDate(start), to: formatUtcDate(end) };
}

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

  const changeFrom = (value: string) => {
    setFrom(value);
    setDownloadError(null);
    setRange({ from: value || undefined, to: to || undefined });
  };

  const changeTo = (value: string) => {
    setTo(value);
    setDownloadError(null);
    setRange({ from: from || undefined, to: value || undefined });
  };

  const applyQuickRange = (days: number) => {
    const next = quickRange(days);
    setFrom(next.from);
    setTo(next.to);
    setDownloadError(null);
    setRange(next);
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <TextField
            label="Từ ngày"
            type="date"
            value={from}
            onChange={event => changeFrom(event.target.value)}
          />
        </div>
        <div className="flex-1">
          <TextField
            label="Đến ngày"
            type="date"
            value={to}
            onChange={event => changeTo(event.target.value)}
          />
        </div>
        <div role="group" aria-label="Chọn nhanh khoảng ngày" className="flex flex-wrap gap-2">
          {[7, 30, 90].map(days => (
            <Button key={days} type="button" variant="secondary" onClick={() => applyQuickRange(days)}>
              {days} ngày
            </Button>
          ))}
        </div>
      </div>

      {downloadError && <p role="alert" className="text-sm font-medium text-danger">{downloadError}</p>}

      {state.kind === "loading" && <Skeleton lines={6} />}

      {state.kind === "invalid" && (
        <AlertBanner level="critical" title={INVALID_RANGE}>
          Chọn khoảng ngày ngắn hơn rồi thử lại.
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
        const hasActivity = report.perDay.some(day => day.dispensed !== 0 || day.refused !== 0);
        const medicines = [...report.medicines].sort((a, b) => b.quantity - a.quantity);
        const reasons = [...report.refusalReasons].sort((a, b) => b.count - a.count);
        const medicineBars: HorizontalBarItem[] = medicines.map(medicine => ({
          key: `${medicine.name}-${medicine.strength}`,
          label: medicine.strength ? `${medicine.name} · ${medicine.strength}` : medicine.name,
          value: medicine.quantity,
          note: `${formatNumber(medicine.prescriptions)} đơn`,
        }));
        const reasonBars: HorizontalBarItem[] = reasons.map(reason => ({
          key: reason.reason,
          label: reason.reason,
          value: reason.count,
        }));

        return (
          <div className="space-y-6">
            <StatStrip items={[
              { label: "Đã phát", value: formatNumber(report.totals.dispensed), hint: "số đơn", tone: "ok" },
              {
                label: "Đã từ chối",
                value: formatNumber(report.totals.refused),
                hint: `tỷ lệ ${formatNumber(report.totals.refusalRate)}%`,
                tone: "warn",
              },
              {
                label: "Phát dù trùng dị ứng",
                value: formatNumber(report.totals.allergyOverrides),
                hint: "đã ghi lý do",
                tone: "warn",
              },
              {
                label: "Bị chặn vì chưa đồng thuận",
                value: formatNumber(report.totals.noConsent),
                hint: "người bệnh chưa cho phép",
                tone: "danger",
              },
            ]} />

            <Section title="Theo ngày" description="Mỗi cột là một ngày trong khoảng đã chọn.">
              {hasActivity
                ? <DailyBars days={report.perDay} />
                : <EmptyState title="Không có đơn nào trong khoảng ngày này" />}
            </Section>

            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Thuốc phát nhiều nhất">
                {medicines.length === 0 ? (
                  <EmptyState title="Chưa phát thuốc nào trong khoảng này" />
                ) : (
                  <HorizontalBars
                    items={medicineBars}
                    ariaLabel="Thuốc phát nhiều nhất theo số lượng"
                    tone="ok"
                    table={(
                      <DataTable
                        caption="Thuốc đã phát theo tên và hàm lượng"
                        columns={MEDICINE_COLUMNS}
                        rows={medicines}
                        rowKey={row => `${row.name}-${row.strength}`}
                      />
                    )}
                  />
                )}
              </Section>

              <Section title="Lý do từ chối">
                {reasons.length === 0 ? (
                  <EmptyState title="Chưa có đơn nào bị từ chối" />
                ) : (
                  <HorizontalBars
                    items={reasonBars}
                    ariaLabel="Số lần từ chối theo lý do"
                    tone="warn"
                    table={(
                      <DataTable
                        caption="Số lần theo lý do từ chối"
                        columns={REASON_COLUMNS}
                        rows={reasons}
                        rowKey={row => row.reason}
                      />
                    )}
                  />
                )}
              </Section>
            </div>

            <p className="text-xs text-muted">Báo cáo chỉ có số đếm, không có thông tin người bệnh.</p>
          </div>
        );
      })()}
    </div>
  );
}
