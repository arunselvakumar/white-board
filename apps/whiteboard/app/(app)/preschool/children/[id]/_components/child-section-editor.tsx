"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  useForm,
  type FieldValues,
  type Path,
  type Resolver,
  type UseFormReturn,
} from "react-hook-form";
import type { z } from "zod";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

import { FormAlert } from "@/components/auth/form-alert";
import {
  fieldForError,
  type ChildFormValues,
} from "@/app/(app)/preschool/children/_components/child-form-fields";
import { QueryHttpError } from "@/src/queries/http";

/**
 * One section of the Child page: facts, and for managers an Edit button that
 * swaps them for a form in place. A save sends the `updatedAt` the page
 * loaded; when someone saved since (409 `CHILD_CHANGED`) the form asks to
 * reload instead of overwriting their change.
 */
export function ChildSection({
  title,
  editable,
  schema,
  defaultValues,
  fields,
  onSave,
  onReload,
  children,
}: {
  title: string;
  editable: boolean;
  schema: z.ZodType<FieldValues, FieldValues>;
  defaultValues: ChildFormValues;
  fields: (form: UseFormReturn<ChildFormValues>) => ReactNode;
  onSave: (values: ChildFormValues) => Promise<void>;
  onReload: () => Promise<void>;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const headingId = `section-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id={headingId}>{title}</h2>
        </CardTitle>
        {editable && !editing ? (
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Edit ${title}`}
              onClick={() => {
                setEditing(true);
              }}
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {editing ? (
          <SectionForm
            title={title}
            schema={schema}
            defaultValues={defaultValues}
            fields={fields}
            onSave={async (values) => {
              await onSave(values);
              setEditing(false);
            }}
            onCancel={() => {
              setEditing(false);
            }}
            onReload={async () => {
              await onReload();
              setEditing(false);
            }}
          />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function SectionForm({
  title,
  schema,
  defaultValues,
  fields,
  onSave,
  onCancel,
  onReload,
}: {
  title: string;
  schema: z.ZodType<FieldValues, FieldValues>;
  defaultValues: ChildFormValues;
  fields: (form: UseFormReturn<ChildFormValues>) => ReactNode;
  onSave: (values: ChildFormValues) => Promise<void>;
  onCancel: () => void;
  onReload: () => Promise<void>;
}) {
  const [stale, setStale] = useState(false);
  const form = useForm<ChildFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<ChildFormValues>,
    defaultValues,
  });
  const {
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;
  return (
    <form
      noValidate
      aria-label={`Edit ${title}`}
      className="space-y-6"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSave({ ...defaultValues, ...values });
        } catch (error) {
          if (error instanceof QueryHttpError) {
            if (error.code === "CHILD_CHANGED") {
              setStale(true);
              return;
            }
            const field = fieldForError(error.code, error.details);
            if (field != null) {
              setError(field as Path<ChildFormValues>, {
                message: error.message,
              });
              return;
            }
          }
          setError("root", {
            message:
              error instanceof QueryHttpError && error.message !== ""
                ? error.message
                : "Could not save. Please try again.",
          });
        }
      })}
    >
      {stale ? (
        <Alert variant="destructive">
          <AlertTitle>Someone else saved this Child</AlertTitle>
          <AlertDescription>
            Reload to see their change, then make yours again.
          </AlertDescription>
          <AlertAction>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void onReload();
              }}
            >
              Reload
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      <FormAlert message={errors.root?.message} />
      {fields(form)}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting || stale}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
