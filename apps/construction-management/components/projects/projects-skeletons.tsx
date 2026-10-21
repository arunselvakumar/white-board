"use client";

import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  MetricCardSkeleton,
  MetricGridSkeleton,
  SkeletonGroup,
  SkeletonText,
} from "@repo/ui/components/skeleton-kit";

import { PageHeader } from "@/components/app-shell/page-header";

import { KINDS } from "./project-amenities";

const PROJECTS_PATH = "/app/projects";

/*
 * Projects while they load (ADR-0047): the Projects home, the project
 * shell's header, a Project's home tiles and labour tiles, and the home
 * dialogs, Amenities. What is known without fetching renders for real.
 */

/** The Projects home list's columns: name, status, dates and progress. */
export const PROJECT_ROW_GRID =
  "md:grid md:grid-cols-[minmax(0,2fr)_8rem_minmax(0,1.3fr)] md:items-center md:gap-4";

const PROJECT_STATS = ["All Projects", "Ongoing", "On hold", "Completed"];
const WIDTHS = ["58%", "44%", "66%", "50%", "62%"];

function ProgressBarSkeleton() {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Skeleton className="h-1.5 w-full max-w-40 min-w-16 rounded-full" />
      <SkeletonText size="xs" width="2rem" />
    </div>
  );
}

/** The Projects home: its real header, the four totals and the list. */
export function ProjectsHomeSkeleton() {
  return (
    <div className="w-full p-4 sm:p-6">
      <div className="w-full max-w-7xl space-y-6">
        <PageHeader
          title="Projects"
          meta="Every site your Company builds: labour, attendance and payments are kept per Project."
          actions={
            <Link href={`${PROJECTS_PATH}/new`} className={buttonVariants()}>
              <Plus aria-hidden="true" />
              New Project
            </Link>
          }
        />
        <SkeletonGroup label="Loading Projects" className="space-y-6">
          <div className="@container">
            <MetricGridSkeleton
              labels={PROJECT_STATS}
              className="grid grid-cols-2 gap-3 sm:gap-4 @4xl:grid-cols-4"
            />
          </div>
          <section className="bg-card rounded-2xl border shadow-xs">
            <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
              <h2 className="text-base tracking-tight">Your Projects</h2>
              <Skeleton className="h-8 w-72 max-w-full rounded-md" />
            </header>
            <div className="px-2 pb-2">
              <div className="hidden items-center gap-1 border-b md:flex">
                <div
                  className={`text-muted-foreground flex-1 px-3 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase ${PROJECT_ROW_GRID}`}
                >
                  <span>Project</span>
                  <span>Status</span>
                  <span>Dates and progress</span>
                </div>
                <span className="size-8 shrink-0" />
              </div>
              <ul className="divide-border/70 divide-y">
                {WIDTHS.map((width, row) => (
                  <li key={row} className="flex items-center gap-1">
                    <div
                      className={`flex min-w-0 flex-1 flex-col gap-3 rounded-xl px-3 py-3 ${PROJECT_ROW_GRID}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Skeleton className="size-10 shrink-0 rounded-xl" />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <SkeletonText size="base" width={width} />
                          <SkeletonText size="xs" width="35%" />
                          <SkeletonText width="70%" />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-13 md:contents">
                        <div>
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <SkeletonText width="9rem" />
                          <ProgressBarSkeleton />
                        </div>
                      </div>
                    </div>
                    <Skeleton className="size-9 shrink-0 rounded-md" />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </SkeletonGroup>
      </div>
    </div>
  );
}

/**
 * The project shell's header while the Project loads: the name and its
 * facts are bars, Edit is the real link.
 */
export function ProjectShellHeaderSkeleton({ id }: { id: string }) {
  return (
    <header className="border-b px-6 py-3">
      <div className="flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="sr-only">Loading the Project</span>
            <SkeletonText size="lg" width="12rem" />
            <span className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <SkeletonText width="8rem" />
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`${PROJECTS_PATH}/${encodeURIComponent(id)}/edit`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Pencil aria-hidden="true" />
            Edit
          </Link>
          <Skeleton className="size-9 rounded-md" />
        </div>
      </div>
    </header>
  );
}

/** A Project home's module tiles: icon, label and two lines of description. */
export function ProjectHomeTilesSkeleton() {
  return (
    <SkeletonGroup
      label="Loading modules"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="bg-card flex w-full min-w-0 flex-col gap-3 rounded-xl border p-4"
        >
          <Skeleton className="size-9 rounded-lg" />
          <span className="min-w-0 space-y-1">
            <SkeletonText size="base" width={WIDTHS[index % WIDTHS.length]} />
            <SkeletonText size="xs" width="90%" />
            <SkeletonText size="xs" width="60%" />
          </span>
        </div>
      ))}
    </SkeletonGroup>
  );
}

const LABOUR_TILES = [
  "Labours present",
  "Vendor heads",
  "Owed to Labours",
  "Owed to vendors",
];

/** Labour today on a Project's home: four figures, then the 14-day chart. */
export function ProjectLabourTilesSkeleton() {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Labour today</h2>
      <SkeletonGroup
        label="Loading labour today"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {LABOUR_TILES.map((label) => (
          <MetricCardSkeleton key={label} label={label} />
        ))}
        <div className="bg-card rounded-xl border p-4 sm:col-span-2 lg:col-span-4">
          <p className="text-sm font-semibold">Labours present, last 14 days</p>
          <Skeleton className="mt-4 h-28 w-full rounded-md" />
          <SkeletonText size="xs" width="100%" className="mt-1" />
        </div>
      </SkeletonGroup>
    </section>
  );
}

/** A ticked check list: Hide / show modules, Amenities. */
export function ModuleCheckListSkeleton({
  label = "Loading modules",
}: {
  label?: string;
}) {
  return (
    <SkeletonGroup label={label}>
      <ul className="bg-card divide-y rounded-xl border">
        {WIDTHS.slice(0, 4).map((width, row) => (
          <li key={row} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-4 shrink-0 rounded-[4px]" />
            <SkeletonText width={width} />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** The Arrange tiles list: icon, label, move up and down. */
export function TileOrderSkeleton() {
  return (
    <SkeletonGroup label="Loading tiles">
      <ol className="bg-card divide-y rounded-xl border">
        {WIDTHS.slice(0, 4).map((width, row) => (
          <li key={row} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="size-4 shrink-0 rounded-sm" />
            <span className="min-w-0 flex-1">
              <SkeletonText width={width} />
            </span>
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="size-7 rounded-md" />
          </li>
        ))}
      </ol>
    </SkeletonGroup>
  );
}

/** Amenities and Common Developments: the real headings over tick lists. */
export function ProjectAmenitiesSkeleton() {
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
            <section
              key={kind.kind}
              className="bg-card min-w-0 space-y-3 rounded-xl border p-4 sm:p-6"
            >
              <div className="space-y-1">
                <h2 className="font-semibold">{kind.title}</h2>
                <p className="text-muted-foreground text-sm">{kind.hint}</p>
              </div>
              <ModuleCheckListSkeleton label={`Loading ${kind.title}`} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

const FORM_CARD = "bg-card rounded-xl border";

/** A `FormCard` / `CollapsibleFormCard` header: icon square and the real title. */
function FormCardHeaderSkeleton({
  title,
  closed = false,
}: {
  title: string;
  closed?: boolean;
}) {
  return (
    <div
      className={
        closed
          ? "flex items-center gap-3 px-4 py-3 sm:px-5"
          : "flex items-center gap-3 border-b px-4 py-3 sm:px-5"
      }
    >
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <span className="text-base font-semibold">{title}</span>
      {closed ? <SkeletonText width="5rem" className="ml-auto" /> : null}
    </div>
  );
}

/**
 * The Project form while the Project or the Projects list loads: the open
 * Project card with its real labels, the closed Client, Contract and
 * Additional details cards, and the buttons.
 */
export function ProjectFormSkeleton() {
  return (
    <SkeletonGroup label="Loading the Project" className="space-y-4">
      <div className={FORM_CARD}>
        <FormCardHeaderSkeleton title="Project" />
        <div className="space-y-4 px-4 pt-4 pb-5 sm:px-5">
          <div className="flex items-center gap-3 border-b pb-4">
            <Skeleton className="size-16 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1">
              <span className="text-sm font-medium">Project logo</span>
              <SkeletonText size="xs" width="60%" />
            </div>
          </div>
          <FormSkeleton
            columns={2}
            actions={0}
            gridClassName="gap-4"
            controlClassName="h-10"
            fields={[
              { label: "Project name", wide: true },
              { label: "Project Type", control: "select" },
              { label: "Status", control: "select" },
              { label: "Start date" },
              { label: "Expected completion" },
              { label: "State", control: "select" },
              { label: "Project address", wide: true },
            ]}
          />
        </div>
      </div>
      {["Client", "Contract", "Additional details"].map((title) => (
        <div key={title} className={FORM_CARD}>
          <FormCardHeaderSkeleton title={title} closed />
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-20" />
      </div>
    </SkeletonGroup>
  );
}

/** New Project: the real header over the form skeleton. */
export function NewProjectSkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Projects", href: PROJECTS_PATH }}
          title="New Project"
          meta="Name it now; client, contract and dates can follow."
        />
        <ProjectFormSkeleton />
      </div>
    </div>
  );
}

/** Edit Project inside the project shell: the real heading over the form skeleton. */
export function EditProjectSkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-8">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Edit Project</h2>
          <ProjectFormSkeleton />
        </section>
      </div>
    </div>
  );
}
