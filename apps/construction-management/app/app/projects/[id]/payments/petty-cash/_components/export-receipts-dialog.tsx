"use client";

import { useId, useState } from "react";
import { Button } from "@repo/ui/components/button";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { localToday } from "@/components/payments/payment-format";
import {
  receiptsZipUrl,
  type PettyCashAccount,
} from "@/src/queries/finance-petty-cash";

function monthStart(today: string): string {
  return `${today.slice(0, 8)}01`;
}

/**
 * Export Receipts (CM-0017 §9): the photos and receipts of the account's
 * vouchers between two dates as one ZIP, each named by its voucher number.
 * It is fetched first and saved only when the server sends it; a refusal
 * (above 500 files: choose fewer days) shows here and the dialog stays.
 */
export function ExportReceiptsDialog({
  account,
  open,
  onOpenChange,
  today = localToday(),
}: {
  account: PettyCashAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today?: string;
}) {
  const id = useId();
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const problem =
    from === "" || to === ""
      ? "Choose both dates."
      : from > to
        ? "Choose a From date on or before the To date."
        : undefined;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  async function download() {
    setBusy(true);
    setFailure(undefined);
    try {
      const response = await fetch(receiptsZipUrl(account.id, from, to));
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setFailure(
          body?.message ?? "The receipts could not be exported. Try again.",
        );
        return;
      }
      const blob = await response.blob();
      const name =
        /filename="?([^";]+)"?/.exec(
          response.headers.get("content-disposition") ?? "",
        )?.[1] ?? "receipts.zip";
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      link.click();
      URL.revokeObjectURL(href);
      onOpenChange(false);
    } catch {
      setFailure("The receipts could not be exported. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Receipts</DialogTitle>
          <DialogDescription>
            The photos and receipts of {account.name}&apos;s vouchers as one
            ZIP, named by voucher number. Up to 500 files at a time.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-from`} required>
              From
            </Label>
            <Input
              id={`${id}-from`}
              type="date"
              value={from}
              aria-required
              onChange={(event) => {
                setFrom(event.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-to`} required>
              To
            </Label>
            <Input
              id={`${id}-to`}
              type="date"
              value={to}
              aria-required
              aria-invalid={problem != null}
              onChange={(event) => {
                setTo(event.target.value);
              }}
            />
          </div>
        </div>
        <FieldError message={problem} />
        <FormAlert message={failure} />
        <DialogFooter>
          <Button
            type="button"
            disabled={problem != null || busy}
            onClick={() => {
              void download();
            }}
          >
            {busy ? "Preparing…" : "Download ZIP"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
