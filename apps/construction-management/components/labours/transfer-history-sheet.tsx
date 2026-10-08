"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { labourTransfersQuery } from "@/src/queries/labours";

/** `2026-10-04` → `4 Oct 2026`. */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** A labourer's Project history, newest first (CM-206). */
export function TransferHistorySheet({
  labour,
  onOpenChange,
}: {
  labour: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const history = useQuery({
    ...labourTransfersQuery(labour?.id ?? ""),
    enabled: labour != null,
  });
  const items = [...(history.data?.items ?? [])].reverse();
  return (
    <Sheet open={labour != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Transfer history</SheetTitle>
          <SheetDescription>{labour?.name}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {history.isPending && (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          )}
          {history.error != null && (
            <FormAlert message={fieldForCode(history.error, {}).message} />
          )}
          <ol aria-label="Transfers" className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg border px-3 py-2.5">
                <p className="text-muted-foreground text-xs">
                  {formatDate(item.transferDate)}
                </p>
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {item.fromProject == null ? (
                    <>Joined {item.toProject.name}</>
                  ) : (
                    <>
                      {item.fromProject.name}
                      <ArrowRight
                        aria-label="to"
                        className="text-muted-foreground size-3.5"
                      />
                      {item.toProject.name}
                    </>
                  )}
                </p>
                {item.remark != null && (
                  <p className="text-muted-foreground text-sm">{item.remark}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      </SheetContent>
    </Sheet>
  );
}
