// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { Card } from "@junctura/health-ui";
import type { ReactNode } from "react";

/** An honest, titled note used when a screen has nothing to show yet. */
export const Notice = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card title={title}>
    <p className="text-sm text-ink-2">{children}</p>
  </Card>
);
