// SPDX-FileCopyrightText: 2026 Junctura Contributors
// SPDX-License-Identifier: Apache-2.0
import { formatDate, formatNumber, type NavItem, type SearchResult } from "@junctura/health-ui";
import type { HistoryItem, HistoryResult, StockItem, StockResult } from "./types";

type Page = Pick<NavItem, "id" | "label">;
type PageGroup = { items: Page[] };

export interface SearchSources {
  pages: Page[] | PageGroup[];
  history: HistoryItem[] | HistoryResult;
  stock: StockItem[] | StockResult;
}

/** Lower-cases Vietnamese text and drops its diacritics, including đ. */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

function withItems<T>(value: T[] | { items: T[] }): T[] {
  return Array.isArray(value) ? value : value.items;
}

function flattenPages(pages: Page[] | PageGroup[]): Page[] {
  return pages.flatMap(entry => ("items" in entry ? entry.items : [entry]));
}

/** Quick-find across the menu, prescription history and stock. At most eight results. */
export function searchAll(query: string, { pages, history, stock }: SearchSources): SearchResult[] {
  const needle = fold(query.trim());
  const pageResults = flattenPages(pages)
    .filter(page => needle === "" || fold(page.label).includes(needle))
    .map(page => ({ id: `page:${page.id}`, title: page.label }));

  if (needle === "") return pageResults.slice(0, 8);

  const results: SearchResult[] = [...pageResults];

  for (const item of withItems(history)) {
    if (!fold(item.prescriptionCode).includes(needle)) continue;
    results.push({
      id: `history:${item.id}`,
      title: item.prescriptionCode,
      subtitle: `${item.outcome === "dispensed" ? "Đã phát" : "Từ chối"} · ${formatDate(item.at)}`,
    });
  }

  const seen = new Set<string>();
  for (const item of withItems(stock)) {
    if (!fold(item.name).includes(needle) && !fold(item.lot).includes(needle)) continue;
    const id = `stock:${item.name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    results.push({
      id,
      title: item.name,
      subtitle: `Lô ${item.lot} · còn ${formatNumber(item.onHand)}`,
    });
  }

  return results.slice(0, 8);
}
