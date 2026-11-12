// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import {
  AlertBanner, AllergyStatus, Badge, Button, Card, DataTable, Dialog, ErrorState, PageHeader,
  PermissionState, SourceBadge, TextAreaField, TextField, formatDate, formatDateTime, type Column,
} from "@junctura/health-ui";
import { ScanLine } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError, dispense, refuse, verifyPrescription } from "./api";
import { useSession } from "./session";
import type {
  AllergyConflict, Blocker, CapabilityStatus, DispenseItem, PrescriptionItem, VerificationResult, VerifyInput,
} from "./types";

const BLOCKER_TEXT: Record<Blocker, string> = {
  "prescription-unavailable": "Không lấy được đơn thuốc từ bệnh viện",
  invalid: "Đơn thuốc không hợp lệ",
  expired: "Đơn đã hết hạn",
  "already-dispensed": "Đơn đã được phát",
  "allergies-unknown": "Chưa biết tình trạng dị ứng: hỏi người bệnh trước khi phát",
};

const SEVERITY_LABEL: Record<string, string> = { mild: "nhẹ", moderate: "trung bình", severe: "nặng" };

function blockerText(blocker: string): string {
  return BLOCKER_TEXT[blocker as Blocker] ?? "Không thể phát đơn này.";
}

function blockersText(blockers?: string[]): string {
  return (blockers ?? []).map(blockerText).join(" ");
}

function capabilityText(status: CapabilityStatus): string {
  switch (status) {
    case "not-authorized":
      return "Nhà thuốc chưa được phép xem đơn thuốc này. Liên hệ quản trị Junctura để được cấp quyền.";
    case "unavailable":
      return "Không lấy được đơn thuốc từ bệnh viện. Kiểm tra kết nối rồi thử lại.";
    case "failed":
    case "invalid-output":
      return "Không đọc được đơn thuốc từ bệnh viện. Thử xác minh lại hoặc liên hệ bệnh viện.";
    default:
      return "Không xem được đơn thuốc.";
  }
}

function dispenseError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "not-dispensable") return blockersText(error.blockers) || "Đơn không thể phát.";
    if (error.code === "allergy-conflict") return "Đơn có thuốc trùng với dị ứng đã ghi nhận. Ghi lý do vẫn phát trước khi xác nhận.";
    if (error.code === "already-dispensed") return "Đơn đã được phát. Không thể phát lại.";
    if (error.code === "items-mismatch") return "Số lượng hoặc số lô chưa khớp với đơn. Kiểm tra lại.";
    if (error.code === "lot-expired") return "Lô này đã hết hạn. Không phát thuốc từ lô này; chọn lô khác.";
    if (error.code === "insufficient-stock") return "Lô này không đủ hàng trong kho. Kiểm tra lại số lô hoặc số lượng.";
    if (error.status === 400) return "Thông tin phát thuốc chưa hợp lệ. Kiểm tra lại.";
  }
  return requestError(error, "Không phát được thuốc");
}

function requestError(error: unknown, action: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.";
    if (error.status === 403) return "Tài khoản này không phải dược sĩ nên không thực hiện được.";
    if (error.status === 503) return "Junctura hoặc kho chưa sẵn sàng. Thử lại sau.";
    if (error.status === 400) return "Thông tin gửi đi chưa hợp lệ. Kiểm tra lại rồi thử lại.";
  }
  return `${action}. Kiểm tra kết nối rồi thử lại.`;
}

const columnsFor = (conflicts: AllergyConflict[]): Column<PrescriptionItem>[] => [
  {
    key: "name",
    header: "Tên thuốc",
    render: item => {
      const allergens = conflicts.filter(conflict => conflict.medicine === item.name).map(conflict => conflict.allergen);
      return (
        <span className="flex flex-wrap items-center gap-2">
          {item.name}
          {allergens.length > 0 && <Badge tone="danger">Trùng dị ứng: {allergens.join(", ")}</Badge>}
        </span>
      );
    },
  },
  { key: "strength", header: "Hàm lượng", render: item => item.strength },
  { key: "quantity", header: "Số lượng", align: "right", render: item => item.quantity },
  { key: "instructions", header: "Cách dùng", render: item => item.instructions },
];

export function Verify() {
  const { settings, expire } = useSession();
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [patient, setPatient] = useState("");
  const [request, setRequest] = useState<VerifyInput | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [lots, setLots] = useState<Record<string, string>>({});
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [override, setOverride] = useState("");
  const conflicts = result?.allergyConflicts ?? [];

  const fail = (error: unknown, action: string) => {
    if (error instanceof ApiError && error.status === 401) expire();
    return requestError(error, action);
  };

  const changeMode = () => {
    setMode(value => (value === "scan" ? "manual" : "scan"));
    setResult(null);
    setRequest(null);
    setMessage(null);
    setFormError(null);
  };

  const inputOf = (): VerifyInput => mode === "manual"
    ? { prescriptionCode: code.trim(), patient: patient.trim() }
    : { qr: qr.trim() };

  const submitVerify = async (event: FormEvent) => {
    event.preventDefault();
    const input = inputOf();
    const empty = "qr" in input ? !input.qr : !input.prescriptionCode || !input.patient;
    if (empty) {
      setMessage({ tone: "danger", text: mode === "manual" ? "Nhập mã đơn và mã người bệnh trước khi xác minh." : "Nhập hoặc quét mã QR trên đơn trước khi xác minh." });
      return;
    }

    setBusy(true);
    setMessage(null);
    setFormError(null);
    try {
      const next = await verifyPrescription(settings, input);
      setResult(next);
      setRequest(input);
      setQr("");
      setCode("");
      setPatient("");
      const items = next.prescription.status === "ok" ? next.prescription.output?.items ?? [] : [];
      setQuantities(Object.fromEntries(items.map(item => [item.name, String(item.quantity)])));
      setLots(Object.fromEntries(items.map(item => [item.name, ""])));
      setOverride("");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expire();
      setResult(null);
      setRequest(null);
      setMessage({ tone: "danger", text: fail(error, "Không xác minh được đơn") });
    } finally {
      setBusy(false);
    }
  };

  const submitDispense = async (event: FormEvent) => {
    event.preventDefault();
    if (!result || !request) return;
    const items = result.prescription.output?.items ?? [];
    const payload: DispenseItem[] = [];

    for (const item of items) {
      const quantity = Number(quantities[item.name]);
      const lot = (lots[item.name] ?? "").trim();
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity) {
        setFormError(`Số lượng của ${item.name} phải từ 1 đến ${item.quantity}.`);
        return;
      }
      if (!lot) {
        setFormError(`Nhập số lô cho ${item.name}.`);
        return;
      }
      payload.push({ name: item.name, quantity, lot });
    }
    const overrideReason = override.trim();
    if (conflicts.length > 0 && ([...overrideReason].length < 10 || [...overrideReason].length > 200)) {
      setFormError("Đơn có thuốc trùng với dị ứng đã ghi nhận. Ghi lý do vẫn phát (10–200 ký tự) sau khi đã hỏi lại người bệnh hoặc bác sĩ.");
      return;
    }

    setFormError(null);
    setBusy(true);
    try {
      await dispense(settings, { ...request, items: payload, ...(conflicts.length > 0 && { allergyOverride: overrideReason }) });
      setMessage({ tone: "ok", text: `Đã phát thuốc cho đơn ${result.prescriptionCode}.` });
      setResult(null);
      setRequest(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expire();
      setFormError(dispenseError(error));
    } finally {
      setBusy(false);
    }
  };

  const submitRefuse = async () => {
    if (!result || !request) return;
    const trimmed = reason.trim();
    const length = [...trimmed].length;
    if (length < 3 || length > 200) {
      setReasonError("Lý do từ chối cần từ 3 đến 200 ký tự.");
      return;
    }

    setReasonError(null);
    setBusy(true);
    try {
      await refuse(settings, { ...request, reason: trimmed });
      setMessage({ tone: "ok", text: `Đã ghi nhận từ chối phát đơn ${result.prescriptionCode}.` });
      setRefusing(false);
      setReason("");
      setResult(null);
      setRequest(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expire();
      setReasonError(requestError(error, "Không gửi được lý do từ chối"));
    } finally {
      setBusy(false);
    }
  };

  const prescription = result?.prescription;
  const output = prescription?.status === "ok" ? prescription.output : undefined;
  const dispenseItems = output?.items ?? [];
  const consentBlocked = prescription?.status === "no-consent" || result?.allergies.status === "no-consent";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Xác minh đơn" description="Quét hoặc nhập mã đơn để xem đơn thuốc và cảnh báo dị ứng trước khi phát." />

      <Card title="Nhập mã đơn">
        <form className="space-y-4" onSubmit={submitVerify}>
          {mode === "scan" ? (
            <TextField
              label="Mã QR trên đơn"
              hint="Máy quét gõ mã như bàn phím. Nhấn Enter để xác minh."
              value={qr}
              autoFocus
              autoComplete="off"
              onChange={event => setQr(event.target.value)}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Mã đơn" value={code} autoComplete="off" onChange={event => setCode(event.target.value)} />
              <TextField label="Mã người bệnh" value={patient} autoComplete="off" onChange={event => setPatient(event.target.value)} />
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={busy} icon={<ScanLine aria-hidden className="size-4" />}>Xác minh</Button>
            <Button type="button" variant="secondary" onClick={changeMode}>
              {mode === "scan" ? "Nhập tay" : "Quét mã"}
            </Button>
            <Button type="button" variant="danger" disabled={!result || busy} onClick={() => setRefusing(true)}>
              Từ chối phát
            </Button>
          </div>
        </form>
      </Card>

      {message && (
        <AlertBanner level={message.tone === "ok" ? "info" : "warning"} title={message.tone === "ok" ? "Thành công" : "Chưa thực hiện được"}>
          {message.text}
        </AlertBanner>
      )}

      {result && (
        <div className="space-y-5">
          {consentBlocked && (
            <PermissionState>Người bệnh chưa đồng ý cho nhà thuốc xem thông tin này.</PermissionState>
          )}

          <Card title="Đơn thuốc">
            {output ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={output.valid && !result.blockers.some(blocker => blocker === "invalid" || blocker === "expired") ? "ok" : "danger"}>
                    {output.valid && !result.blockers.some(blocker => blocker === "invalid" || blocker === "expired") ? "Đơn hợp lệ" : "Đơn không hợp lệ"}
                  </Badge>
                  <Badge tone={output.dispensed ? "warn" : "neutral"}>{output.dispensed ? "Đã phát" : "Chưa phát"}</Badge>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted">Ngày kê</dt>
                    <dd className="font-medium text-ink">{formatDate(output.issuedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Hạn dùng</dt>
                    <dd className="font-medium text-ink">{formatDate(output.expiresAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Tình trạng phát</dt>
                    <dd className="font-medium text-ink">{output.dispensed ? "Đã phát thuốc" : "Chưa phát thuốc"}</dd>
                  </div>
                </dl>
                <DataTable caption="Thuốc trong đơn" columns={columnsFor(conflicts)} rows={output.items} rowKey={item => item.name} />
                <div className="flex flex-wrap items-center gap-3">
                  <SourceBadge source="Bệnh viện" />
                  {prescription?.receivedAt && <span className="text-sm text-muted">Nhận lúc {formatDateTime(prescription.receivedAt)}</span>}
                </div>
              </div>
            ) : prescription?.status === "no-consent" ? (
              <p className="text-sm text-ink-2">Không xem được đơn thuốc vì người bệnh chưa đồng ý.</p>
            ) : (
              <ErrorState title="Không xem được đơn thuốc">{capabilityText(prescription?.status ?? "unavailable")}</ErrorState>
            )}
          </Card>

          <Card title="Dị ứng">
            {result.allergies.status === "ok" && result.allergies.output ? (
              <div className="space-y-3">
                <AllergyStatus
                  state={result.allergies.output.allergyState}
                  items={result.allergies.output.allergies.map(allergy => `${allergy.substance} (${SEVERITY_LABEL[allergy.severity] ?? "chưa rõ mức độ"}) – ${allergy.reaction}`)}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <SourceBadge source="Trạm y tế" />
                  {result.allergies.receivedAt && <span className="text-sm text-muted">Nhận lúc {formatDateTime(result.allergies.receivedAt)}</span>}
                </div>
              </div>
            ) : result.allergies.status === "no-consent" ? (
              <p className="text-sm text-ink-2">Không xem được thông tin dị ứng vì người bệnh chưa đồng ý.</p>
            ) : (
              <AllergyStatus state="unavailable" reason="Không xem được thông tin dị ứng từ Trạm y tế." />
            )}
          </Card>

          {conflicts.length > 0 && (
            <AlertBanner level="critical" title="Thuốc trong đơn trùng với dị ứng đã ghi nhận">
              <ul className="list-disc space-y-1 pl-5">
                {conflicts.map(conflict => (
                  <li key={`${conflict.medicine}-${conflict.allergen}`}>
                    {conflict.medicine}: người bệnh dị ứng {conflict.allergen} ({SEVERITY_LABEL[conflict.severity] ?? "chưa rõ mức độ"})
                  </li>
                ))}
              </ul>
              <p className="mt-2">Hỏi lại người bệnh hoặc liên hệ bác sĩ kê đơn trước khi phát. Cảnh báo dựa trên tên và nhóm thuốc phổ biến, không thay cho đánh giá chuyên môn.</p>
            </AlertBanner>
          )}

          {result.blockers.length > 0 && (
            <div className="space-y-3">
              {result.blockers.map(blocker => (
                <AlertBanner key={blocker} level="warning" title={blockerText(blocker)} />
              ))}
            </div>
          )}

          {result.dispensable && (
            <Card title="Phát thuốc">
              <form className="space-y-4" onSubmit={submitDispense}>
                <ul className="space-y-4">
                  {dispenseItems.map(item => (
                    <li key={item.name} className="rounded-lg border border-line px-4 py-3">
                      <p className="font-medium text-ink">{item.name} <span className="font-normal text-ink-2">{item.strength}</span></p>
                      <p className="text-sm text-muted">Kê {item.quantity} · {item.instructions}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <TextField
                          label={`Số lượng ${item.name}`}
                          type="number"
                          min={1}
                          max={item.quantity}
                          value={quantities[item.name] ?? String(item.quantity)}
                          onChange={event => setQuantities(current => ({ ...current, [item.name]: event.target.value }))}
                        />
                        <TextField
                          label={`Số lô ${item.name}`}
                          aria-required
                          maxLength={40}
                          value={lots[item.name] ?? ""}
                          onChange={event => setLots(current => ({ ...current, [item.name]: event.target.value }))}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                {conflicts.length > 0 && (
                  <TextAreaField
                    label="Lý do vẫn phát thuốc trùng dị ứng"
                    hint="10–200 ký tự. Lý do được lưu vào lịch sử phát thuốc."
                    required
                    maxLength={200}
                    value={override}
                    onChange={event => setOverride(event.target.value)}
                  />
                )}
                {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
                <Button type="submit" loading={busy}>Xác nhận phát thuốc</Button>
              </form>
            </Card>
          )}
        </div>
      )}

      <Dialog
        open={refusing}
        title="Từ chối phát thuốc"
        onClose={() => setRefusing(false)}
        footer={(
          <>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setRefusing(false)}>Huỷ</Button>
            <Button type="button" variant="danger" loading={busy} onClick={submitRefuse}>Gửi từ chối</Button>
          </>
        )}
      >
        <div className="space-y-3">
          <p>Lý do được lưu vào lịch sử để người bệnh và nhà thuốc xem lại.</p>
          <TextAreaField
            label="Lý do từ chối"
            hint="Từ 3 đến 200 ký tự."
            aria-required
            maxLength={200}
            rows={3}
            value={reason}
            error={reasonError ?? undefined}
            onChange={event => { setReason(event.target.value); setReasonError(null); }}
          />
        </div>
      </Dialog>
    </div>
  );
}
