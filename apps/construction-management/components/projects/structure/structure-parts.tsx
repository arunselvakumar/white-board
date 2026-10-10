"use client";

import { ArrowLeft, Lock, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { DomainError } from "@/src/shared-kernel/domain-error";
import { QueryHttpError } from "@/src/queries/http";

import type { EditorProblem } from "./wing-editor";

/** `/app/projects/{id}/wings` and the screens under it (CM-402). */
export function wingsPath(projectId: string): string {
  return `/app/projects/${encodeURIComponent(projectId)}/wings`;
}

export function wingPath(projectId: string, wingId: string): string {
  return `${wingsPath(projectId)}/${encodeURIComponent(wingId)}`;
}

/** A section's header inside the project shell: back link, title, actions. */
export function SectionHeader({
  back,
  title,
  meta,
  actions,
}: {
  back?: { label: string; href: string };
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {back == null ? null : (
        <Link
          href={back.href}
          className={buttonVariants({
            variant: "link",
            className:
              "text-muted-foreground hover:text-foreground h-auto justify-start gap-1.5 p-0 text-sm font-normal",
          })}
        >
          <ArrowLeft aria-hidden="true" />
          Back to {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-semibold tracking-tight break-words">
            {title}
          </h2>
          {meta == null ? null : (
            <p className="text-muted-foreground text-sm tabular-nums">{meta}</p>
          )}
        </div>
        {actions == null ? null : (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}

export function StructureEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action == null ? null : <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/** For a Team Member whose Permission Matrix leaves the section out. */
export function StructureNoAccess({ what }: { what: string }) {
  return (
    <div className="w-full max-w-5xl p-6">
      <StructureEmpty
        icon={Lock}
        title={`You don't have access to ${what}`}
        description="Your Permission Matrix does not include it. Ask the Owner if you need it."
      />
    </div>
  );
}

function rowOf(details: unknown): EditorProblem | null {
  if (typeof details !== "object" || details == null) return null;
  const { floorIndex, unitIndex } = details as Record<string, unknown>;
  if (typeof floorIndex !== "number") return null;
  return {
    floorIndex,
    unitIndex: typeof unitIndex === "number" ? unitIndex : undefined,
  };
}

/** A refused save as a message, the row it names and the error code. */
export function saveProblem(error: unknown): {
  code: string | null;
  message: string;
  row: EditorProblem | null;
} {
  if (error instanceof DomainError || error instanceof QueryHttpError)
    return {
      code: error.code,
      message: error.message,
      row: rowOf(error.details),
    };
  return {
    code: null,
    message: "Something went wrong. Please try again.",
    row: null,
  };
}
