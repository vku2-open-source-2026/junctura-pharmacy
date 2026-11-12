// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { AlertBanner, Button, Dialog } from "@junctura/health-ui";
import jsQR from "jsqr";
import { Camera, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const PERMISSION_ERROR = "Trình duyệt chưa cho dùng camera. Cho phép camera rồi thử lại, hoặc dùng máy quét/nhập tay.";
const NO_CAMERA_ERROR = "Không tìm thấy camera trên thiết bị này. Dùng máy quét hoặc nhập tay.";
const HTTPS_ERROR = "Camera chỉ dùng được trên HTTPS hoặc localhost";
const OTHER_ERROR = "Không mở được camera. Kiểm tra thiết bị rồi thử lại, hoặc dùng máy quét/nhập tay.";

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function detectorConstructor(): BarcodeDetectorConstructor | undefined {
  return (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
}

function isSecure(): boolean {
  if (typeof window.isSecureContext === "boolean") return window.isSecureContext;
  return location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function cameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return PERMISSION_ERROR;
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return NO_CAMERA_ERROR;
  return OTHER_ERROR;
}

function readWithCanvas(video: HTMLVideoElement): string | null {
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
}

export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach(track => track.stop());
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  const close = useCallback(() => {
    stopCamera();
    setOpen(false);
    setError(null);
  }, [stopCamera]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let finished = false;
    let scanning = false;

    const finish = (text: string) => {
      if (finished) return;
      finished = true;
      stopCamera();
      setOpen(false);
      setError(null);
      onResultRef.current(text);
    };

    const scan = async () => {
      if (cancelled || finished || scanning) return;
      const video = videoRef.current;
      if (!video) return;
      scanning = true;
      try {
        const Detector = detectorConstructor();
        if (Detector) {
          const detector = new Detector({ formats: ["qr_code"] });
          const results = await detector.detect(video);
          const value = results.find(result => result.rawValue)?.rawValue;
          if (value) finish(value);
        } else {
          const value = readWithCanvas(video);
          if (value) finish(value);
        }
      } catch {
        // A frame that cannot be read is skipped; the next tick tries again.
      } finally {
        scanning = false;
      }
    };

    const start = async () => {
      if (!isSecure()) {
        if (!cancelled) setError(HTTPS_ERROR);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setError(NO_CAMERA_ERROR);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        try {
          const played = video.play();
          if (played && typeof played.catch === "function") played.catch(() => {});
        } catch {
          // Some browsers refuse autoplay with sound; this stream has no audio.
        }
        timerRef.current = window.setInterval(() => { void scan(); }, 250);
        void scan();
      } catch (caught) {
        if (!cancelled) setError(cameraError(caught));
      }
    };

    void start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, stopCamera]);

  return (
    <>
      <Button type="button" variant="secondary" icon={<Camera aria-hidden className="size-4" />} onClick={() => setOpen(true)}>
        Quét bằng camera
      </Button>
      <Dialog
        open={open}
        title="Quét mã QR bằng camera"
        onClose={close}
        footer={<Button type="button" variant="secondary" onClick={close}>Đóng</Button>}
      >
        <div className="space-y-3">
          <p>Đưa mã QR trên đơn vào giữa khung hình. Ánh sáng đủ và giữ máy ổn định.</p>
          {error && <AlertBanner level="warning" title="Chưa dùng được camera">{error}</AlertBanner>}
          <div className="overflow-hidden rounded-lg border border-line bg-ink">
            <video ref={videoRef} muted playsInline aria-label="Khung hình camera để quét mã QR" className="aspect-video w-full object-cover" />
          </div>
          {!error && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <ScanLine aria-hidden className="size-4" />
              Ứng dụng tự đóng khi đọc được mã.
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
