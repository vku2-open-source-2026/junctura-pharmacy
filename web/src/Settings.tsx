// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AlertBanner, Button, Card, PageHeader, TextField, formatDateTime,
} from "@junctura/health-ui";
import { useState, type FormEvent } from "react";
import { ApiError, getSettings, saveSettings } from "./api";
import { Remote, useRemote, useSession } from "./session";
import type { SettingsInput, SettingsResult } from "./types";

const LOW_STOCK = { min: 0, max: 10_000 };
const EXPIRING_DAYS = { min: 1, max: 365 };
const SAVED = "Đã lưu. Trang Kho và Hôm nay dùng ngưỡng mới.";

type FieldErrors = { lowStock?: string; expiringDays?: string };

function validate(lowStockRaw: string, expiringDaysRaw: string): { errors: FieldErrors; input?: SettingsInput } {
  const errors: FieldErrors = {};
  const lowStock = Number(lowStockRaw);
  const expiringDays = Number(expiringDaysRaw);

  if (lowStockRaw.trim() === "" || !Number.isInteger(lowStock) || lowStock < LOW_STOCK.min || lowStock > LOW_STOCK.max) {
    errors.lowStock = "Số đơn vị phải là số nguyên từ 0 đến 10.000.";
  }
  if (expiringDaysRaw.trim() === "" || !Number.isInteger(expiringDays)
    || expiringDays < EXPIRING_DAYS.min || expiringDays > EXPIRING_DAYS.max) {
    errors.expiringDays = "Số ngày phải là số nguyên từ 1 đến 365.";
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { errors, input: { lowStock, expiringDays } };
}

function saveError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return "Cài đặt chưa hợp lệ. Kiểm tra lại hai ngưỡng rồi thử lại.";
    if (error.status === 403) return "Tài khoản này không phải dược sĩ nên không lưu được cài đặt.";
    if (error.status === 503) return "Cài đặt chưa sẵn sàng. Thử lại sau.";
  }
  return "Không lưu được cài đặt. Kiểm tra kết nối rồi thử lại.";
}

function SettingsForm({ data }: { data: SettingsResult }) {
  const { settings, expire } = useSession();
  const [lowStock, setLowStock] = useState(String(data.lowStock));
  const [expiringDays, setExpiringDays] = useState(String(data.expiringDays));
  const [updatedAt, setUpdatedAt] = useState(data.updatedAt);
  const [updatedBy, setUpdatedBy] = useState(data.updatedBy);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = validate(lowStock, expiringDays);
    setErrors(result.errors);
    if (!result.input) return;

    setBusy(true);
    setFormError(null);
    setSaved(false);
    try {
      const next = await saveSettings(settings, result.input);
      setLowStock(String(next.lowStock));
      setExpiringDays(String(next.expiringDays));
      setUpdatedAt(next.updatedAt);
      setUpdatedBy(next.updatedBy);
      setSaved(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expire();
      setFormError(saveError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card title="Ngưỡng cảnh báo kho">
        <form id="pharmacy-settings" className="space-y-3" noValidate onSubmit={submit}>
          <TextField
            label="Coi là sắp hết khi còn tối đa"
            hint="Đơn vị (0–10.000)."
            type="number"
            min={LOW_STOCK.min}
            max={LOW_STOCK.max}
            step={1}
            value={lowStock}
            error={errors.lowStock}
            onChange={event => {
              setLowStock(event.target.value);
              setErrors(current => ({ ...current, lowStock: undefined }));
              setFormError(null);
              setSaved(false);
            }}
          />
          <TextField
            label="Coi là sắp hết hạn trong"
            hint="Ngày (1–365)."
            type="number"
            min={EXPIRING_DAYS.min}
            max={EXPIRING_DAYS.max}
            step={1}
            value={expiringDays}
            error={errors.expiringDays}
            onChange={event => {
              setExpiringDays(event.target.value);
              setErrors(current => ({ ...current, expiringDays: undefined }));
              setFormError(null);
              setSaved(false);
            }}
          />
          <div>
            <Button type="submit" loading={busy}>Lưu cài đặt</Button>
          </div>
          {formError && <p role="alert" className="text-sm font-medium text-danger">{formError}</p>}
        </form>

        <p className="mt-3 text-sm text-muted">
          {updatedAt
            ? `Cập nhật lần cuối: ${formatDateTime(updatedAt)} bởi ${updatedBy ?? "—"}`
            : "Đang dùng giá trị mặc định"}
        </p>
      </Card>

      {saved && <AlertBanner level="info" title={SAVED} />}
    </div>
  );
}

export function Settings() {
  const { settings } = useSession();
  const { state, reload } = useRemote(() => getSettings(settings), [settings]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Cài đặt"
        description="Ngưỡng cảnh báo kho dùng chung cho trang Kho và Hôm nay."
      />
      <Remote state={state} reload={reload}>
        {data => <SettingsForm data={data} />}
      </Remote>
    </div>
  );
}
