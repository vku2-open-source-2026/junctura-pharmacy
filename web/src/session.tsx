// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { EmptyState, ErrorState, Skeleton } from "@junctura/health-ui";
import { createContext, useContext, type ReactNode } from "react";
import type { OidcSettings } from "./auth";

export interface SessionValue { settings: OidcSettings; facility: string; expire: () => void; setCrumbs: (crumbs: string[]) => void }

const SessionContext = createContext<SessionValue | null>(null);
export const SessionProvider = SessionContext.Provider;
export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

export type RemoteState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; forbidden: boolean };

/** Skeleton while loading, an error with retry on failure, the content when ready. */
export function Remote<T>({ state, reload, children }: { state: RemoteState<T>; reload: () => void; children: (data: T) => ReactNode }) {
  if (state.status === "loading") return <Skeleton lines={5} />;
  if (state.status === "error") return <ErrorState onRetry={reload}>Không tải được dữ liệu từ máy chủ Nhà thuốc. Kiểm tra kết nối rồi thử lại.</ErrorState>;
  return <>{children(state.data)}</>;
}

export const NotFound = () => <EmptyState title="Không tìm thấy trang">Địa chỉ này không có trong Nhà thuốc. Dùng thanh điều hướng bên trái.</EmptyState>;
