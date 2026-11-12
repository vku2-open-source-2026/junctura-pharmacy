// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AlertBanner, Badge, Button, DataTable, Dialog, EmptyState, PageHeader, SelectField, StatCard, Tabs,
  TextAreaField, TextField, formatDate, formatNumber, type Column, type Tone,
} from "@junctura/health-ui";
import { PackagePlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError, adjustStock, getStock, receiveStock } from "./api";
import { Remote, useRemote, useSession } from "./session";
import type { AdjustStockInput, ReceiveStockInput, StockItem, StockStatus } from "./types";

const STATUS: Record<StockStatus, { label: string; tone: Tone }> = {
  ok: { label: "Còn hàng", tone: "ok" },
  low: { label: "Sắp hết", tone: "warn" },
  out: { label: "Hết hàng", tone: "danger" },
  expiring: { label: "Sắp hết hạn", tone: "warn" },
  expired: { label: "Đã hết hạn", tone: "danger" },
};

const STATUS_RANK: Record<StockStatus, number> = { ok: 0, low: 1, expiring: 2, out: 3, expired: 4 };

type StatusFilter = "all" | "attention" | StockStatus;

const FILTER_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "attention", label: "Cần chú ý" },
  { value: "ok", label: STATUS.ok.label },
  { value: "low", label: STATUS.low.label },
  { value: "out", label: STATUS.out.label },
  { value: "expiring", label: STATUS.expiring.label },
  { value: "expired", label: STATUS.expired.label },
];

type View = "lots" | "medicines";
type AdjustKind = "dispose" | "count";
type AdjustTarget = { item: StockItem; kind: AdjustKind };
type AdjustErrors = { value?: string; reason?: string };

interface StockGroup {
  name: string;
  strength: string;
  onHand: number;
  lots: number;
  expiresAt: string;
  status: StockStatus;
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

function matchesStatus(status: StockStatus, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return status !== "ok";
  return status === filter;
}

function groupStock(items: StockItem[]): StockGroup[] {
  const groups = new Map<string, StockGroup>();
  for (const item of items) {
    const key = `${item.name}\u0000${item.strength}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        name: item.name,
        strength: item.strength,
        onHand: item.onHand,
        lots: 1,
        expiresAt: item.expiresAt,
        status: item.status,
      });
      continue;
    }
    existing.onHand += item.onHand;
    existing.lots += 1;
    if (Date.parse(item.expiresAt) < Date.parse(existing.expiresAt)) existing.expiresAt = item.expiresAt;
    if (STATUS_RANK[item.status] > STATUS_RANK[existing.status]) existing.status = item.status;
  }
  return [...groups.values()].sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt)
    || a.name.localeCompare(b.name) || a.strength.localeCompare(b.strength));
}

function formatDifference(value: number): string {
  if (value > 0) return `+${formatNumber(value)}`;
  if (value < 0) return `−${formatNumber(Math.abs(value))}`;
  return "0";
}

type FormState = { name: string; strength: string; lot: string; quantity: string; expiresAt: string };
type FieldErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = { name: "", strength: "", lot: "", quantity: "", expiresAt: "" };

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validate(form: FormState): { errors: FieldErrors; input?: ReceiveStockInput } {
  const name = form.name.trim();
  const strength = form.strength.trim();
  const lot = form.lot.trim();
  const quantity = Number(form.quantity);
  const errors: FieldErrors = {};

  if (name.length < 1 || name.length > 160) errors.name = "Tên thuốc cần từ 1 đến 160 ký tự.";
  if (strength.length < 1 || strength.length > 80) errors.strength = "Hàm lượng cần từ 1 đến 80 ký tự.";
  if (lot.length < 1 || lot.length > 40) errors.lot = "Số lô cần từ 1 đến 40 ký tự.";
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100_000) {
    errors.quantity = "Số lượng phải là số nguyên từ 1 đến 100.000.";
  }
  if (!isValidDate(form.expiresAt)) errors.expiresAt = "Chọn hạn dùng hợp lệ.";

  if (Object.keys(errors).length > 0) return { errors };
  return { errors, input: { name, strength, lot, quantity, expiresAt: form.expiresAt } };
}

function validateAdjust(target: AdjustTarget, rawValue: string, rawReason: string): {
  errors: AdjustErrors;
  input?: AdjustStockInput;
} {
  const errors: AdjustErrors = {};
  const reason = rawReason.trim();
  const value = Number(rawValue);

  if (target.kind === "dispose") {
    if (!Number.isInteger(value) || value < 1 || value > target.item.onHand) {
      errors.value = `Số lượng phải là số nguyên từ 1 đến ${formatNumber(target.item.onHand)}.`;
    }
  } else if (!Number.isInteger(value) || value < 0 || value > 100_000) {
    errors.value = "Số đếm thực tế phải là số nguyên từ 0 đến 100.000.";
  }
  if ([...reason].length < 3 || [...reason].length > 200) errors.reason = "Lý do cần từ 3 đến 200 ký tự.";

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    input: target.kind === "dispose"
      ? { name: target.item.name, lot: target.item.lot, kind: "dispose", quantity: value, reason }
      : { name: target.item.name, lot: target.item.lot, kind: "count", counted: value, reason },
  };
}

function saveError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return "Thông tin lô chưa hợp lệ. Kiểm tra lại các trường rồi thử lại.";
    if (error.status === 403) return "Tài khoản này không phải dược sĩ nên không nhập được lô.";
    if (error.status === 503) return "Kho chưa sẵn sàng. Thử lại sau.";
  }
  return "Không lưu được lô thuốc. Kiểm tra kết nối rồi thử lại.";
}

function adjustError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return "Thông tin điều chỉnh chưa hợp lệ. Kiểm tra số lượng và lý do rồi thử lại.";
    if (error.status === 403) return "Tài khoản này không phải dược sĩ nên không điều chỉnh được kho.";
    if (error.status === 404) return "Không tìm thấy lô này trong kho. Tải lại trang rồi thử lại.";
    if (error.status === 409) return "Số lượng vượt quá tồn kho hiện tại của lô. Giảm số lượng rồi thử lại.";
    if (error.status === 503) return "Kho chưa sẵn sàng. Thử lại sau.";
  }
  return "Không lưu được điều chỉnh kho. Kiểm tra kết nối rồi thử lại.";
}

export function Stock() {
  const { settings, expire } = useSession();
  const { state, reload } = useRemote(signal => getStock(settings, signal), [settings]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("lots");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [adjust, setAdjust] = useState<AdjustTarget | null>(null);
  const [adjustValue, setAdjustValue] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustErrors, setAdjustErrors] = useState<AdjustErrors>({});
  const [adjustFormError, setAdjustFormError] = useState<string | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);

  const openDialog = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setFormError(null);
    setOpen(true);
  };

  const change = (field: keyof FormState) => (event: { target: { value: string } }) => {
    setForm(current => ({ ...current, [field]: event.target.value }));
    setErrors(current => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = validate(form);
    setErrors(result.errors);
    if (!result.input) return;

    setBusy(true);
    setFormError(null);
    try {
      await receiveStock(settings, result.input);
      setOpen(false);
      setForm(EMPTY_FORM);
      setErrors({});
      reload();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expire();
      setFormError(saveError(error));
    } finally {
      setBusy(false);
    }
  };

  const openAdjust = (item: StockItem, kind: AdjustKind) => {
    setAdjust({ item, kind });
    setAdjustValue("");
    setAdjustReason("");
    setAdjustErrors({});
    setAdjustFormError(null);
  };

  const submitAdjust = async (event: FormEvent) => {
    event.preventDefault();
    if (!adjust) return;
    const result = validateAdjust(adjust, adjustValue, adjustReason);
    setAdjustErrors(result.errors);
    if (!result.input) return;

    setAdjustBusy(true);
    setAdjustFormError(null);
    try {
      await adjustStock(settings, result.input);
      setAdjust(null);
      setAdjustValue("");
      setAdjustReason("");
      reload();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expire();
      setAdjustFormError(adjustError(error));
    } finally {
      setAdjustBusy(false);
    }
  };

  const query = fold(search.trim());

  const lotColumns: Column<StockItem>[] = [
    { key: "name", header: "Tên thuốc", render: item => item.name },
    { key: "strength", header: "Hàm lượng", render: item => item.strength },
    { key: "lot", header: "Số lô", mono: true, render: item => item.lot },
    { key: "expiresAt", header: "Hạn dùng", render: item => <time dateTime={item.expiresAt}>{formatDate(item.expiresAt)}</time> },
    {
      key: "onHand",
      header: "Tồn / đã nhập",
      align: "right",
      render: item => `${formatNumber(item.onHand)} / ${formatNumber(item.received)}`,
    },
    {
      key: "adjusted",
      header: "Điều chỉnh",
      align: "right",
      render: item => (item.adjusted === 0 ? "—" : formatNumber(item.adjusted)),
    },
    {
      key: "status",
      header: "Trạng thái",
      render: item => <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>,
    },
    {
      key: "actions",
      header: "Thao tác",
      render: item => (
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" variant="secondary" className="min-h-7 px-2 py-1 text-xs" onClick={() => openAdjust(item, "dispose")}>
            Xuất hủy
          </Button>
          <Button type="button" variant="secondary" className="min-h-7 px-2 py-1 text-xs" onClick={() => openAdjust(item, "count")}>
            Kiểm kê
          </Button>
        </div>
      ),
    },
  ];

  const groupColumns: Column<StockGroup>[] = [
    { key: "name", header: "Tên thuốc", render: group => group.name },
    { key: "strength", header: "Hàm lượng", render: group => group.strength },
    { key: "onHand", header: "Tổng tồn", align: "right", render: group => formatNumber(group.onHand) },
    { key: "lots", header: "Số lô", align: "right", render: group => formatNumber(group.lots) },
    {
      key: "expiresAt",
      header: "Hạn sớm nhất",
      render: group => <time dateTime={group.expiresAt}>{formatDate(group.expiresAt)}</time>,
    },
    {
      key: "status",
      header: "Trạng thái",
      render: group => <Badge tone={STATUS[group.status].tone}>{STATUS[group.status].label}</Badge>,
    },
  ];

  const counted = Number(adjustValue);
  const countedValid = adjustValue.trim() !== "" && Number.isInteger(counted) && counted >= 0;
  const countSummary = adjust
    ? `Sổ: ${formatNumber(adjust.item.onHand)} · Thực tế: ${countedValid ? formatNumber(counted) : "—"} · Chênh: ${
      countedValid ? formatDifference(counted - adjust.item.onHand) : "—"}`
    : "";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Kho"
        description="Lô thuốc, số lượng tồn và hạn dùng tại nhà thuốc, lô gần hết hạn trước."
        actions={<Button type="button" icon={<PackagePlus aria-hidden className="size-4" />} onClick={openDialog}>Nhập lô</Button>}
      />

      <Remote state={state} reload={reload}>
        {stock => {
          const groups = groupStock(stock.items);
          const filteredLots = stock.items.filter(item => {
            const matchesSearch = query === ""
              || fold(item.name).includes(query)
              || fold(item.lot).includes(query);
            return matchesSearch && matchesStatus(item.status, statusFilter);
          });
          const filteredGroups = groups.filter(group => {
            const lots = stock.items.filter(item => item.name === group.name && item.strength === group.strength);
            const matchesSearch = query === ""
              || fold(group.name).includes(query)
              || lots.some(item => fold(item.lot).includes(query));
            return matchesSearch && matchesStatus(group.status, statusFilter);
          });

          return (
            <div className="space-y-5">
              {stock.counts.expired > 0 && (
                <AlertBanner level="critical" title="Có lô đã hết hạn: không phát thuốc từ các lô này" />
              )}
              {stock.counts.out > 0 && (
                <AlertBanner level="warning" title="Có lô đã hết hàng">
                  Kiểm tra lại kho và nhập thêm trước khi phát thuốc.
                </AlertBanner>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Lô sắp hết" value={formatNumber(stock.counts.low)} tone="warn" hint="Còn từ 20 sản phẩm trở xuống" />
                <StatCard label="Hết hàng" value={formatNumber(stock.counts.out)} tone="danger" hint="Không còn sản phẩm nào" />
                <StatCard label="Sắp hết hạn" value={formatNumber(stock.counts.expiring)} tone="warn" hint="Trong vòng 60 ngày tới" />
                <StatCard label="Đã hết hạn" value={formatNumber(stock.counts.expired)} tone="danger" hint="Không được phát" />
              </div>

              {stock.items.length === 0 ? (
                <EmptyState
                  title="Kho chưa có lô thuốc"
                  action={<Button type="button" icon={<PackagePlus aria-hidden className="size-4" />} onClick={openDialog}>Nhập lô</Button>}
                >
                  Nhập lô thuốc đầu tiên, hoặc chạy <code>npm run seed:stock</code> để nạp dữ liệu mẫu.
                </EmptyState>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <TextField
                        label="Tìm theo tên thuốc hoặc số lô"
                        placeholder="Ví dụ: clopidogrel hoặc LOT-01"
                        maxLength={160}
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                      />
                    </div>
                    <div className="sm:w-56">
                      <SelectField
                        label="Trạng thái"
                        value={statusFilter}
                        options={FILTER_OPTIONS}
                        onChange={event => setStatusFilter(event.target.value as StatusFilter)}
                      />
                    </div>
                  </div>

                  <Tabs
                    items={[
                      { id: "lots", label: "Theo lô", count: stock.items.length },
                      { id: "medicines", label: "Theo thuốc", count: groups.length },
                    ]}
                    value={view}
                    onChange={id => setView(id as View)}
                    label="Chế độ xem kho"
                    idBase="stock-view"
                  />

                  {view === "lots" ? (
                    filteredLots.length === 0 ? (
                      <EmptyState title="Không có lô nào khớp">
                        Thử từ khác hoặc bỏ bộ lọc trạng thái.
                      </EmptyState>
                    ) : (
                      <DataTable
                        caption="Lô thuốc trong kho"
                        columns={lotColumns}
                        rows={filteredLots}
                        rowKey={item => `${item.name}-${item.lot}`}
                      />
                    )
                  ) : (
                    filteredGroups.length === 0 ? (
                      <EmptyState title="Không có lô nào khớp">
                        Thử từ khác hoặc bỏ bộ lọc trạng thái.
                      </EmptyState>
                    ) : (
                      <DataTable
                        caption="Thuốc trong kho gộp theo tên và hàm lượng"
                        columns={groupColumns}
                        rows={filteredGroups}
                        rowKey={group => `${group.name}-${group.strength}`}
                      />
                    )
                  )}
                </div>
              )}
            </div>
          );
        }}
      </Remote>

      <Dialog
        open={open}
        title="Nhập lô thuốc"
        onClose={() => { if (!busy) setOpen(false); }}
        footer={(
          <>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Huỷ</Button>
            <Button type="submit" form="receive-stock" loading={busy}>Lưu lô</Button>
          </>
        )}
      >
        <form id="receive-stock" className="space-y-3" onSubmit={submit}>
          <TextField
            label="Tên thuốc"
            aria-required
            maxLength={160}
            value={form.name}
            error={errors.name}
            onChange={change("name")}
          />
          <TextField
            label="Hàm lượng"
            aria-required
            maxLength={80}
            value={form.strength}
            error={errors.strength}
            onChange={change("strength")}
          />
          <TextField
            label="Số lô"
            aria-required
            maxLength={40}
            value={form.lot}
            error={errors.lot}
            onChange={change("lot")}
          />
          <TextField
            label="Số lượng"
            aria-required
            type="number"
            min={1}
            max={100_000}
            value={form.quantity}
            error={errors.quantity}
            onChange={change("quantity")}
          />
          <TextField
            label="Hạn dùng"
            aria-required
            type="date"
            value={form.expiresAt}
            error={errors.expiresAt}
            onChange={change("expiresAt")}
          />
          {formError && <p role="alert" className="text-sm font-medium text-danger">{formError}</p>}
        </form>
      </Dialog>

      <Dialog
        open={adjust !== null}
        title={adjust?.kind === "count" ? "Kiểm kê lô" : "Xuất hủy lô"}
        onClose={() => { if (!adjustBusy) setAdjust(null); }}
        footer={(
          <>
            <Button type="button" variant="secondary" disabled={adjustBusy} onClick={() => setAdjust(null)}>Huỷ</Button>
            <Button
              type="submit"
              form="adjust-stock"
              variant={adjust?.kind === "count" ? "primary" : "danger"}
              loading={adjustBusy}
            >
              {adjust?.kind === "count" ? "Lưu kiểm kê" : "Xuất hủy"}
            </Button>
          </>
        )}
      >
        {adjust && (
          <form id="adjust-stock" className="space-y-3" onSubmit={submitAdjust}>
            {adjust.kind === "dispose" ? (
              <>
                <p>Số lượng này sẽ bị trừ khỏi tồn kho của lô {adjust.item.lot}.</p>
                <TextField
                  label="Số lượng"
                  aria-required
                  type="number"
                  min={1}
                  max={adjust.item.onHand}
                  value={adjustValue}
                  error={adjustErrors.value}
                  onChange={event => {
                    setAdjustValue(event.target.value);
                    setAdjustErrors(current => ({ ...current, value: undefined }));
                    setAdjustFormError(null);
                  }}
                />
              </>
            ) : (
              <>
                <p>Số đếm thực tế sẽ thay cho tồn kho đang ghi sổ của lô {adjust.item.lot}.</p>
                <TextField
                  label="Số đếm thực tế"
                  aria-required
                  type="number"
                  min={0}
                  max={100_000}
                  value={adjustValue}
                  error={adjustErrors.value}
                  onChange={event => {
                    setAdjustValue(event.target.value);
                    setAdjustErrors(current => ({ ...current, value: undefined }));
                    setAdjustFormError(null);
                  }}
                />
                <p className="rounded-lg bg-surface-2 px-3 py-2 font-medium text-ink">{countSummary}</p>
              </>
            )}
            <TextAreaField
              label="Lý do"
              hint="Từ 3 đến 200 ký tự."
              required
              rows={3}
              maxLength={200}
              value={adjustReason}
              error={adjustErrors.reason}
              onChange={event => {
                setAdjustReason(event.target.value);
                setAdjustErrors(current => ({ ...current, reason: undefined }));
                setAdjustFormError(null);
              }}
            />
            {adjustFormError && <p role="alert" className="text-sm font-medium text-danger">{adjustFormError}</p>}
          </form>
        )}
      </Dialog>
    </div>
  );
}
