import type { getSupabaseAdmin } from "@/lib/supabase/admin";

import { ApiResultLimitError } from "./http";

export const INTERNAL_DATABASE_PAGE_SIZE = 1_000;
export const MAX_LEGACY_ARRAY_ROWS = 25_000;
export const MAX_DASHBOARD_ANALYTIC_ROWS = 100_000;

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

type DatabaseError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type QueryResult<T> = {
  data: T[] | null;
  error: DatabaseError | null;
  count: number | null;
};

export type QueryBuilder<T> = PromiseLike<QueryResult<T>> & {
  range(from: number, to: number): QueryBuilder<T>;
};

export type RpcResult<T> = {
  data: T | null;
  error: DatabaseError | null;
};

export type RpcClient = {
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<RpcResult<unknown>>;
};

export type InventoryTable = "stock" | "stock_in" | "stock_out" | "activity_logs";

export type RangeQueryFactory<T> = (options: {
  count: "exact" | undefined;
  head: boolean;
}) => QueryBuilder<T>;

export async function inventoryRpc<T>(
  supabase: SupabaseAdmin,
  functionName:
    | "create_stock_in"
    | "update_stock_in"
    | "void_stock_in"
    | "checkout_stock_out"
    | "update_stock_out"
    | "void_stock_out",
  args: Record<string, unknown>
): Promise<RpcResult<T>> {
  const result = await (supabase as unknown as RpcClient).rpc(functionName, args);
  if (result.error) return { data: null, error: result.error };

  const normalized = Array.isArray(result.data)
    ? result.data.length === 1
      ? result.data[0]
      : null
    : result.data;

  return { data: normalized as T | null, error: null };
}

export async function fetchExactCount<T>(buildQuery: RangeQueryFactory<T>) {
  const result = await buildQuery({ count: "exact", head: true });

  if (result.error) throw result.error;
  return result.count ?? 0;
}

export async function fetchPage<T>(
  buildQuery: RangeQueryFactory<T>,
  page: number,
  pageSize: number
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const first = await buildQuery({ count: "exact", head: false }).range(from, to);

  if (first.error) throw first.error;

  const total = first.count ?? 0;
  const expectedRows = Math.max(0, Math.min(pageSize, total - from));
  const rows = [...(first.data ?? [])];
  let cursor = from + rows.length;

  while (rows.length < expectedRows) {
    const result = await buildQuery({ count: undefined, head: false }).range(cursor, to);
    if (result.error) throw result.error;

    const nextRows = result.data ?? [];
    if (nextRows.length === 0) {
      throw new Error(`Page berhenti pada ${rows.length} dari ${expectedRows} baris.`);
    }

    rows.push(...nextRows);
    cursor += nextRows.length;
  }

  return { data: rows, total };
}

export async function fetchAllPagesWithCount<T>(
  buildQuery: RangeQueryFactory<T>,
  options: {
    maxRows?: number;
    pageSize?: number;
    label?: string;
  } = {}
) {
  const maxRows = options.maxRows ?? MAX_LEGACY_ARRAY_ROWS;
  const pageSize = Math.min(options.pageSize ?? INTERNAL_DATABASE_PAGE_SIZE, INTERNAL_DATABASE_PAGE_SIZE);
  const first = await buildQuery({ count: "exact", head: false }).range(0, pageSize - 1);

  if (first.error) throw first.error;

  const total = first.count ?? first.data?.length ?? 0;
  if (total > maxRows) {
    throw new ApiResultLimitError(
      `${options.label ?? "Hasil query"} berisi ${total} baris, melebihi batas aman ${maxRows}. Gunakan filter atau pagination.`
    );
  }

  const rows = [...(first.data ?? [])];
  let from = rows.length;

  while (from < total) {
    const result = await buildQuery({ count: undefined, head: false }).range(
      from,
      Math.min(from + pageSize - 1, total - 1)
    );

    if (result.error) throw result.error;

    const nextRows = result.data ?? [];
    if (nextRows.length === 0) {
      throw new Error(
        `${options.label ?? "Hasil query"} berhenti pada ${from} dari ${total} baris.`
      );
    }

    rows.push(...nextRows);
    from += nextRows.length;
  }

  return { data: rows, total };
}

export async function fetchAllPages<T>(
  buildQuery: RangeQueryFactory<T>,
  options: {
    maxRows?: number;
    pageSize?: number;
    label?: string;
  } = {}
) {
  return (await fetchAllPagesWithCount(buildQuery, options)).data;
}

export function paginationMetadata(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export function escapePostgrestSearch(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[%_*(),.]/g, (character) => `\\${character}`);
}
