// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionList, Badge, Button, ErrorState, PageHeader, Section, StatStrip, WorkspaceLayout,
  formatDate, type ActionItem,
} from "@junctura/health-ui";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { getOverview } from "./api";
import { ShortCode } from "./code";
import { navigate } from "./router";
import { Remote, useRemote, useSession } from "./session";
import type { HistoryItem, OverviewResult, StockItem, StockStatus } from "./types";

function lotsDetail(items: StockItem[], status: StockStatus): string | undefined {
  const lots = items.filter(item => item.status === status);
  if (lots.length === 0) return undefined;
  const shown = lots.slice(0, 3).map(item => `${item.name} ${item.strength} · lô ${item.lot}`);
  return lots.length > 3 ? `${shown.join("; ")} và ${lots.length - 3} lô khác` : shown.join("; ");
}

function actionsOf(overview: OverviewResult): ActionItem[] {
  const items: ActionItem[] = [];
  const stock = overview.stock;
  if (stock) {
    const { counts, attention } = stock;
    if (counts.expired > 0) {
      items.push({
        id: "expired", tone: "danger", title: `${counts.expired} lô đã hết hạn`,
        detail: lotsDetail(attention, "expired"), actionLabel: "Mở kho", onAction: () => navigate("/kho"),
      });
    }
    if (counts.out > 0) {
      items.push({
        id: "out", tone: "danger", title: `${counts.out} lô đã hết hàng`,
        detail: lotsDetail(attention, "out"), actionLabel: "Mở kho", onAction: () => navigate("/kho"),
      });
    }
    if (counts.expiring > 0) {
      items.push({
        id: "expiring", tone: "warn", title: `${counts.expiring} lô sắp hết hạn`,
        detail: lotsDetail(attention, "expiring"), actionLabel: "Mở kho", onAction: () => navigate("/kho"),
      });
    }
    if (counts.low > 0) {
      items.push({
        id: "low", tone: "warn", title: `${counts.low} lô sắp hết`,
        detail: lotsDetail(attention, "low"), actionLabel: "Mở kho", onAction: () => navigate("/kho"),
      });
    }
  }
  const noConsent = overview.today?.noConsent ?? 0;
  if (noConsent > 0) {
    items.push({
      id: "no-consent", tone: "brand", title: `${noConsent} đơn bị chặn vì chưa đồng thuận`,
      detail: "Người bệnh cần cho phép trong Sổ sức khỏe", actionLabel: "Xem nhật ký", onAction: () => navigate("/nhat-ky"),
    });
  }
  return items;
}

/** "HH:mm" for today (Vietnam time), "dd/MM HH:mm" for earlier days. */
function timeOf(at: string, today: string): string {
  const parsed = Date.parse(at);
  if (Number.isNaN(parsed)) return "—";
  const local = new Date(parsed + 7 * 36e5).toISOString();
  const clock = local.slice(11, 16);
  return local.slice(0, 10) === today ? clock : `${local.slice(8, 10)}/${local.slice(5, 7)} ${clock}`;
}

function recentDetail(item: HistoryItem): string {
  if (item.outcome === "refused") return item.reason ?? "—";
  return (item.items ?? []).map(drug => `${drug.name} ×${drug.quantity}`).join(", ") || "—";
}

export function Today() {
  const { settings, facility } = useSession();
  const { state, reload } = useRemote(signal => getOverview(settings, signal), [settings]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Hôm nay"
        description="Tình hình trong ngày của nhà thuốc, cập nhật theo giờ Việt Nam."
        meta={state.status === "ready" ? `${formatDate(state.data.date)} · ${facility}` : facility}
        actions={<Button icon={<ArrowRight aria-hidden className="size-4" />} onClick={() => navigate("/")}>Xác minh đơn</Button>}
      />

      <Remote state={state} reload={reload}>
        {overview => {
          const actions = actionsOf(overview);
          return (
            <div className="space-y-5">
              {overview.today ? (
                <StatStrip items={[
                  {
                    label: "Đã phát", value: overview.today.dispensed, icon: <CheckCircle2 aria-hidden className="size-4" />,
                    hint: `trong ${overview.today.verified} lượt xác minh`,
                  },
                  {
                    label: "Đã từ chối", value: overview.today.refused, icon: <XCircle aria-hidden className="size-4" />,
                    hint: "đơn không phát",
                  },
                  {
                    label: "Chưa có đồng thuận", value: overview.today.noConsent, icon: <ShieldAlert aria-hidden className="size-4" />,
                    hint: "người bệnh chưa cho phép", tone: overview.today.noConsent > 0 ? "warn" : "neutral",
                  },
                  {
                    label: "Phát dù trùng dị ứng", value: overview.today.allergyOverrides, icon: <AlertTriangle aria-hidden className="size-4" />,
                    hint: "đã ghi lý do", tone: overview.today.allergyOverrides > 0 ? "danger" : "neutral",
                  },
                ]} />
              ) : (
                <ErrorState title="Chưa tải được số liệu hôm nay" onRetry={reload}>
                  Số liệu xác minh và phát thuốc chưa sẵn sàng. Các phần khác vẫn xem được.
                </ErrorState>
              )}

              <WorkspaceLayout asideLabel="Gần đây" aside={(
                <Section
                  title="Gần đây"
                  actions={<Button variant="secondary" icon={<ArrowRight aria-hidden className="size-4" />} onClick={() => navigate("/lich-su")}>Xem lịch sử</Button>}
                >
                  {overview.recent === null ? (
                    <ErrorState title="Chưa tải được lịch sử" onRetry={reload}>
                      Lịch sử phát thuốc chưa sẵn sàng. Các phần khác vẫn xem được.
                    </ErrorState>
                  ) : overview.recent.length === 0 ? (
                    <p className="text-sm text-muted">Chưa có đơn nào được phát hay từ chối.</p>
                  ) : (
                    <ul aria-label="Đơn gần đây" className="divide-y divide-line rounded-lg border border-line bg-surface">
                      {overview.recent.map(item => (
                        <li key={`${item.id}-${item.at}`}>
                          <div
                            role="link"
                            tabIndex={0}
                            onClick={() => navigate(`/lich-su/${item.id}`)}
                            onKeyDown={event => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                navigate(`/lich-su/${item.id}`);
                              }
                            }}
                            className="cursor-pointer px-4 py-2.5 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                          >
                            <p className="flex flex-wrap items-center gap-1.5">
                              <time dateTime={item.at} className="tabular-nums text-sm text-muted">{timeOf(item.at, overview.date)}</time>
                              <span aria-hidden className="text-muted">·</span>
                              <ShortCode value={item.prescriptionCode} />
                              <span aria-hidden className="text-muted">·</span>
                              {item.outcome === "dispensed"
                                ? <Badge className="whitespace-nowrap" tone="ok">Đã phát</Badge>
                                : <Badge className="whitespace-nowrap" tone="danger">Từ chối</Badge>}
                            </p>
                            <p className="mt-0.5 truncate text-sm text-muted">{recentDetail(item)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}>
                <Section title="Cần xử lý" description="Việc nên làm trước trong ca trực này." count={actions.length}>
                  <div className="space-y-3">
                    <ActionList label="Việc cần xử lý" items={actions} empty="Không có việc tồn đọng." />
                    {!overview.stock && (
                      <ErrorState title="Chưa tải được kho" onRetry={reload}>
                        Tồn kho chưa sẵn sàng. Các phần khác vẫn xem được.
                      </ErrorState>
                    )}
                  </div>
                </Section>
              </WorkspaceLayout>
            </div>
          );
        }}
      </Remote>
    </div>
  );
}
