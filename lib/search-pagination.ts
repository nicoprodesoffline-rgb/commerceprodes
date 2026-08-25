import { createUrl } from "./utils";

export const CATALOG_PAGE_SIZE = 48;

export type SearchPageParams = Record<
  string,
  string | string[] | undefined
>;

export function normalizePageParam(pageParam?: string | string[]): number {
  const rawValue = Array.isArray(pageParam) ? pageParam[0] : pageParam;
  const parsed = Number.parseInt(rawValue ?? "1", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function toUrlSearchParams(
  searchParams: SearchPageParams,
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) params.append(key, item);
      }
      continue;
    }

    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
    }
  }

  return params;
}

export function buildCatalogPageUrl(
  pathname: string,
  searchParams: SearchPageParams,
  page: number,
): string {
  const params = toUrlSearchParams(searchParams);

  if (page <= 1) params.delete("page");
  else params.set("page", String(page));

  return createUrl(pathname, params);
}
