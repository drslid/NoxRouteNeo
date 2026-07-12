"use client";

import { Button, Input, Select } from "@noxroute/ui";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { useI18n } from "@/i18n/client";

function useQueryNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  return React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );
}

export function DataTableQueryControls({
  query,
  pageSize,
  placeholder,
}: {
  query: string;
  pageSize: number;
  placeholder: string;
}) {
  const { t } = useI18n();
  const navigate = useQueryNavigation();
  const searchTimer = React.useRef<number | null>(null);

  function updateSearch(value: string) {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(
      () => navigate({ q: value.trim() || null, page: null }),
      300,
    );
  }

  return (
    <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
      <label className="relative block w-full max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground rtl:left-auto rtl:right-3"
          aria-hidden="true"
        />
        <Input
          className="pl-9 rtl:pl-3 rtl:pr-9"
          type="search"
          defaultValue={query}
          onChange={(event) => updateSearch(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="whitespace-nowrap">{t("table.rowsPerPage")}</span>
        <Select
          className="w-20"
          value={String(pageSize)}
          onChange={(event) =>
            navigate({ pageSize: event.target.value, page: null })
          }
        >
          {[25, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}

export function TablePagination({
  page,
  totalPages,
  totalItems,
  pageParameter = "page",
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageParameter?: string;
}) {
  const { t } = useI18n();
  const navigate = useQueryNavigation();

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>{t("table.resultCount", { count: totalItems })}</span>
      <div className="flex items-center gap-2">
        <span>{t("table.pageCount", { page, pages: totalPages })}</span>
        <Button
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => navigate({ [pageParameter]: String(page - 1) })}
          aria-label={t("table.previousPage")}
          title={t("table.previousPage")}
        >
          <ChevronLeft className="rtl:rotate-180" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => navigate({ [pageParameter]: String(page + 1) })}
          aria-label={t("table.nextPage")}
          title={t("table.nextPage")}
        >
          <ChevronRight className="rtl:rotate-180" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
