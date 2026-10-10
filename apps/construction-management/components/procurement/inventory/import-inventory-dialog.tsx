"use client";

import {
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import {
  inventorySampleUrl,
  useImportInventory,
  type InventoryImportResult,
} from "@/src/queries/inventory";

import { formatQuantity, localToday } from "./inventory-format";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Import Inventory Stock (CM-506): download the sample (Material,
 * Quantity, Unit, Estimated Qty), upload it filled in, check every row,
 * then post. Quantities become Opening stock, only for materials with no
 * stock entries here yet; nothing is posted while any row has an error.
 */
export function ImportInventoryDialog({
  location,
  open,
  onClose,
}: {
  location: StockLocation;
  open: boolean;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [openingDate, setOpeningDate] = useState(localToday());
  const [preview, setPreview] = useState<InventoryImportResult | null>(null);
  const [error, setError] = useState<string | undefined>();
  const check = useImportInventory(location);
  const commit = useImportInventory(location);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(undefined);
  };

  const choose = (chosen: File | undefined) => {
    if (chosen == null) return;
    reset();
    if (!chosen.name.toLowerCase().endsWith(".xlsx")) {
      setError("Choose the Excel (.xlsx) sample sheet.");
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError("The file must be at most 2 MB.");
      return;
    }
    setFile(chosen);
    check.mutate(
      { file: chosen, dryRun: true },
      {
        onSuccess: setPreview,
        onError: (caught) => {
          setError(fieldForCode(caught, {}).message);
        },
      },
    );
  };

  const posted =
    preview != null && (preview.imported > 0 || preview.estimatesSet > 0);
  const busy = check.isPending || commit.isPending;
  const ready = preview == null ? 0 : preview.rows.length - preview.errorCount;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Inventory Stock</DialogTitle>
          <DialogDescription>
            Fill in the sample sheet, one material per row, and upload it.
            Quantities post as opening stock for materials with no stock
            movements here yet; Estimated Qty is set for every row. Nothing is
            posted until every row is right.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <a
            href={inventorySampleUrl(location)}
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download aria-hidden="true" />
            Export Sample Excel
          </a>
          <Input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Choose Excel file"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <FileSpreadsheet aria-hidden="true" />
            {file == null ? "Upload filled sheet" : "Upload another sheet"}
          </Button>
          <div className="space-y-1">
            <Label htmlFor="import-opening-date" className="text-xs">
              Opening stock date
            </Label>
            <Input
              id="import-opening-date"
              type="date"
              className="h-8 w-40"
              max={localToday()}
              value={openingDate}
              onChange={(event) => {
                setOpeningDate(event.target.value);
              }}
            />
          </div>
          {file != null && (
            <span className="text-muted-foreground min-w-0 truncate text-sm">
              {file.name}
            </span>
          )}
        </div>

        {check.isPending && (
          <p role="status" className="text-muted-foreground text-sm">
            Checking rows…
          </p>
        )}
        {preview != null && (
          <div className="space-y-3">
            <p role="status" className="text-sm">
              {posted
                ? `Imported: ${String(preview.imported)} opening ${preview.imported === 1 ? "entry" : "entries"}, ${String(preview.estimatesSet)} estimated ${preview.estimatesSet === 1 ? "quantity" : "quantities"}.`
                : `${String(ready)} ready · ${String(preview.errorCount)} with errors`}
            </p>
            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table aria-label="Import preview">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Estimated</TableHead>
                    <TableHead>Check</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow key={row.row}>
                      <TableCell className="tabular-nums">{row.row}</TableCell>
                      <TableCell className="font-medium">
                        {row.material || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(row.quantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(row.estimatedQty)}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {row.errors.length === 0 ? (
                          <Badge variant="secondary">
                            <CircleCheck aria-hidden="true" />
                            Ready
                          </Badge>
                        ) : (
                          <ul className="text-destructive space-y-0.5 text-xs">
                            {row.errors.map((rowError) => (
                              <li key={rowError.code} className="flex gap-1">
                                <CircleAlert
                                  aria-hidden="true"
                                  className="mt-0.5 size-3 shrink-0"
                                />
                                {rowError.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <FormAlert message={error} />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {posted ? "Done" : "Cancel"}
          </Button>
          {!posted && (
            <Button
              type="button"
              disabled={
                busy ||
                file == null ||
                preview == null ||
                preview.errorCount > 0 ||
                openingDate === ""
              }
              onClick={() => {
                if (file == null) return;
                setError(undefined);
                commit.mutate(
                  { file, dryRun: false, openingDate },
                  {
                    onSuccess: setPreview,
                    onError: (caught) => {
                      setError(fieldForCode(caught, {}).message);
                    },
                  },
                );
              }}
            >
              {commit.isPending
                ? "Importing…"
                : `Import ${String(ready)} ${ready === 1 ? "row" : "rows"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
