"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";

import { SixDigitCodeInput } from "@/components/auth/code-form";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { requestActionCode } from "@/src/queries/account";
import type { ActionCodePurpose } from "@/src/shared-kernel/action-code-rules";

/** The server allows one code per purpose a minute. */
const RESEND_AFTER_SECONDS = 60;

/**
 * "Send code", then the six-digit input (ADR CM-0021 §8, §10, §11). The
 * code goes to the User's sign-in email, or by SMS when they sign in by
 * mobile and texts are on. Used inside every sensitive action's dialog.
 */
export function ActionCodeStep({
  id,
  purpose,
  value,
  onChange,
  onBlur,
  error,
}: {
  id: string;
  purpose: ActionCodePurpose;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string | undefined;
}) {
  const [sent, setSent] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const send = useMutation({
    mutationFn: () => requestActionCode(purpose),
    onSuccess: () => {
      setSent(true);
      setSecondsLeft(RESEND_AFTER_SECONDS);
    },
  });

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => {
      setSecondsLeft((left) => left - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [secondsLeft]);

  const sendError =
    send.error == null ? undefined : fieldForCode(send.error, {}).message;

  if (!sent)
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">
          We will send a 6-digit code to your sign-in email, or by SMS to the
          mobile you sign in with.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={send.isPending}
          onClick={() => {
            send.mutate();
          }}
        >
          {send.isPending ? "Sending…" : "Send code"}
        </Button>
        <FormAlert message={sendError} />
      </div>
    );

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>Enter the code we sent</Label>
      <p className="text-muted-foreground text-sm">
        It works for 10 minutes. Never share it with anyone.
      </p>
      <SixDigitCodeInput
        id={id}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
      />
      <FieldError message={error} />
      <FormAlert message={sendError} />
      <p className="text-muted-foreground text-sm">
        {secondsLeft > 0 ? (
          <span>Send a new code in {secondsLeft}s</span>
        ) : (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-sm"
            disabled={send.isPending}
            onClick={() => {
              send.mutate();
            }}
          >
            Send a new code
          </Button>
        )}
      </p>
    </div>
  );
}
