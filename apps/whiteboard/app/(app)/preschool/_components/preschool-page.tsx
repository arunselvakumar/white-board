"use client";

import type { ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";

import {
  PageHeader,
  type PageHeaderBack,
} from "@/app/(app)/_components/app-shell/page-header";

import { useActiveCentre } from "./active-centre-provider";

/**
 * A Preschool page: padding, width and `PageHeader`. `width="form"` is the
 * add and edit width from AGENTS.md (`max-w-4xl`); lists use the full width.
 * With several Centres, the header's meta line names the active Centre unless
 * the page passes its own `meta` (`null` for none).
 */
export function PreschoolPage({
  title,
  meta,
  back,
  actions,
  leading,
  watermark,
  width = "full",
  children,
}: {
  title: string;
  meta?: ReactNode;
  back?: PageHeaderBack;
  actions?: ReactNode;
  leading?: ReactNode;
  watermark?: string;
  width?: "full" | "form";
  children?: ReactNode;
}) {
  const { centre, centres } = useActiveCentre();
  const shownMeta =
    meta === undefined ? (centres.length > 1 ? centre.name : undefined) : meta;

  return (
    <div
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col",
        width === "form" ? "p-6" : "p-4 sm:p-6",
      )}
    >
      <div
        className={cn(
          "flex w-full min-w-0 flex-col gap-6",
          width === "form" && "max-w-4xl",
        )}
      >
        <PageHeader
          title={title}
          meta={shownMeta ?? undefined}
          back={back}
          actions={actions}
          leading={leading}
          watermark={watermark}
        />
        {children}
      </div>
    </div>
  );
}
