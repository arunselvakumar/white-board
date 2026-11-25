"use client";

import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { ChildAvatar } from "@/app/(app)/preschool/_components/child-avatar";
import type { MeChildView } from "@/src/preschool/application/me";

/** Pick which Child the page is about; shown only with more than one. */
export function ChildSwitcher({
  items,
  selectedId,
  onSelect,
}: {
  items: readonly MeChildView[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (items.length < 2) return null;
  return (
    <div
      role="radiogroup"
      aria-label="Child"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 print:hidden"
    >
      {items.map((child) => {
        const selected = child.id === selectedId;
        return (
          <Button
            key={child.id}
            type="button"
            variant="outline"
            role="radio"
            aria-checked={selected}
            className={cn(
              "h-12 shrink-0 gap-2 rounded-full pr-4 pl-1.5",
              selected &&
                "border-primary bg-primary/10 hover:bg-primary/10 font-semibold",
            )}
            onClick={() => {
              onSelect(child.id);
            }}
          >
            <ChildAvatar
              childId={child.id}
              name={[child.firstName, child.lastName].filter(Boolean).join(" ")}
              photoUrl={child.photoUrl}
              className="size-9"
            />
            {child.firstName}
          </Button>
        );
      })}
    </div>
  );
}
