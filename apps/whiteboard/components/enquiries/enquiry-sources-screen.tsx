"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  addEnquirySource,
  enquiryQueries,
  renameEnquirySource,
  restoreEnquirySource,
  retireEnquirySource,
  type EnquirySource,
} from "@/src/queries/enquiries";
import { QueryHttpError } from "@/src/queries/http";

const sourceNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Source name is required")
    .max(80, "Use 80 characters or fewer"),
});

type SourceNameValues = z.infer<typeof sourceNameSchema>;

function messageOf(error: unknown, fallback: string): string {
  return error instanceof QueryHttpError && error.message.length > 0
    ? error.message
    : fallback;
}

export function EnquirySourcesScreen() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(enquiryQueries.sources());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingRetire, setPendingRetire] = useState<EnquirySource | null>(
    null,
  );
  const [rowError, setRowError] = useState<{
    id: string;
    message: string;
  } | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: enquiryQueries.key.all });
  const retire = useMutation({
    mutationFn: (source: EnquirySource) => retireEnquirySource(source.id),
    onSuccess: refresh,
    onError: (error, source) => {
      setRowError({
        id: source.id,
        message: messageOf(error, "Could not retire this Source."),
      });
    },
  });
  const restore = useMutation({
    mutationFn: (source: EnquirySource) => restoreEnquirySource(source.id),
    onSuccess: refresh,
    onError: (error, source) => {
      setRowError({
        id: source.id,
        message: messageOf(error, "Could not restore this Source."),
      });
    },
  });

  const sources = [...data.items].sort(
    (a, b) => Number(a.retired) - Number(b.retired),
  );
  const activeCount = sources.filter((source) => !source.retired).length;

  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-4xl flex-col gap-6">
        <PageHeader
          back={{ label: "Enquiries", href: "/enquiries" }}
          title="Enquiry Sources"
          meta="Where Enquiries come from. Each new Enquiry picks one."
        />
        <AddSourceForm onAdded={refresh} />
        <section
          aria-labelledby="sources-heading"
          className="bg-card overflow-hidden rounded-xl border shadow-sm"
        >
          <div className="flex items-baseline justify-between gap-3 border-b px-5 py-3">
            <h2 id="sources-heading" className="font-semibold">
              Sources
            </h2>
            <p className="text-muted-foreground text-xs">
              {activeCount} active
              {sources.length > activeCount
                ? ` · ${sources.length - activeCount} retired`
                : ""}
            </p>
          </div>
          {sources.length === 0 ? (
            <p className="text-muted-foreground p-5 text-sm">
              No Sources yet. Add the first one above.
            </p>
          ) : (
            <ul className="divide-y">
              {sources.map((source) => (
                <li key={source.id} className="px-5 py-3">
                  {renamingId === source.id ? (
                    <RenameSourceForm
                      source={source}
                      onDone={async (renamed) => {
                        if (renamed) await refresh();
                        setRenamingId(null);
                      }}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={
                            source.retired
                              ? "text-muted-foreground truncate"
                              : "truncate"
                          }
                        >
                          {source.name}
                        </span>
                        {source.retired ? (
                          <Badge variant="outline" className="text-xs">
                            Retired
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex gap-1">
                        {source.retired ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Restore ${source.name}`}
                            disabled={restore.isPending}
                            onClick={() => {
                              setRowError(null);
                              restore.mutate(source);
                            }}
                          >
                            Restore
                          </Button>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Rename ${source.name}`}
                              onClick={() => {
                                setRowError(null);
                                setRenamingId(source.id);
                              }}
                            >
                              Rename
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Retire ${source.name}`}
                              onClick={() => {
                                setRowError(null);
                                setPendingRetire(source);
                              }}
                            >
                              Retire
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  {rowError?.id === source.id ? (
                    <FormAlert message={rowError.message} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <AlertDialog
        open={pendingRetire != null}
        onOpenChange={(open) => {
          if (!open) setPendingRetire(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Retire {pendingRetire?.name ?? "this Source"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It won’t be offered for new Enquiries. Past Enquiries keep the
              name, and you can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                if (pendingRetire == null) return;
                const source = pendingRetire;
                setPendingRetire(null);
                retire.mutate(source);
              }}
            >
              Retire
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddSourceForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const add = useMutation({ mutationFn: addEnquirySource });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SourceNameValues>({
    resolver: zodResolver(sourceNameSchema),
    defaultValues: { name: "" },
  });
  return (
    <form
      noValidate
      aria-label="Add Source"
      className="space-y-1.5"
      onSubmit={handleSubmit(async (values) => {
        try {
          await add.mutateAsync(values.name);
          reset({ name: "" });
          await onAdded();
        } catch (error) {
          setError("name", {
            message: messageOf(error, "Could not add this Source."),
          });
        }
      })}
    >
      <Label htmlFor="new-source-name">New Source</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="new-source-name"
          className="h-10 sm:max-w-sm"
          placeholder="e.g. Newspaper ad"
          maxLength={80}
          aria-invalid={errors.name != null}
          {...register("name")}
        />
        <Button type="submit" className="h-10" disabled={isSubmitting}>
          <Plus aria-hidden="true" />
          Add Source
        </Button>
      </div>
      <FieldError message={errors.name?.message} />
    </form>
  );
}

function RenameSourceForm({
  source,
  onDone,
}: {
  source: EnquirySource;
  onDone: (renamed: boolean) => Promise<void>;
}) {
  const rename = useMutation({
    mutationFn: (name: string) => renameEnquirySource(source.id, name),
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SourceNameValues>({
    resolver: zodResolver(sourceNameSchema),
    defaultValues: { name: source.name },
  });
  const inputId = `rename-source-${source.id}`;
  return (
    <form
      noValidate
      aria-label={`Rename ${source.name}`}
      className="space-y-1.5"
      onSubmit={handleSubmit(async (values) => {
        if (values.name === source.name) {
          await onDone(false);
          return;
        }
        try {
          await rename.mutateAsync(values.name);
          await onDone(true);
        } catch (error) {
          setError("name", {
            message: messageOf(error, "Could not rename this Source."),
          });
        }
      })}
    >
      <Label htmlFor={inputId} className="sr-only">
        Source name
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={inputId}
          className="h-9 sm:max-w-sm"
          maxLength={80}
          autoFocus
          aria-invalid={errors.name != null}
          {...register("name")}
        />
        <div className="flex gap-1">
          <Button
            type="submit"
            size="sm"
            className="h-9"
            disabled={isSubmitting}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              void onDone(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
      <FieldError message={errors.name?.message} />
    </form>
  );
}
