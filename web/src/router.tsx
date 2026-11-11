// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState, type AnchorHTMLAttributes } from "react";

// A tiny history-API router: a handful of routes do not justify a routing library.
const read = () => ({ path: location.pathname, search: location.search });

export const useLocation = () => {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const update = () => setValue(read());
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);
  return value;
};

export function navigate(to: string) {
  history.pushState(null, "", to);
  dispatchEvent(new PopStateEvent("popstate"));
  scrollTo({ top: 0 });
}

export function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...rest}
      href={to}
      onClick={event => {
        onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    />
  );
}
