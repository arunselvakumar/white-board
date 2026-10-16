"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";

import { fieldForCode } from "@/lib/server-errors";
import { verifyRevealCode } from "@/src/queries/account";
import { QueryHttpError } from "@/src/queries/http";

import { ActionCodeStep } from "./action-code-step";

/** Whether a reveal was refused for want of a code (ADR CM-0021 §11). */
export function needsRevealCode(error: unknown): boolean {
  return (
    error instanceof QueryHttpError && error.code === "REVEAL_CODE_REQUIRED"
  );
}

/**
 * "Enter the code we sent" before Aadhaar and PAN are shown in full. A
 * verified code allows reveals for 10 minutes on this device. No `<form>`
 * here: the dialog may open inside another form.
 */
export function RevealCodeDialog({
  onVerified,
  onClose,
}: {
  onVerified: () => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const verify = useMutation({ mutationFn: verifyRevealCode });

  const submit = () => {
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code");
      return;
    }
    setError(undefined);
    verify.mutate(code, {
      onSuccess: onVerified,
      onError: (failure) => {
        setError(fieldForCode(failure, {}).message);
      },
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm it is you</DialogTitle>
          <DialogDescription>
            Full Aadhaar and PAN numbers need a code. Once you enter it, you can
            reveal them for 10 minutes on this device.
          </DialogDescription>
        </DialogHeader>
        {/* Enter in the code input verifies here instead of submitting the
            form this dialog may sit in; the input itself stays the control. */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- keyboard shortcut for the input inside */}
        <div
          className="min-w-0"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        >
          <ActionCodeStep
            id="reveal-code"
            purpose="reveal_identifiers"
            value={code}
            onChange={setCode}
            onBlur={() => undefined}
            error={error}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={verify.isPending} onClick={submit}>
            {verify.isPending ? "Checking…" : "Verify and reveal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
