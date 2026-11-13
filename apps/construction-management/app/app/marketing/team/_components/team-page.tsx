"use client";

import { formatMobile } from "@repo/auth/construction/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Contact, Target, UserPlus } from "lucide-react";
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
import { Progress } from "@repo/ui/components/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { marketingSection } from "@/lib/marketing-nav";
import {
  addMarketingPersonPath,
  personFollowUpsPath,
  personVisitsPath,
  teamQuery,
  type MarketingTeamPerson,
} from "@/src/queries/marketing-team";

import { monthWords } from "../../visits/_components/visit-parts";
import { VisitTargetDialog } from "./visit-target-dialog";

/** "12 Nov 2026" in the Company time zone, or "—". */
function lastVisit(at: string | null, timeZone: string): string {
  if (at == null) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(at));
}

/** "12 / 20" with a bar toward the target; "12" without one. */
function VisitsAgainstTarget({ person }: { person: MarketingTeamPerson }) {
  const { visitsThisMonth: done, target } = person;
  if (target == null)
    return <span className="tabular-nums">{String(done)}</span>;
  const percent =
    target === 0 ? 100 : Math.min(100, Math.round((done / target) * 100));
  return (
    <div className="min-w-24 space-y-1">
      <span className="tabular-nums">{`${String(done)} / ${String(target)}`}</span>
      <Progress
        value={percent}
        aria-label={`${person.name}: ${String(done)} of ${String(target)} Visits`}
      />
    </div>
  );
}

function Overdue({ count }: { count: number }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        count > 0
          ? "font-medium text-red-700 dark:text-red-300"
          : "text-muted-foreground",
      )}
    >
      {String(count)}
      {count > 0 && <span className="sr-only"> overdue</span>}
    </span>
  );
}

function Name({ person }: { person: MarketingTeamPerson }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="font-medium break-words">{person.name}</span>
      {person.isOwner && <Badge variant="secondary">Owner</Badge>}
    </span>
  );
}

function Status({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="outline">Active</Badge>
  ) : (
    <Badge variant="secondary" className="text-muted-foreground">
      Inactive
    </Badge>
  );
}

function PersonLinks({ person }: { person: MarketingTeamPerson }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      <Link
        href={personVisitsPath(person.memberId)}
        className="underline-offset-4 hover:underline"
        aria-label={`Visits of ${person.name}`}
      >
        Visits
      </Link>
      <Link
        href={personFollowUpsPath(person.memberId)}
        className="underline-offset-4 hover:underline"
        aria-label={`Follow-ups of ${person.name}`}
      >
        Follow-ups
      </Link>
    </span>
  );
}

function TargetButton({
  person,
  onClick,
}: {
  person: MarketingTeamPerson;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-label={`Set target for ${person.name}`}
      onClick={onClick}
    >
      <Target aria-hidden="true" />
      Set target
    </Button>
  );
}

const COLUMNS = [
  "Name",
  "Mobile",
  "Status",
  "Visits this month",
  "Follow-ups overdue",
  "Last Visit",
  "Open",
];

/**
 * Marketing People (PRD §3.2): this month's completed Visits against
 * target, Follow-ups overdue and the last Visit, each row linking to that
 * person's Visits and Follow-ups. With Team update a target is set per
 * person; with Add Staff a Marketing Person is added there.
 */
export function TeamPage({ timeZone }: { timeZone: string }) {
  const section = marketingSection("team");
  const { data: team } = useSuspenseQuery(teamQuery);
  const [editing, setEditing] = useState<MarketingTeamPerson | null>(null);
  const month = monthWords(team.month);

  const add = team.canAddPerson ? (
    <Link
      href={addMarketingPersonPath(team.addPersonRoleId)}
      className={buttonVariants()}
    >
      <UserPlus aria-hidden="true" />
      Add Marketing Person
    </Link>
  ) : undefined;

  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-6xl min-w-0 flex-col gap-6">
        <PageHeader
          title={section.title}
          meta={section.description}
          actions={add}
        />
        {team.people.length === 0 ? (
          <Empty className="bg-card border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Contact />
              </EmptyMedia>
              <EmptyTitle>No Marketing People yet</EmptyTitle>
              <EmptyDescription>
                Office Staff on a Role that adds Visits show here, with their
                Visits this month and Follow-ups overdue.
              </EmptyDescription>
            </EmptyHeader>
            {add != null && <EmptyContent>{add}</EmptyContent>}
          </Empty>
        ) : (
          <div className="min-w-0 space-y-3">
            <p className="text-muted-foreground text-sm">
              {`Visits completed in ${month}`}
            </p>
            <div className="bg-card hidden overflow-x-auto rounded-lg border md:block">
              <Table aria-label="Marketing People">
                <TableHeader>
                  <TableRow>
                    {COLUMNS.map((column) => (
                      <TableHead key={column} className="whitespace-nowrap">
                        {column}
                      </TableHead>
                    ))}
                    {team.canSetTargets && (
                      <TableHead>
                        <span className="sr-only">Target</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.people.map((person) => (
                    <TableRow key={person.memberId}>
                      <TableCell className="max-w-64">
                        <Name person={person} />
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {person.mobile == null
                          ? "—"
                          : formatMobile(person.mobile)}
                      </TableCell>
                      <TableCell>
                        <Status active={person.active} />
                      </TableCell>
                      <TableCell>
                        <VisitsAgainstTarget person={person} />
                      </TableCell>
                      <TableCell>
                        <Overdue count={person.followUpsOverdue} />
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {lastVisit(person.lastVisitAt, timeZone)}
                      </TableCell>
                      <TableCell>
                        <PersonLinks person={person} />
                      </TableCell>
                      {team.canSetTargets && (
                        <TableCell className="text-right">
                          <TargetButton
                            person={person}
                            onClick={() => {
                              setEditing(person);
                            }}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul aria-label="Marketing People" className="space-y-2 md:hidden">
              {team.people.map((person) => (
                <li
                  key={person.memberId}
                  className="bg-card min-w-0 space-y-2 rounded-lg border p-3"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <Name person={person} />
                    <Status active={person.active} />
                  </div>
                  {person.mobile != null && (
                    <p className="text-muted-foreground text-xs">
                      {formatMobile(person.mobile)}
                    </p>
                  )}
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground text-xs">
                        Visits this month
                      </dt>
                      <dd>
                        <VisitsAgainstTarget person={person} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-xs">
                        Follow-ups overdue
                      </dt>
                      <dd>
                        <Overdue count={person.followUpsOverdue} />
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground text-xs">
                        Last Visit
                      </dt>
                      <dd>{lastVisit(person.lastVisitAt, timeZone)}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <PersonLinks person={person} />
                    {team.canSetTargets && (
                      <TargetButton
                        person={person}
                        onClick={() => {
                          setEditing(person);
                        }}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {team.canSetTargets && editing != null && (
        <VisitTargetDialog
          person={editing}
          month={team.month}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
    </div>
  );
}
