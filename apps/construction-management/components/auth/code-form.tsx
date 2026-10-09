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

/** A 6-digit emailed or texted code. */
export const sixDigitCode = z
  .string()
  .regex(/^\d{6}$/, "Enter the 6-digit code");

const codeSchema = z.object({ code: sixDigitCode });

type CodeValues = z.infer<typeof codeSchema>;

const RESEND_AFTER_SECONDS = 30;

/**
 * The 6-digit code step shared by mobile and email sign-in. `onSubmit`
 * resolves the server error message for the code, if any. Forgot password
 * reuses its input and resend link with a new-password field.
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
            <SixDigitCodeInput
              id="code"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        <FieldError
          message={form.formState.errors.code?.message ?? serverError}
        />
      </div>
      <Button type="submit" disabled={busy} className="h-10 w-full">
        {busy ? "Checking…" : submitLabel}
      </Button>
      <ResendCode busy={busy} onResend={onResend} />
    </form>
  );
}

/** The six-slot code input; autofocuses and fills from an SMS or email. */
export function SixDigitCodeInput({
  id,
  value,
  onChange,
  onBlur,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <InputOTP
      id={id}
      maxLength={6}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      aria-label="6-digit code"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
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
  );
}

/** "Resend code", offered once the countdown since the last send ends. */
export function ResendCode({
  busy,
  onResend,
}: {
  busy: boolean;
  onResend: () => Promise<boolean>;
}) {
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
  );
}
