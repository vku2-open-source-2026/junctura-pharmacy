// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, DataTable, EmptyState, PageHeader, formatDateTime, type Column, type Tone } from "@junctura/health-ui";
import { ArrowRight } from "lucide-react";
import { getCallLog } from "./api";
import { ShortCode } from "./code";
import { navigate } from "./router";
import { Remote, useRemote, useSession } from "./session";
import type { CallLogItem, CapabilityStatus } from "./types";

const CAPABILITY_LABEL: Record<string, string> = {
  "prescription-verify": "Xác minh đơn thuốc",
  "allergy-list": "Danh sách dị ứng",
};

const OUTCOME: Record<CapabilityStatus, { label: string; tone: Tone }> = {
  ok: { label: "Thành công", tone: "ok" },
  "no-consent": { label: "Chưa có đồng thuận", tone: "warn" },
  "not-authorized": { label: "Chưa được cấp quyền", tone: "warn" },
  unavailable: { label: "Không kết nối được", tone: "danger" },
  failed: { label: "Lỗi", tone: "danger" },
  "invalid-output": { label: "Lỗi", tone: "danger" },
};

const OUTCOME_RANK: Record<CapabilityStatus, number> = {
  ok: 0,
  "no-consent": 1,
  "not-authorized": 2,
  unavailable: 3,
  failed: 4,
  "invalid-output": 5,
};

export interface CallGroup {
  at: string;
  prescriptionCode?: string;
  pharmacist: string;
  pharmacistName?: string;
  calls: CallLogItem[];
  outcome: CapabilityStatus;
}

function worseOutcome(a: CapabilityStatus, b: CapabilityStatus): CapabilityStatus {
  return (OUTCOME_RANK[b] ?? 0) > (OUTCOME_RANK[a] ?? 0) ? b : a;
}

/**
 * Collapses the two calls of one verification (prescription and allergies) into a single
 * row. Only consecutive entries with the same prescription, pharmacist and at most a
 * minute apart are merged.
 */
export function groupCalls(items: CallLogItem[]): CallGroup[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const groups: CallGroup[] = [];

  for (const item of sorted) {
    const group = groups[groups.length - 1];
    const previous = group?.calls[group.calls.length - 1];
    const previousTime = previous ? Date.parse(previous.at) : Number.NaN;
    const itemTime = Date.parse(item.at);
    const close = Number.isFinite(previousTime) && Number.isFinite(itemTime)
      && Math.abs(previousTime - itemTime) <= 60_000;

    if (group && previous && item.prescriptionCode === group.prescriptionCode
      && item.pharmacist === group.pharmacist && close) {
      group.calls.push(item);
      group.outcome = worseOutcome(group.outcome, item.outcome);
      group.pharmacistName ??= item.pharmacistName;
      continue;
    }

    groups.push({
      at: item.at,
      prescriptionCode: item.prescriptionCode,
      pharmacist: item.pharmacist,
      pharmacistName: item.pharmacistName,
      calls: [item],
      outcome: item.outcome,
    });
  }

  return groups;
}

const COLUMNS: Column<CallGroup>[] = [
  {
    key: "at",
    header: "Thời gian",
    render: group => <time dateTime={group.at}>{formatDateTime(group.at)}</time>,
  },
  {
    key: "prescriptionCode",
    header: "Mã đơn",
    render: group => group.prescriptionCode ? <ShortCode value={group.prescriptionCode} /> : "—",
  },
  {
    key: "capabilities",
    header: "Dữ liệu đã hỏi",
    render: group => (
      <div className="flex flex-wrap gap-1.5">
        {group.calls.map((call, index) => {
          const outcome = OUTCOME[call.outcome] ?? { label: "Không rõ", tone: "neutral" as Tone };
          return (
            <Badge key={`${call.capability}-${call.at}-${index}`} tone={outcome.tone} title={outcome.label}>
              {CAPABILITY_LABEL[call.capability] ?? "Năng lực khác"}
            </Badge>
          );
        })}
      </div>
    ),
  },
  {
    key: "outcome",
    header: "Kết quả",
    render: group => {
      const outcome = OUTCOME[group.outcome] ?? { label: "Không rõ", tone: "neutral" as Tone };
      return <Badge className="whitespace-nowrap" tone={outcome.tone}>{outcome.label}</Badge>;
    },
  },
  { key: "pharmacist", header: "Dược sĩ", render: group => <span className="whitespace-nowrap">{group.pharmacistName ?? group.pharmacist}</span> },
];

export function CallLog() {
  const { settings } = useSession();
  const { state, reload } = useRemote(signal => getCallLog(settings, signal), [settings]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Nhật ký Junctura" description="Mỗi dòng là một lần nhà thuốc hỏi Junctura khi xác minh đơn, mới nhất trước." />
      <p className="text-sm text-muted">Nhật ký không lưu thông tin người bệnh.</p>
      <Remote state={state} reload={reload}>
        {log => log.items.length === 0
          ? (
            <EmptyState
              title="Chưa có lần gọi Junctura nào"
              action={<Button icon={<ArrowRight aria-hidden className="size-4" />} onClick={() => navigate("/")}>Đi tới Xác minh đơn</Button>}
            >
              Mỗi lần xác minh đơn sẽ được ghi ở đây.
            </EmptyState>
          )
          : (() => {
            const groups = groupCalls(log.items);
            return (
              <DataTable
                caption="Nhật ký gọi Junctura"
                columns={COLUMNS}
                rows={groups}
                rowKey={group => `${group.prescriptionCode ?? ""}-${group.at}-${group.pharmacist}`}
              />
            );
          })()}
      </Remote>
    </div>
  );
}
