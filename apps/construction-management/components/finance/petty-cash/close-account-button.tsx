"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  useClosePettyCashAccount,
  type PettyCashAccount,
} from "@/src/queries/finance-petty-cash";

/**
 * Close account (Petty Cash Delete): only an account with no vouchers and
 * no entries but its opening offers it; the server checks again (409
 * PETTY_CASH_ACCOUNT_IN_USE shows in the dialog).
 */
export function CloseAccountButton({ account }: { account: PettyCashAccount }) {
  const close = useClosePettyCashAccount();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          close.reset();
          setOpen(true);
        }}
      >
        Close account
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close {account.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It has no vouchers. Its opening balance stays in the books;
              {account.holderName} can have a new account later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {close.isError ? (
            <FormAlert message={fieldForCode(close.error, {}).message} />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={close.isPending}
              onClick={() => {
                close.mutate(account.id, {
                  onSuccess: () => {
                    setOpen(false);
                  },
                });
              }}
            >
              Close account
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
