"use client";

import type { ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldError as HookFieldError,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from "react-hook-form";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";

// Label + control + error, the field chrome of every Preschool form
// (frontend-patterns). `id` is the control's id and the label's `htmlFor`.

type Common<Values extends FieldValues> = {
  id: string;
  name: Path<Values>;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: HookFieldError | undefined;
  className?: string;
};

function Hint({ hint }: { hint: ReactNode }) {
  return hint == null ? null : (
    <p className="text-muted-foreground text-xs">{hint}</p>
  );
}

export function TextField<Values extends FieldValues>({
  id,
  name,
  label,
  required,
  hint,
  error,
  className,
  register,
  type,
  inputMode,
  placeholder,
  autoComplete = "off",
  disabled,
}: Common<Values> & {
  register: UseFormRegister<Values>;
  type?: "text" | "date" | "email" | "tel" | "url";
  inputMode?: "numeric" | "tel" | "email" | "url";
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Input
        id={id}
        className="h-10"
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-required={required}
        aria-invalid={error != null}
        {...register(name)}
      />
      <Hint hint={hint} />
      <FieldError message={error?.message} />
    </div>
  );
}

export function TextareaField<Values extends FieldValues>({
  id,
  name,
  label,
  required,
  hint,
  error,
  className,
  register,
  rows = 3,
  placeholder,
}: Common<Values> & {
  register: UseFormRegister<Values>;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Textarea
        id={id}
        rows={rows}
        placeholder={placeholder}
        aria-required={required}
        aria-invalid={error != null}
        {...register(name)}
      />
      <Hint hint={hint} />
      <FieldError message={error?.message} />
    </div>
  );
}

export type Option = { value: string; label: string; tag?: string };

/** A Select wired with `Controller`; `""` is no choice. */
export function SelectField<Values extends FieldValues>({
  id,
  name,
  label,
  required,
  hint,
  error,
  className,
  control,
  options,
  placeholder = "Choose…",
  disabled,
}: Common<Values> & {
  control: Control<Values>;
  options: readonly Option[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select
            items={options.map(({ value, label: text }) => ({
              value,
              label: text,
            }))}
            value={field.value ?? ""}
            disabled={disabled}
            onValueChange={(value) => {
              if (value != null) field.onChange(value);
            }}
          >
            <SelectTrigger
              id={id}
              size="lg"
              aria-required={required}
              aria-invalid={error != null}
              className="w-full min-w-0"
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {options.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  tag={option.tag}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <Hint hint={hint} />
      <FieldError message={error?.message} />
    </div>
  );
}
