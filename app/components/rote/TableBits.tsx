import { useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";

import { cn } from "@/lib/utils";

type Cell = string | number | boolean | null;

export function formatCell(value: Cell | undefined) {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "number")
    return Number.isInteger(value)
      ? value.toLocaleString("en-US")
      : value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return String(value);
}

/** Native select over the caller's tables; labels show names, never raw IDs. */
export function TablePicker({
  value,
  onChange,
  label,
  disabled,
  filter,
}: {
  value: string;
  onChange: (id: string) => void;
  label: string;
  disabled?: boolean;
  filter?: (name: string) => boolean;
}) {
  const t = useT();
  const list = useActionQuery("list-tables", {});
  const tables = (list.data ?? []).filter((x) => !filter || filter(x.name));
  const known = tables.some((x) => x.id === value);
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        value={value}
        disabled={disabled || list.isLoading}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {list.isLoading ? t("rote.loading") : t("rote.flow.chooseTable")}
        </option>
        {value && !known && <option value={value}>{value}</option>}
        {tables.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name} · {x.rowCount} rows
          </option>
        ))}
      </select>
    </label>
  );
}

export function RowsTable({
  columns,
  rows,
  tone,
  maxRows = 8,
}: {
  columns: string[];
  rows: Record<string, Cell>[];
  tone?: "missing" | "unexpected";
  maxRows?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="bg-muted/60">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="whitespace-nowrap px-3 py-2 font-medium"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, maxRows).map((row, i) => (
            <tr
              key={i}
              className={cn(
                "border-t",
                tone === "missing" && "bg-red-500/10",
                tone === "unexpected" && "bg-amber-500/10",
              )}
            >
              {columns.map((c) => (
                <td
                  key={c}
                  className={cn(
                    "whitespace-nowrap px-3 py-1.5 font-mono tabular-nums",
                    row[c] === null && "text-muted-foreground",
                  )}
                >
                  {formatCell(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TablePreview({ id, rows = 6 }: { id: string; rows?: number }) {
  const t = useT();
  const preview = useActionQuery(
    "preview-table",
    { inputTableId: id, limit: rows },
    { enabled: !!id },
  );
  if (!id) return null;
  if (preview.isLoading)
    return <div className="h-24 animate-pulse rounded-lg bg-muted" aria-busy />;
  if (preview.error || !preview.data)
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("rote.loadError")}
      </p>
    );
  const d = preview.data;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {d.name} · {Math.min(rows, d.rowCount)} of {d.rowCount} rows
        {d.sample ? ` · ${t("rote.flow.sampleTag")}` : ""}
      </p>
      <RowsTable columns={d.columns} rows={d.rows} maxRows={rows} />
    </div>
  );
}
