"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@repo/ui/components/input-otp";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "./field-error";

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

type CodeValues = z.infer<typeof codeSchema>;

const RESEND_AFTER_SECONDS = 30;

/**
 * The 6-digit code step shared by mobile and email sign-in. `onSubmit`
 * resolves the server error message for the code, if any.
 */
export function CodeForm({
  sentTo,
  submitLabel,
  busy,
  serverError,
  onSubmit,
  onResend,
  onChangeDestination,
  changeLabel,
}: {
  sentTo: string;
  submitLabel: string;
  busy: boolean;
  serverError: string | undefined;
  onSubmit: (code: string) => Promise<void>;
  onResend: () => Promise<boolean>;
  onChangeDestination: () => void;
  changeLabel: string;
}) {
  const form = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });
  const [secondsLeft, setSecondsLeft] = useState(RESEND_AFTER_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => {
      setSecondsLeft((value) => value - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [secondsLeft]);

  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          await onSubmit(values.code);
        })(event);
      }}
      className="space-y-4"
      noValidate
    >
      <p className="text-muted-foreground text-sm">
        We sent a code to{" "}
        <span className="text-foreground font-semibold">{sentTo}</span>.{" "}
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-sm"
          onClick={onChangeDestination}
        >
          {changeLabel}
        </Button>
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="code">Code</Label>
        <Controller
          name="code"
          control={form.control}
          render={({ field }) => (
            <InputOTP
              id="code"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              aria-label="6-digit code"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className="size-11 text-base"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          )}
        />
        <FieldError
          message={form.formState.errors.code?.message ?? serverError}
        />
      </div>
      <Button type="submit" disabled={busy} className="h-10 w-full">
        {busy ? "Checking…" : submitLabel}
      </Button>
      <p className="text-muted-foreground text-center text-sm font-light">
        {secondsLeft > 0 ? (
          <span>Resend the code in {secondsLeft}s</span>
        ) : (
          <>
            Didn&apos;t get it?{" "}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm"
              disabled={busy}
              onClick={() => {
                void onResend().then((sent) => {
                  if (sent) setSecondsLeft(RESEND_AFTER_SECONDS);
                });
              }}
            >
              Resend code
            </Button>
          </>
        )}
      </p>
    </form>
  );
}
