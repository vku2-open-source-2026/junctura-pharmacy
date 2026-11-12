// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Badge, Button, DataTable, EmptyState, PageHeader, SegmentedControl, TextField, formatDateTime, type Column,
} from "@junctura/health-ui";
import { getHistory } from "./api";
import { ShortCode } from "./code";
import { navigate } from "./router";
import { fold } from "./search";
import { Remote, useRemote, useSession } from "./session";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import type { HistoryItem } from "./types";

type OutcomeFilter = "all" | "dispensed" | "refused";

const COLUMNS: Column<HistoryItem>[] = [
  {
    key: "at",
    header: "Thời gian",
    render: item => <time dateTime={item.at}>{formatDateTime(item.at)}</time>,
  },
  { key: "code", header: "Mã đơn", render: item => <ShortCode value={item.prescriptionCode} /> },
  {
    key: "outcome",
    header: "Kết quả",
    render: item => item.outcome === "dispensed"
      ? <Badge className="whitespace-nowrap" tone="ok">Đã phát</Badge>
      : <Badge className="whitespace-nowrap" tone="danger">Từ chối</Badge>,
  },
  {
    key: "detail",
    header: "Thuốc đã phát hoặc lý do",
    render: item => item.outcome === "dispensed"
      ? (item.items ?? []).map(drug => `${drug.name} ×${drug.quantity} (lô ${drug.lot})`).join("; ") || "—"
      : item.reason ?? "—",
  },
  { key: "pharmacist", header: "Dược sĩ", render: item => <span className="whitespace-nowrap">{item.pharmacistName ?? item.pharmacist}</span> },
  {
    key: "open",
    header: "Chi tiết",
    render: item => <Button variant="secondary" onClick={() => navigate(`/lich-su/${item.id}`)}>Xem</Button>,
  },
];

function matches(item: HistoryItem, filter: OutcomeFilter, query: string): boolean {
  const matchesOutcome = filter === "all" || item.outcome === filter;
  if (!matchesOutcome) return false;
  if (query === "") return true;
  return fold(item.prescriptionCode).includes(query)
    || (item.items ?? []).some(drug => fold(drug.name).includes(query));
}

export function History() {
  const { settings } = useSession();
  const { state, reload } = useRemote(signal => getHistory(settings, signal), [settings]);
  const [filter, setFilter] = useState<OutcomeFilter>("all");
  const [search, setSearch] = useState("");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Lịch sử" description="Các lần phát thuốc và từ chối tại nhà thuốc, mới nhất trước." />
      <Remote state={state} reload={reload}>
        {history => history.items.length === 0
          ? (
            <EmptyState
              title="Chưa có đơn nào được phát hay từ chối"
              action={<Button icon={<ArrowRight aria-hidden className="size-4" />} onClick={() => navigate("/")}>Đi tới Xác minh đơn</Button>}
            >
              Mỗi lần phát hoặc từ chối sẽ hiện ở đây sau khi bạn xác nhận.
            </EmptyState>
          )
          : (() => {
            const counts = {
              all: history.items.length,
              dispensed: history.items.filter(item => item.outcome === "dispensed").length,
              refused: history.items.filter(item => item.outcome === "refused").length,
            };
            const query = fold(search.trim());
            const rows = history.items.filter(item => matches(item, filter, query));

            return (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <TextField
                      label="Tìm theo mã đơn hoặc tên thuốc"
                      placeholder="Ví dụ: DT-2026-004521 hoặc clopidogrel"
                      maxLength={160}
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                    />
                  </div>
                  <SegmentedControl
                    label="Kết quả"
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: "all", label: "Tất cả", count: counts.all },
                      { value: "dispensed", label: "Đã phát", count: counts.dispensed },
                      { value: "refused", label: "Từ chối", count: counts.refused },
                    ]}
                  />
                </div>
                <DataTable
                  caption="Lịch sử phát thuốc"
                  columns={COLUMNS}
                  rows={rows}
                  rowKey={item => item.id}
                  empty={<p className="text-sm text-muted">Không có đơn phù hợp bộ lọc.</p>}
                />
              </div>
            );
          })()}
      </Remote>
    </div>
  );
}
