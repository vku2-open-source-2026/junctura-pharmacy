// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Notice } from "./parts";
import type { Me } from "./types";

const ROLE_LABEL: Record<string, string> = { pharmacist: "Dược sĩ" };

/** The signed-in home screen: who you are, and an honest note about what is not built yet. */
export const Home = ({ me }: { me: Me }) => (
  <div className="mx-auto max-w-3xl space-y-6 py-4">
    <header>
      <p className="text-sm text-muted">Nhà thuốc</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Xin chào, {me.displayName}</h1>
      <p className="mt-2 text-ink-2">Bạn đang đăng nhập bằng tài khoản Junctura của nhân viên nhà thuốc.</p>
    </header>
    <Notice title="Chức năng đang xây dựng">
      Chức năng xác minh đơn thuốc đang được xây dựng. Khi hoàn thành, nhà thuốc sẽ nhận đơn và danh sách dị ứng qua Junctura.
    </Notice>
    <p className="text-sm text-muted">Vai trò: {ROLE_LABEL[me.role] ?? me.role}</p>
  </div>
);
