// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Button, ErrorState, PermissionState, SignInPage, Skeleton, type NavGroup } from "@junctura/health-ui";
import { BarChart3, ClipboardList, History as HistoryIcon, LayoutDashboard, Package, ScanLine, Settings as SettingsIcon, UserCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, getConfig, getHistory, getMe, getStock } from "./api";
import { buildLogoutUrl, clearSession, completeLogin, loadSession, startLogin } from "./auth";
import { Audit } from "./Audit";
import { CallLog } from "./CallLog";
import { History } from "./History";
import { HistoryDetail } from "./HistoryDetail";
import { Landing } from "./Landing";
import { Reports } from "./Reports";
import { navigate, useLocation } from "./router";
import { searchAll } from "./search";
import { NotFound, SessionProvider } from "./session";
import { Settings } from "./Settings";
import { Stock } from "./Stock";
import { Today } from "./Today";
import type { HistoryItem, Me, PublicConfig, StockItem } from "./types";
import { Verify } from "./Verify";

type State =
  | { kind: "loading" }
  | { kind: "signed-out"; message?: string }
  | { kind: "forbidden" }
  | { kind: "ready"; me: Me }
  | { kind: "error" };

const ROLE_LABEL: Record<string, string> = { pharmacist: "Dược sĩ" };

const NAV: NavGroup[] = [
  {
    label: "Nhà thuốc",
    items: [
      { id: "/", label: "Xác minh đơn", icon: <ScanLine aria-hidden className="size-4" /> },
      { id: "/hom-nay", label: "Hôm nay", icon: <LayoutDashboard aria-hidden className="size-4" /> },
      { id: "/lich-su", label: "Lịch sử", icon: <HistoryIcon aria-hidden className="size-4" /> },
      { id: "/kho", label: "Kho", icon: <Package aria-hidden className="size-4" /> },
      { id: "/bao-cao", label: "Báo cáo", icon: <BarChart3 aria-hidden className="size-4" /> },
      { id: "/nhat-ky", label: "Nhật ký Junctura", icon: <ClipboardList aria-hidden className="size-4" /> },
      { id: "/nhat-ky-thao-tac", label: "Nhật ký thao tác", icon: <UserCheck aria-hidden className="size-4" /> },
      { id: "/cai-dat", label: "Cài đặt", icon: <SettingsIcon aria-hidden className="size-4" /> },
    ],
  },
];

const CURRENT: Record<string, string> = {
  "/": "/", "/hom-nay": "/hom-nay", "/lich-su": "/lich-su", "/kho": "/kho",
  "/nhat-ky": "/nhat-ky", "/nhat-ky-thao-tac": "/nhat-ky-thao-tac", "/bao-cao": "/bao-cao",
  "/cai-dat": "/cai-dat",
};

const HISTORY_ITEM_PATH = /^\/lich-su\/([^/]+)$/;
const SEARCH_CACHE_MS = 30_000;

interface SearchData { history: HistoryItem[]; stock: StockItem[] }

export function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const { path } = useLocation();
  const [crumbs, setCrumbs] = useState<string[]>([]);
  const settings = useMemo(() => (config ? { issuer: config.issuer, clientId: config.clientId } : null), [config]);
  const expire = useCallback(() => { clearSession(); setState({ kind: "signed-out", message: "Phiên đăng nhập đã hết hạn." }); }, []);
  const searchCache = useRef<{ at: number; data: Promise<SearchData> } | null>(null);
  const loadSearchData = useCallback((): Promise<SearchData> => {
    const now = Date.now();
    const cached = searchCache.current;
    if (cached && now - cached.at < SEARCH_CACHE_MS) return cached.data;
    const data = Promise.all([getHistory(settings!), getStock(settings!)])
      .then(([history, stock]) => ({ history: history.items, stock: stock.items }))
      .catch(() => ({ history: [] as HistoryItem[], stock: [] as StockItem[] }));
    searchCache.current = { at: now, data };
    return data;
  }, [settings]);
  const selectSearch = useCallback((result: { id: string }) => {
    if (result.id.startsWith("page:")) navigate(result.id.slice("page:".length));
    else if (result.id.startsWith("history:")) navigate(`/lich-su/${encodeURIComponent(result.id.slice("history:".length))}`);
    else if (result.id.startsWith("stock:")) navigate(`/kho?q=${encodeURIComponent(result.id.slice("stock:".length))}`);
  }, []);

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
  const historyMatch = HISTORY_ITEM_PATH.exec(path);
  const page = path === "/"
    ? <Verify />
    : path === "/hom-nay"
      ? <Today />
      : path === "/lich-su"
        ? <History />
        : historyMatch
          ? <HistoryDetail id={decodeURIComponent(historyMatch[1])} />
          : path === "/kho"
            ? <Stock />
            : path === "/bao-cao"
              ? <Reports />
              : path === "/nhat-ky"
                ? <CallLog />
                : path === "/nhat-ky-thao-tac"
                  ? <Audit />
                  : path === "/cai-dat"
                    ? <Settings />
                    : <NotFound />;

  return (
    <SessionProvider value={{ settings: settings!, facility: config!.facility, expire, setCrumbs }}>
      <AppShell product="Pharmacy" nav={NAV} current={historyMatch ? "/lich-su" : CURRENT[path] ?? ""} onNavigate={navigate} breadcrumbs={crumbs}
        unit={{ name: "Junctura Pharmacy", stations: [{ id: "main", name: config!.facility }] }}
        user={{ name: me.displayName, role: ROLE_LABEL[me.role] ?? me.role }} onSignOut={signOut}
        search={{
          placeholder: "Tìm trang, mã đơn, thuốc hoặc số lô",
          hint: "Nhấn / hoặc Ctrl+K",
          onSearch: async query => {
            if (query.trim() === "") return searchAll(query, { pages: NAV, history: [], stock: [] });
            return searchAll(query, { pages: NAV, ...(await loadSearchData()) });
          },
          onSelect: selectSearch,
        }}>
        {page}
      </AppShell>
    </SessionProvider>
  );
}
