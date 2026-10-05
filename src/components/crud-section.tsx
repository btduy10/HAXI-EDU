"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type ActionFn, type Field, FormDialog } from "./form-dialog";

export type CrudRow = {
  id: string;
  /** Giá trị hiển thị theo thứ tự cột. */
  cells: string[];
  /** Giá trị gốc để nạp vào form sửa. */
  values: Record<string, string>;
  href?: string;
};

/**
 * Danh sách + thêm/sửa/xóa dùng chung. Điện thoại hiển thị dạng thẻ, màn hình rộng dạng bảng.
 * Dữ liệu và action do trang (server component) truyền vào.
 */
export function CrudSection({
  title,
  columns,
  rows,
  fields,
  createAction,
  updateAction,
  deleteAction,
  addLabel = "Thêm",
  emptyText = "Chưa có dữ liệu.",
  detailLabel = "Chi tiết",
}: {
  title: string;
  columns: string[];
  rows: CrudRow[];
  fields: Field[];
  createAction?: ActionFn;
  updateAction?: ActionFn;
  deleteAction?: ActionFn;
  addLabel?: string;
  emptyText?: string;
  detailLabel?: string;
}) {
  const [editing, setEditing] = useState<CrudRow | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(row: CrudRow) {
    if (!deleteAction || !window.confirm(`Xóa "${row.cells[0]}"? Thao tác này không hoàn tác được.`)) return;
    startTransition(async () => {
      const result = await deleteAction({ id: row.id });
      if (result.ok) toast.success("Đã xóa.");
      else toast.error(result.error);
    });
  }

  const rowActions = (row: CrudRow) => (
    <div className="flex shrink-0 items-center justify-end gap-1">
      {row.href && (
        <LinkButton variant="outline" className="h-9" href={row.href}>
          {detailLabel}
        </LinkButton>
      )}
      {updateAction && (
        <Button variant="ghost" size="icon-lg" aria-label={`Sửa ${row.cells[0]}`} onClick={() => setEditing(row)}>
          <PencilIcon />
        </Button>
      )}
      {deleteAction && (
        <Button variant="ghost" size="icon-lg" aria-label={`Xóa ${row.cells[0]}`} disabled={pending} onClick={() => remove(row)}>
          <Trash2Icon />
        </Button>
      )}
    </div>
  );

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {title} <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
        </h2>
        {createAction && (
          <Button className="h-10" onClick={() => setEditing("new")}>
            <PlusIcon /> {addLabel}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          <ul className="grid gap-2 md:hidden">
            {rows.map((row) => (
              <li key={row.id} className={cn("flex gap-2 rounded-lg border p-3", row.href ? "flex-col" : "items-start justify-between")}>
                <div className="min-w-0">
                  <p className="font-medium break-words">{row.cells[0]}</p>
                  <dl className="mt-1 grid gap-0.5 text-sm text-muted-foreground">
                    {row.cells.slice(1).map((cell, i) =>
                      cell ? (
                        <div key={columns[i + 1]} className="flex gap-1">
                          <dt className="shrink-0">{columns[i + 1]}:</dt>
                          <dd className="min-w-0 break-words text-foreground">{cell}</dd>
                        </div>
                      ) : null,
                    )}
                  </dl>
                </div>
                {rowActions(row)}
              </li>
            ))}
          </ul>
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c}>{c}</TableHead>
                  ))}
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.cells.map((cell, i) => (
                      <TableCell key={columns[i]} className="whitespace-normal">
                        {cell}
                      </TableCell>
                    ))}
                    <TableCell>{rowActions(row)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {editing && (
        <FormDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          title={editing === "new" ? `${addLabel} ${title.toLowerCase()}` : `Sửa ${title.toLowerCase()}`}
          fields={fields}
          initial={editing === "new" ? undefined : editing.values}
          onSubmit={(values) =>
            editing === "new" ? createAction!(values) : updateAction!({ id: editing.id, data: values })
          }
        />
      )}
    </section>
  );
}
