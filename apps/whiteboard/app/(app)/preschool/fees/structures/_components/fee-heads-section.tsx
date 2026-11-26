"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@repo/ui/components/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { TableCard } from "@/app/(app)/_components/table-card";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { QueryHttpError } from "@/src/queries/http";
import {
  archiveFeeHead,
  createFeeHead,
  feeHeadsQueryOptions,
  feeKeys,
  restoreFeeHead,
  updateFeeHeadDetails,
  type PreschoolFeeHead,
} from "@/src/queries/preschool/fees";

const KIND_ITEMS = [
  { value: "recurring", label: "Recurring" },
  { value: "one_time", label: "One-time" },
] as const;

const KIND_LABEL = { recurring: "Recurring", one_time: "One-time" } as const;

const schema = z.object({
  name: z.string().trim().min(1, "Enter the Fee Head's name").max(100),
  kind: z.enum(["one_time", "recurring"]),
  royaltyBearing: z.boolean(),
  refundable: z.boolean(),
});

type Values = z.infer<typeof schema>;

function FeeHeadForm({
  head,
  onDone,
}: {
  head: PreschoolFeeHead | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: head?.name ?? "",
      kind: head?.kind ?? "recurring",
      royaltyBearing: head?.royaltyBearing ?? false,
      refundable: head?.refundable ?? false,
    },
  });
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          if (head == null) await createFeeHead(values);
          else await updateFeeHeadDetails(head.id, values);
          await queryClient.invalidateQueries({ queryKey: feeKeys.all });
          onDone();
        } catch (error) {
          if (error instanceof QueryHttpError) {
            if (error.code === "FEE_HEAD_NAME_IN_USE")
              setError("name", { message: error.message });
            else if (error.code === "FEE_HEAD_KIND_LOCKED")
              setError("kind", { message: error.message });
            else setError("root", { message: error.message });
            return;
          }
          setError("root", { message: "Could not save the Fee Head." });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="space-y-1.5">
        <Label htmlFor="fee-head-name" required>
          Name
        </Label>
        <Input
          id="fee-head-name"
          aria-required
          className="h-10"
          aria-invalid={errors.name != null}
          {...register("name")}
        />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fee-head-kind" required>
          Charged
        </Label>
        <Controller
          name="kind"
          control={control}
          render={({ field }) => (
            <Select
              items={[...KIND_ITEMS]}
              value={field.value}
              onValueChange={(value) => {
                if (value != null) field.onChange(value);
              }}
            >
              <SelectTrigger
                id="fee-head-kind"
                size="lg"
                aria-required
                className="w-full min-w-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError message={errors.kind?.message} />
      </div>
      {(
        [
          [
            "royaltyBearing",
            "Royalty-bearing",
            "Collections count towards a Franchised Centre's royalty.",
          ],
          ["refundable", "Refundable", "Returned when the Child leaves."],
        ] as const
      ).map(([name, label, hint]) => (
        <Controller
          key={name}
          name={name}
          control={control}
          render={({ field }) => (
            <div className="flex items-start gap-3">
              <Switch
                id={`fee-head-${name}`}
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                }}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor={`fee-head-${name}`}>{label}</Label>
                <p className="text-muted-foreground text-xs">{hint}</p>
              </div>
            </div>
          )}
        />
      ))}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Save Fee Head
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The Workspace's Fee Heads, for the Owner: add, edit, archive, restore. */
export function FeeHeadsSection() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    feeHeadsQueryOptions({ includeArchived: true }),
  );
  const [editing, setEditing] = useState<PreschoolFeeHead | "new" | null>(null);
  const toggle = useMutation({
    mutationFn: (head: PreschoolFeeHead) =>
      head.isArchived ? restoreFeeHead(head.id) : archiveFeeHead(head.id),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: feeKeys.all });
    },
  });
  return (
    <section aria-labelledby="fee-heads-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="fee-heads-heading" className="text-lg font-semibold">
            Fee Heads
          </h2>
          <p className="text-muted-foreground text-sm">
            The kinds of charge every Centre uses.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setEditing("new");
          }}
        >
          <Plus aria-hidden="true" />
          Add Fee Head
        </Button>
      </div>
      <FormAlert
        message={
          toggle.error instanceof QueryHttpError
            ? toggle.error.message
            : undefined
        }
      />
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fee Head</TableHead>
              <TableHead>Charged</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((head) => (
              <TableRow
                key={head.id}
                className={
                  head.isArchived ? "text-muted-foreground" : undefined
                }
              >
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{head.name}</span>
                    {head.royaltyBearing ? (
                      <Badge variant="secondary">Royalty-bearing</Badge>
                    ) : null}
                    {head.refundable ? (
                      <Badge variant="outline">Refundable</Badge>
                    ) : null}
                    {head.isArchived ? (
                      <Badge variant="outline">Archived</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{KIND_LABEL[head.kind]}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {head.isArchived ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${head.name}`}
                        onClick={() => {
                          setEditing(head);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={toggle.isPending}
                      aria-label={`${head.isArchived ? "Restore" : "Archive"} ${head.name}`}
                      onClick={() => {
                        toggle.mutate(head);
                      }}
                    >
                      {head.isArchived ? "Restore" : "Archive"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Add Fee Head" : "Edit Fee Head"}
            </DialogTitle>
            <DialogDescription>
              Archived Fee Heads cannot be added to new Fee Structures.
            </DialogDescription>
          </DialogHeader>
          {editing == null ? null : (
            <FeeHeadForm
              head={editing === "new" ? null : editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
