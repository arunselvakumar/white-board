"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Fence, Waves, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { FormAlert } from "@/components/auth/form-alert";
import { CheckList } from "@/components/masters/check-list";
import { fieldForCode } from "@/lib/server-errors";
import {
  projectDevelopmentsQuery,
  useSaveProjectDevelopments,
  type ProjectDevelopments,
} from "@/src/queries/developments";

type Kind = "amenities" | "commonDevelopments";

const KINDS: readonly {
  kind: Kind;
  title: string;
  singular: string;
  href: string;
  icon: LucideIcon;
  hint: string;
}[] = [
  {
    kind: "amenities",
    title: "Amenities",
    singular: "Amenity",
    href: "/app/masters/amenities",
    icon: Waves,
    hint: "Facilities this Project offers.",
  },
  {
    kind: "commonDevelopments",
    title: "Common Developments",
    singular: "Common Development",
    href: "/app/masters/common-developments",
    icon: Fence,
    hint: "Shared works on this site.",
  },
];

function assignedIds(data: ProjectDevelopments, kind: Kind): string[] {
  return data[kind].assigned.map((item) => item.id);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** One kind: the checklist of what can be ticked, or an empty state. */
function KindSection({
  data,
  kind,
  value,
  onChange,
  canEdit,
}: {
  data: ProjectDevelopments;
  kind: (typeof KINDS)[number];
  value: string[];
  onChange: (ids: string[]) => void;
  canEdit: boolean;
}) {
  const { assigned, choices } = data[kind.kind];
  // What the Project has (disabled ones too), then what can be added.
  const rows = [
    ...assigned,
    ...choices.filter(
      (choice) => !assigned.some((row) => row.id === choice.id),
    ),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const headingId = `project-${kind.kind}`;
  return (
    <section
      aria-labelledby={headingId}
      className="bg-card min-w-0 space-y-3 rounded-xl border p-4 sm:p-6"
    >
      <div className="space-y-1">
        <h2 id={headingId} className="font-semibold">
          {kind.title}
        </h2>
        <p className="text-muted-foreground text-sm">{kind.hint}</p>
      </div>
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <kind.icon />
            </EmptyMedia>
            <EmptyTitle>No {kind.title} in Masters</EmptyTitle>
            <EmptyDescription>
              Add them under Masters, then tick the ones this Project has.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              href={kind.href}
              className={buttonVariants({ variant: "outline" })}
            >
              Open {kind.title}
            </Link>
          </EmptyContent>
        </Empty>
      ) : canEdit ? (
        <CheckList
          legend={kind.title}
          legendHidden
          idPrefix={kind.kind}
          options={rows.map((row) => ({
            id: row.id,
            label: row.name,
            trailing: row.disabled ? (
              <Badge variant="outline">Disabled</Badge>
            ) : undefined,
          }))}
          value={value}
          onChange={onChange}
        />
      ) : assigned.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          This Project has no {kind.title} yet.
        </p>
      ) : (
        <ul aria-label={kind.title} className="flex flex-wrap gap-2">
          {assigned.map((row) => (
            <li key={row.id}>
              <Badge variant={row.disabled ? "outline" : "secondary"}>
                {row.name}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A Project's Amenities and Common Developments (CM-404): tick what the
 * Project has and Save; site entries can then be located at them. A
 * disabled row it already has stays ticked and can be unticked, but not
 * ticked again. Read-only without the Project menu's Update flag.
 */
export function ProjectAmenities({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const { data } = useSuspenseQuery(projectDevelopmentsQuery(projectId));
  const save = useSaveProjectDevelopments(projectId);
  const [values, setValues] = useState<Record<Kind, string[]>>(() => ({
    amenities: assignedIds(data, "amenities"),
    commonDevelopments: assignedIds(data, "commonDevelopments"),
  }));
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const dirty = KINDS.some(
    ({ kind }) => !sameSet(values[kind], assignedIds(data, kind)),
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            Amenities and Common Developments
          </h2>
          <p className="text-muted-foreground text-sm">
            Site entries on this Project can be located at what you tick here.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {KINDS.map((kind) => (
            <KindSection
              key={kind.kind}
              data={data}
              kind={kind}
              value={values[kind.kind]}
              canEdit={canEdit}
              onChange={(ids) => {
                setSaved(false);
                setValues((current) => ({ ...current, [kind.kind]: ids }));
              }}
            />
          ))}
        </div>
        <FormAlert message={error} />
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={!dirty || save.isPending}
              onClick={() => {
                setError(undefined);
                save.mutate(
                  {
                    amenityIds: values.amenities,
                    commonDevelopmentIds: values.commonDevelopments,
                  },
                  {
                    onSuccess: (next) => {
                      setValues({
                        amenities: assignedIds(next, "amenities"),
                        commonDevelopments: assignedIds(
                          next,
                          "commonDevelopments",
                        ),
                      });
                      setSaved(true);
                    },
                    onError: (failure) => {
                      setError(fieldForCode(failure, {}).message);
                    },
                  },
                );
              }}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {saved && !dirty ? "Saved." : ""}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
