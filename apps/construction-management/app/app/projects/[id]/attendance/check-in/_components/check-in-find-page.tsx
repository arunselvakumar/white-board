"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronDown, History, Search, SearchX, X } from "lucide-react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useDeferredValue, useEffect, useRef } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { projectBasePath } from "@/lib/project-nav";
import {
  checkInPeopleQuery,
  type CheckInKind,
  type CheckInPeople,
  type CheckInPerson,
} from "@/src/queries/check-ins";
import { projectHomeQuery } from "@/src/queries/project-home";

import { CheckInAvatar } from "./check-in-avatar";
import {
  checkInCapturePath,
  checkInLogPath,
  formatTime,
  KIND_ORDER,
  KIND_PLURALS,
  personLine,
} from "./check-in-format";
import { matchesPerson } from "./check-in-search";
import { CheckInPeopleSkeleton } from "./check-in-skeletons";

export const SEARCH_PLACEHOLDER = "Search by name, role, ID or phone";

export const READ_ONLY_LINE =
  "Your Role cannot check people in. You can see who is in and open the log.";

const GROUPS: Record<
  CheckInKind,
  keyof Pick<CheckInPeople, "siteEngineers" | "labours" | "vendors">
> = {
  site_engineer: "siteEngineers",
  labour: "labours",
  vendor: "vendors",
};

/**
 * Below `md` the search box sticks under the shell's phone bar (3.5 rem),
 * so it stays in reach while the list scrolls.
 */
const STICKY_ON_PHONE =
  "max-md:sticky max-md:top-[calc(3.5rem+var(--impersonation-bar,0px))] max-md:z-10";

/**
 * The hero of the screen: one large search box. It takes focus on arrival
 * where there is a fine pointer; on a phone, focus would open the keyboard
 * over the list.
 */
function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
  }, []);
  return (
    <div
      role="search"
      className={cn(
        "bg-background -mx-4 px-4 py-2 sm:mx-0 sm:px-0",
        STICKY_ON_PHONE,
      )}
    >
      <InputGroup className="bg-card h-14 rounded-xl shadow-xs md:h-16">
        <InputGroupAddon className="pl-4">
          <Search className="size-6" aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={input}
          type="search"
          aria-label="Search people"
          placeholder={SEARCH_PLACEHOLDER}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-full text-lg md:text-xl [&::-webkit-search-cancel-button]:appearance-none"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        {value === "" ? null : (
          <InputGroupAddon align="inline-end" className="pr-2">
            <InputGroupButton
              size="icon-sm"
              className="size-11 rounded-lg [&_svg]:size-5"
              aria-label="Clear the search"
              onClick={() => {
                onChange("");
                input.current?.focus();
              }}
            >
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
    </div>
  );
}

/** "In · 10:02 am" in the Present green, "Out · 1:05 pm" muted, else nothing. */
function StateChip({
  person,
  timeZone,
}: {
  person: CheckInPerson;
  timeZone: string;
}) {
  const { status, since } = person.state;
  if (status === "none" || since == null) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-7 shrink-0 border-0 px-2.5 text-sm tabular-nums",
        status === "in"
          ? "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {status === "in" ? "In" : "Out"} · {formatTime(since, timeZone)}
    </Badge>
  );
}

const CARD =
  "bg-card flex min-h-16 w-full items-center gap-3 rounded-xl border p-3 text-left";

function PersonCard({
  person,
  timeZone,
  href,
}: {
  person: CheckInPerson;
  timeZone: string;
  /** Null when the viewer may not check people in. */
  href: string | null;
}) {
  const line = personLine(person);
  const content = (
    <>
      <CheckInAvatar name={person.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">
          {person.name}
        </span>
        {line === "" ? null : (
          <span className="text-muted-foreground block truncate text-sm">
            {line}
          </span>
        )}
      </span>
      <StateChip person={person} timeZone={timeZone} />
    </>
  );
  return (
    <li>
      {href == null ? (
        <div className={CARD}>{content}</div>
      ) : (
        <Link
          href={href}
          className={cn(
            CARD,
            "hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-3 active:translate-y-px",
          )}
        >
          {content}
        </Link>
      )}
    </li>
  );
}

function Group({
  kind,
  people,
  shown,
  searching,
  timeZone,
  projectId,
  canCheckIn,
  canOpenTeams,
  q,
}: {
  kind: CheckInKind;
  people: readonly CheckInPerson[];
  shown: readonly CheckInPerson[];
  searching: boolean;
  timeZone: string;
  projectId: string;
  canCheckIn: boolean;
  canOpenTeams: boolean;
  q: string;
}) {
  const label = KIND_PLURALS[kind];
  const inCount = people.filter(
    (person) => person.state.status === "in",
  ).length;
  return (
    <Collapsible
      defaultOpen
      render={<section aria-label={label} className="space-y-3" />}
    >
      <h2>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              className="group/trigger -mx-2 h-12 w-[calc(100%+1rem)] justify-between px-2 text-base"
            />
          }
        >
          <span>
            {label}{" "}
            <span className="text-muted-foreground font-normal tabular-nums">
              {`· ${String(people.length)} · ${String(inCount)} in`}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="text-muted-foreground transition-transform group-data-[panel-open]/trigger:rotate-180"
          />
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent>
        {people.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No {label} on this Project.{" "}
            {canOpenTeams ? (
              <Link
                href={`${projectBasePath(projectId)}/teams`}
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                Add them on Teams
              </Link>
            ) : null}
          </p>
        ) : searching && shown.length === 0 ? (
          <p className="text-muted-foreground text-sm">No match</p>
        ) : (
          <ul
            aria-label={label}
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            {shown.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                timeZone={timeZone}
                href={
                  canCheckIn ? checkInCapturePath(projectId, person, q) : null
                }
              />
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function NoMatch({ q, onClear }: { q: string; onClear: () => void }) {
  return (
    <Empty className="bg-card border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX />
        </EmptyMedia>
        <EmptyTitle>Nobody matches “{q.trim()}”</EmptyTitle>
        <EmptyDescription>
          Check the spelling, or search by part of the phone number.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant="outline" onClick={onClear}>
          Clear search
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function People({
  projectId,
  q,
  onClear,
}: {
  projectId: string;
  q: string;
  onClear: () => void;
}) {
  const { data } = useSuspenseQuery(checkInPeopleQuery(projectId));
  // Teams is where people are put on the Project; offered only to members who may open it.
  const home = useQuery(projectHomeQuery(projectId));
  const canOpenTeams =
    home.data?.modules.some((module) => module.key === "resources") ?? false;
  const query = useDeferredValue(q);
  const searching = query.trim() !== "";
  const groups = KIND_ORDER.map((kind) => {
    const people = data[GROUPS[kind]];
    return {
      kind,
      people,
      shown: people.filter((person) => matchesPerson(person, query)),
    };
  });
  const nobody = searching && groups.every((group) => group.shown.length === 0);
  return (
    <div className="space-y-6">
      {data.canCheckIn ? null : (
        <p className="text-muted-foreground bg-muted rounded-lg px-4 py-3 text-sm">
          {READ_ONLY_LINE}
        </p>
      )}
      {nobody ? (
        <NoMatch q={query} onClear={onClear} />
      ) : (
        groups.map((group) => (
          <Group
            key={group.kind}
            kind={group.kind}
            people={group.people}
            shown={group.shown}
            searching={searching}
            timeZone={data.timeZone}
            projectId={projectId}
            canCheckIn={data.canCheckIn}
            canOpenTeams={canOpenTeams}
            q={q}
          />
        ))
      )}
    </div>
  );
}

/**
 * Check-In, find a person (ADR CM-0043 §7): one large search box, then the
 * Project's Site Engineers, Labours and Vendors with where each stands
 * today. The typed text is kept in the address (`?q=`), so Back from the
 * capture screen finds it again.
 */
export function CheckInFindPage({ projectId }: { projectId: string }) {
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const clear = () => {
    void setQ("");
  };
  return (
    <div className="w-full max-w-6xl space-y-4 p-4 sm:space-y-6 sm:p-6">
      <PageHeader
        title="Check-In"
        actions={
          <Link
            href={checkInLogPath(projectId)}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <History aria-hidden="true" />
            Log
          </Link>
        }
      />
      <SearchBox
        value={q}
        onChange={(value) => {
          void setQ(value);
        }}
      />
      <Suspense fallback={<CheckInPeopleSkeleton />}>
        <People projectId={projectId} q={q} onClear={clear} />
      </Suspense>
    </div>
  );
}
