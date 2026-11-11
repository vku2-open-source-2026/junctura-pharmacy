// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Badge, Button, ErrorState, PermissionState, SignInPage, Skeleton, type NavGroup } from "@junctura/health-ui";
import { Home as HomeIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, getConfig, getMe } from "./api";
import { buildLogoutUrl, clearSession, completeLogin, loadSession, startLogin } from "./auth";
import { Home } from "./Home";
import { Landing } from "./Landing";
import { useLocation } from "./router";
import { NotFound, SessionProvider } from "./session";
import type { Me, PublicConfig } from "./types";

type State =
  | { kind: "loading" }
  | { kind: "signed-out"; message?: string }
  | { kind: "forbidden" }
  | { kind: "ready"; me: Me }
  | { kind: "error" };

const ROLE_LABEL: Record<string, string> = { pharmacist: "Dược sĩ" };

const NAV: NavGroup[] = [
  { label: "Nhà thuốc", items: [{ id: "/", label: "Trang chủ", icon: <HomeIcon aria-hidden className="size-4" /> }] },
];

export function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const { path } = useLocation();
  const [crumbs, setCrumbs] = useState<string[]>([]);
  const settings = useMemo(() => (config ? { issuer: config.issuer, clientId: config.clientId } : null), [config]);
  const expire = useCallback(() => { clearSession(); setState({ kind: "signed-out", message: "Phiên đăng nhập đã hết hạn." }); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await getConfig();
        if (cancelled) return;
        setConfig(loaded);
        const oidc = { issuer: loaded.issuer, clientId: loaded.clientId };
        let signedIn = loadSession() !== null;
        if (location.search.includes("code=") || location.search.includes("error=")) {
          try {
            signedIn = (await completeLogin(oidc, location.search)) !== null;
          } catch {
            history.replaceState(null, "", "/");
            return setState({ kind: "signed-out", message: "Đăng nhập không thành công. Hãy thử lại." });
          }
          history.replaceState(null, "", "/");
        }
        if (!signedIn) return setState({ kind: "signed-out" });
        setState({ kind: "ready", me: await getMe(oidc) });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 403) setState({ kind: "forbidden" });
        else if (error instanceof ApiError && error.status === 401) { clearSession(); setState({ kind: "signed-out" }); }
        else setState({ kind: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const signOut = () => {
    if (!settings) return;
    const idToken = loadSession()?.idToken;
    clearSession();
    location.assign(buildLogoutUrl(settings, `${location.origin}/`, idToken));
  };

  if (state.kind === "loading") return <div className="mx-auto max-w-3xl p-8"><Skeleton lines={4} /></div>;
  if (state.kind === "error") return <div className="mx-auto max-w-xl p-8"><ErrorState onRetry={() => location.reload()}>Không kết nối được máy chủ Nhà thuốc hoặc Junctura. Thử lại sau.</ErrorState></div>;
  if (state.kind === "forbidden") {
    return <div className="mx-auto max-w-xl space-y-4 p-8"><PermissionState>Tài khoản này không thuộc nhân viên nhà thuốc nên không xem được.</PermissionState><Button variant="secondary" onClick={signOut}>Đăng xuất</Button></div>;
  }
  if (state.kind === "signed-out") {
    const signIn = () => settings && startLogin(settings);
    if (state.message) {
      return <SignInPage product="Pharmacy" subtitle="Đăng nhập bằng tài khoản Junctura của nhà thuốc." onSignIn={signIn} onBack={() => location.reload()} message={state.message}
        note={config ? `${config.facility}. Mật khẩu chỉ nhập trên trang của Junctura.` : undefined} />;
    }
    return <Landing facility={config?.facility} onSignIn={signIn} />;
  }

  const me = state.me;
  const page = path === "/" ? <Home me={me} /> : <NotFound />;

  return (
    <SessionProvider value={{ settings: settings!, facility: config!.facility, expire, setCrumbs }}>
      <AppShell product="Pharmacy" nav={NAV} current={path === "/" ? "/" : ""} onNavigate={() => location.assign("/")} breadcrumbs={crumbs}
        status={<Badge tone="neutral">Bản demo</Badge>}
        unit={{ name: "Junctura Pharmacy", stations: [{ id: "main", name: config!.facility }] }}
        user={{ name: me.displayName, role: ROLE_LABEL[me.role] ?? me.role }} onSignOut={signOut}>
        {page}
      </AppShell>
    </SessionProvider>
  );
}
