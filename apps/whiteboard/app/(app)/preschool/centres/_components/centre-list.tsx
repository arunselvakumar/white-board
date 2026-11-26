"use client";

import { BuildingsIcon } from "@phosphor-icons/react/ssr";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";

import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import type { PreschoolCentre } from "@/src/queries/preschool/centres";

import { OWNERSHIP_LABEL } from "./centre-form";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function CentreCard({ centre }: { centre: PreschoolCentre }) {
  return (
    <li className="min-w-0">
      <Link
        href={`/preschool/centres/${centre.id}`}
        className="bg-card hover:border-primary/60 focus-visible:ring-ring/50 flex h-full min-w-0 flex-col gap-3 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{centre.name}</h2>
            <p className="text-muted-foreground text-sm">
              {centre.code}
              {centre.city == null ? null : ` · ${centre.city}`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {centre.status === "closed" ? (
              <Badge variant="destructive">Closed</Badge>
            ) : null}
            <Badge
              variant={
                centre.ownership === "franchised" ? "secondary" : "outline"
              }
            >
              {OWNERSHIP_LABEL[centre.ownership]}
            </Badge>
          </div>
        </div>
        <dl className="text-muted-foreground mt-auto grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs">Children</dt>
            <dd className="text-foreground font-medium tabular-nums">
              {centre.activeChildren}
            </dd>
          </div>
          <div>
            <dt className="text-xs">Classrooms</dt>
            <dd className="text-foreground font-medium tabular-nums">
              {centre.classrooms}
            </dd>
          </div>
          <div>
            <dt className="text-xs">Royalty</dt>
            <dd className="text-foreground font-medium tabular-nums">
              {centre.ownership === "franchised"
                ? `${centre.royaltyPercent}%`
                : "—"}
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}

/** The Owner's Centres, as cards. */
export function CentreList({
  centres,
  onAdd,
}: {
  centres: readonly PreschoolCentre[];
  onAdd: () => void;
}) {
  const franchised = centres.filter(
    (centre) => centre.ownership === "franchised",
  ).length;
  const addButton = (
    <Button type="button" onClick={onAdd}>
      <Plus aria-hidden="true" />
      Add Centre
    </Button>
  );
  return (
    <PreschoolPage
      title="Centres"
      meta={
        centres.length === 0
          ? null
          : `${plural(centres.length, "Centre", "Centres")} · ${franchised} Franchised`
      }
      actions={centres.length === 0 ? undefined : addButton}
    >
      {centres.length === 0 ? (
        <EmptyState
          className="border"
          icon={BuildingsIcon}
          tone="blue"
          title="No Centres yet"
          description="Add each branch or franchisee's unit as a Centre."
          actions={addButton}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {centres.map((centre) => (
            <CentreCard key={centre.id} centre={centre} />
          ))}
        </ul>
      )}
    </PreschoolPage>
  );
}
