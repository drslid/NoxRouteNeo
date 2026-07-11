"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@noxroute/ui";
import { ArrowUpDown, Search, SquarePen, UserRound } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import type { AccountListItem } from "@/data/accounts";
import { formatBytes, formatDate } from "@/lib/format";
import { useI18n } from "@/i18n/client";
import { intlLocale } from "@/i18n/config";
import { roleMessageKey, statusMessageKey } from "@/i18n/labels";

export function AccountsTable({ data }: { data: AccountListItem[] }) {
  const { locale, t } = useI18n();
  const numberLocale = intlLocale(locale);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [search, setSearch] = React.useState("");
  const columns = React.useMemo<ColumnDef<AccountListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("accounts.account")}
            <ArrowUpDown aria-hidden="true" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-full bg-muted">
              <UserRound className="size-4" aria-hidden="true" />
            </span>
            <span>
              <strong className="block text-sm font-medium">
                {row.original.name}
              </strong>
              <span className="block text-xs text-muted-foreground">
                @{row.original.username}
              </span>
            </span>
          </div>
        ),
      },
      {
        accessorKey: "role",
        header: t("common.role"),
        cell: ({ row }) => (
          <Badge variant="outline">
            {t(roleMessageKey(row.original.role))}
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: t("common.status"),
        cell: ({ row }) => (
          <Badge
            variant={row.original.status === "active" ? "success" : "warning"}
          >
            {t(statusMessageKey(row.original.status))}
          </Badge>
        ),
      },
      {
        accessorKey: "usedBytes",
        header: t("common.transfer"),
        cell: ({ row }) => formatBytes(row.original.usedBytes, numberLocale),
      },
      {
        accessorKey: "activeConnections",
        header: t("common.active"),
        cell: ({ row }) => row.original.activeConnections,
      },
      {
        accessorKey: "maxDevices",
        header: t("nav.devices"),
        cell: ({ row }) => row.original.maxDevices ?? "-",
      },
      {
        accessorKey: "createdAt",
        header: t("accounts.createdAt"),
        cell: ({ row }) => formatDate(row.original.createdAt, numberLocale),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="icon">
            <Link
              href={`/admin/accounts/${row.original.id}`}
              aria-label={t("accounts.edit", { name: row.original.name })}
              title={t("accounts.edit", { name: row.original.name })}
            >
              <SquarePen aria-hidden="true" />
            </Link>
          </Button>
        ),
      },
    ],
    [numberLocale, t],
  );
  // TanStack Table intentionally returns non-memoizable functions.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 border-b p-4 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="ps-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("accounts.search")}
            aria-label={t("accounts.search")}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("accounts.count", {
            count: table.getFilteredRowModel().rows.length,
          })}
        </p>
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-28 text-center text-muted-foreground"
              >
                {t("accounts.noMatch")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
