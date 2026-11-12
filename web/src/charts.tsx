// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { DataTable, formatDate, formatNumber, type Column } from "@junctura/health-ui";
import type { ReactNode } from "react";
import type { ReportDay } from "./types";

const FRAME = "rounded-xl border border-line bg-surface p-4 shadow-card";

const TONES = {
  brand: "var(--jh-brand)",
  ok: "var(--jh-ok)",
  warn: "var(--jh-warn)",
  danger: "var(--jh-danger)",
  muted: "var(--jh-muted)",
} as const;

export type ChartTone = keyof typeof TONES;

const DAY_COLUMNS: Column<ReportDay>[] = [
  {
    key: "date",
    header: "Ngày",
    render: row => <time dateTime={row.date}>{formatDate(row.date)}</time>,
  },
  { key: "dispensed", header: "Đã phát", align: "right", render: row => formatNumber(row.dispensed) },
  { key: "refused", header: "Đã từ chối", align: "right", render: row => formatNumber(row.refused) },
];

function integerTicks(maxValue: number): { max: number; ticks: number[] } {
  const step = Math.max(1, Math.ceil(maxValue / 4));
  const max = step * 4;
  return { max, ticks: [0, step, step * 2, step * 3, max] };
}

function labelIndexes(count: number): number[] {
  if (count <= 8) return Array.from({ length: count }, (_, index) => index);
  return Array.from({ length: 7 }, (_, index) => Math.round((index * (count - 1)) / 6));
}

export function DailyBars({ days }: { days: ReportDay[] }) {
  if (days.length === 0) return null;

  const width = 720;
  const height = 280;
  const margin = { top: 14, right: 16, bottom: 34, left: 44 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const baseline = margin.top + plotHeight;
  const band = plotWidth / days.length;
  const barWidth = Math.max(3, Math.min(28, band * 0.66));
  const totalDispensed = days.reduce((sum, day) => sum + day.dispensed, 0);
  const totalRefused = days.reduce((sum, day) => sum + day.refused, 0);
  const { max, ticks } = integerTicks(Math.max(...days.map(day => day.dispensed + day.refused)));
  const shownLabels = labelIndexes(days.length);

  return (
    <div className={FRAME}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Biểu đồ cột theo ngày: ${formatNumber(totalDispensed)} đơn đã phát và ${formatNumber(totalRefused)} đơn từ chối trong ${days.length} ngày.`}
      >
        {ticks.map(tick => {
          const y = baseline - (tick / max) * plotHeight;
          return (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} stroke="var(--jh-line)" strokeWidth={1} />
              <text x={margin.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--jh-muted)">
                {formatNumber(tick)}
              </text>
            </g>
          );
        })}

        {days.map((day, index) => {
          const x = margin.left + index * band + (band - barWidth) / 2;
          const dispensedHeight = (day.dispensed / max) * plotHeight;
          const refusedHeight = (day.refused / max) * plotHeight;
          return (
            <g key={day.date} data-date={day.date}>
              <title>{`${formatDate(day.date)}: ${formatNumber(day.dispensed)} phát, ${formatNumber(day.refused)} từ chối`}</title>
              <rect
                x={x}
                y={baseline - dispensedHeight}
                width={barWidth}
                height={dispensedHeight}
                fill="var(--jh-brand)"
              />
              <rect
                x={x}
                y={baseline - dispensedHeight - refusedHeight}
                width={barWidth}
                height={refusedHeight}
                fill="var(--jh-danger)"
              />
            </g>
          );
        })}

        {shownLabels.map(index => {
          const day = days[index];
          return (
            <text
              key={day.date}
              x={margin.left + index * band + band / 2}
              y={baseline + 18}
              textAnchor="middle"
              fontSize={11}
              fill="var(--jh-muted)"
            >
              {formatDate(day.date).slice(0, 5)}
            </text>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-brand" />Đã phát
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-danger" />Đã từ chối
        </span>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-brand">Xem dạng bảng</summary>
        <div className="mt-3">
          <DataTable
            caption="Số đơn đã phát và từ chối theo ngày"
            columns={DAY_COLUMNS}
            rows={days}
            rowKey={row => row.date}
          />
        </div>
      </details>
    </div>
  );
}

export interface HorizontalBarItem {
  key: string;
  label: string;
  value: number;
  note?: string;
}

export function HorizontalBars({ items, ariaLabel, table, maxItems = 8, tone = "brand" }: {
  items: HorizontalBarItem[];
  ariaLabel: string;
  table: ReactNode;
  maxItems?: number;
  tone?: ChartTone;
}) {
  const shown = items.slice(0, maxItems);
  if (shown.length === 0) return null;
  const maxValue = Math.max(1, ...shown.map(item => item.value));

  // HTML bars (not SVG) so labels keep a readable font size in narrow columns.
  return (
    <div className={FRAME}>
      <ul role="img" aria-label={ariaLabel} className="space-y-3">
        {shown.map(item => {
          const percent = (Math.max(0, item.value) / maxValue) * 100;
          return (
            <li key={item.key} title={`${item.label}: ${formatNumber(item.value)}${item.note ? ` (${item.note})` : ""}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink-2">{item.label}</span>
                <span className="shrink-0 whitespace-nowrap tabular-nums text-muted">
                  <span className="font-medium text-ink">{formatNumber(item.value)}</span>
                  {item.note ? ` · ${item.note}` : ""}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-surface-2">
                <div
                  data-value={item.value}
                  data-percent={percent.toFixed(1)}
                  className="h-2 rounded-full"
                  style={{ width: `${percent}%`, background: TONES[tone] }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-brand">Xem dạng bảng</summary>
        <div className="mt-3">{table}</div>
      </details>
    </div>
  );
}
