// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from "@junctura/health-ui";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** The last six characters of a code, kept whole when the code is already short. */
export function shortCode(value: string): string {
  return value.length <= 8 ? value : `…${value.slice(-6)}`;
}

/** A compact, non-wrapping code chip that copies the full value. */
export function ShortCode({ value, full = false, className = "" }: { value: string; full?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the code stays visible for manual copying.
    }
  };

  return (
    <span className={`inline-flex max-w-full items-center gap-0.5 whitespace-nowrap rounded-md border border-line bg-surface-2 py-0.5 pl-2 pr-0.5 font-mono text-xs text-ink-2 ${className}`}>
      <span className="whitespace-nowrap" title={value}>{full ? value : shortCode(value)}</span>
      <Button
        variant="ghost"
        className="!min-h-6 !px-1"
        onClick={event => {
          event.stopPropagation();
          void copy();
        }}
        aria-label={`${copied ? "Đã sao chép" : "Sao chép"} ${value}`}
        title={copied ? "Đã sao chép" : "Sao chép mã đầy đủ"}
        icon={copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
      />
      <span role="status" className="sr-only">{copied ? "Đã sao chép" : ""}</span>
    </span>
  );
}
