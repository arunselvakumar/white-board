"use client";

import { useId, useState } from "react";
import { buttonVariants } from "@repo/ui/components/button";
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
 * The browser downloads it; above 500 files the server says to choose
 * fewer days.
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
        ? "From is on or before To."
        : undefined;
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
            <Label htmlFor={`${id}-from`}>From</Label>
            <Input
              id={`${id}-from`}
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-to`}>To</Label>
            <Input
              id={`${id}-to`}
              type="date"
              value={to}
              aria-invalid={problem != null}
              onChange={(event) => {
                setTo(event.target.value);
              }}
            />
          </div>
        </div>
        <FieldError message={problem} />
        <DialogFooter>
          {problem == null ? (
            <a
              href={receiptsZipUrl(account.id, from, to)}
              download
              className={buttonVariants()}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Download ZIP
            </a>
          ) : (
            <span
              aria-disabled="true"
              className={buttonVariants({ className: "opacity-50" })}
            >
              Download ZIP
            </span>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
