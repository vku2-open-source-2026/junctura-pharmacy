// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AlertBanner, Badge, Button, DataTable, Dialog, EmptyState, PageHeader, StatCard, TextField,
  formatDate, formatNumber, type Column, type Tone,
} from "@junctura/health-ui";
import { PackagePlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError, getStock, receiveStock } from "./api";
import { Remote, useRemote, useSession } from "./session";
import type { ReceiveStockInput, StockItem, StockStatus } from "./types";

const STATUS: Record<StockStatus, { label: string; tone: Tone }> = {
  ok: { label: "Còn hàng", tone: "ok" },
  low: { label: "Sắp hết", tone: "warn" },
  out: { label: "Hết hàng", tone: "danger" },
  expiring: { label: "Sắp hết hạn", tone: "warn" },
  expired: { label: "Đã hết hạn", tone: "danger" },
};

const COLUMNS: Column<StockItem>[] = [
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
    key: "status",
    header: "Trạng thái",
    render: item => <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>,
  },
];

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

function saveError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return "Thông tin lô chưa hợp lệ. Kiểm tra lại các trường rồi thử lại.";
    if (error.status === 403) return "Tài khoản này không phải dược sĩ nên không nhập được lô.";
    if (error.status === 503) return "Kho chưa sẵn sàng. Thử lại sau.";
  }
  return "Không lưu được lô thuốc. Kiểm tra kết nối rồi thử lại.";
}

export function Stock() {
  const { settings, expire } = useSession();
  const { state, reload } = useRemote(signal => getStock(settings, signal), [settings]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Kho"
        description="Lô thuốc, số lượng tồn và hạn dùng tại nhà thuốc, lô gần hết hạn trước."
        actions={<Button type="button" icon={<PackagePlus aria-hidden className="size-4" />} onClick={openDialog}>Nhập lô</Button>}
      />

      <Remote state={state} reload={reload}>
        {stock => (
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
              <DataTable
                caption="Lô thuốc trong kho"
                columns={COLUMNS}
                rows={stock.items}
                rowKey={item => `${item.name}-${item.lot}`}
              />
            )}
          </div>
        )}
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
    </div>
  );
}
