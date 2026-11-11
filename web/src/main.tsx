// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { DisplayPrefsProvider, ToastProvider } from "@junctura/health-ui";
import "@junctura/health-ui/fonts.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DisplayPrefsProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </DisplayPrefsProvider>
  </StrictMode>,
);
