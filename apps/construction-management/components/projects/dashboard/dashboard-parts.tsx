"use client";

import { Minus, Plus, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import { cn } from "@repo/ui/lib/utils";

import { formatPaise } from "@/components/money/money-input";
import {
  isDashboardSectionKey,
  type DashboardSectionKey,
} from "@/src/projects/domain/dashboard-sections";
import { QueryHttpError } from "@/src/queries/http";

import { SECTION_APPEARANCE } from "./section-appearance";
import { useSectionCollapse } from "./section-collapse";

/**
 * The Project Dashboard's building blocks (CM-412): a section card, a
 * labelled figure with its grey units, and the 403 check sections use to
 * name the permission they need. Their loading skeletons are in
 * `dashboard-skeletons.tsx`.
 */

/** The section a heading id names: dashboard sections use `dashboard-<key>`. */
function sectionKeyOf(id: string): DashboardSectionKey | null {
  const key = id.replace(/^dashboard-/, "");
  return key !== id && isDashboardSectionKey(key) ? key : null;
}

/** A section's coloured icon in its rounded chip; decorative. */
export function SectionIcon({
  sectionKey,
  className,
}: {
  sectionKey: DashboardSectionKey;
  className?: string;
}) {
  const { icon: Icon, tint } = SECTION_APPEARANCE[sectionKey];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
        tint,
        className,
      )}
    >
      <Icon strokeWidth={2} />
    </span>
  );
}

/**
 * A dashboard section card: its icon and title, then the aside and the
 * collapse (−) / expand (+) toggle on the right. Collapsed, only the
 * header shows. On the dashboard the member's choice is stored
 * (`section-collapse.tsx`) and a collapsed section skips its data; outside
 * it (stories) the card remembers it while mounted.
 */
export function Section({
  id,
  title,
  children,
  aside,
}: {
  id: string;
  title: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  const key = sectionKeyOf(id);
  const collapse = useSectionCollapse();
  const [ownOpen, setOwnOpen] = useState(true);
  const stored = key != null && collapse != null ? { key, collapse } : null;
  const open =
    stored == null ? ownOpen : !stored.collapse.isCollapsed(stored.key);
  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        if (stored == null) setOwnOpen(next);
        else stored.collapse.setCollapsed([stored.key], !next, stored.key);
      }}
      render={<section aria-labelledby={id} />}
      className="bg-card min-w-0 space-y-4 rounded-xl border p-4 sm:p-6"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {key == null ? null : <SectionIcon sectionKey={key} />}
          <h2 id={id} className="min-w-0 font-semibold break-words">
            {title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {open ? aside : null}
          <CollapsibleTrigger
            ref={(node: HTMLButtonElement | null) => {
              if (node != null && stored?.collapse.takeFocus(stored.key))
                node.focus();
            }}
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
              />
            }
          >
            {open ? <Minus aria-hidden="true" /> : <Plus aria-hidden="true" />}
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent id={`${id}-body`} className="space-y-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A labelled figure inside a section, in the metric cards' style: a soft
 * grey tile, the label small and grey, the figure larger in the
 * foreground colour. Put units in `Unit` so they read grey.
 */
export function Fact({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="bg-muted/50 flex min-w-0 flex-col gap-2.5 rounded-[0.625rem] p-3.5 sm:p-4">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs sm:text-sm">
        {Icon == null ? null : (
          <Icon
            aria-hidden="true"
            strokeWidth={1.5}
            className="size-4 shrink-0"
          />
        )}
        {label}
      </dt>
      <dd className="text-lg leading-tight font-normal tracking-tight break-words tabular-nums sm:text-xl">
        {children}
      </dd>
    </div>
  );
}

/** A unit beside a figure (`₹`, `/24`, `km`), lighter and grey. */
export function Unit({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground font-light">{children}</span>;
}

/** Rupees with a grey `₹`, without `.00` on whole rupees. */
export function Rupees({ paise }: { paise: number }) {
  const text = formatPaise(paise).replace(/\.00$/, "");
  return (
    <>
      {text.startsWith("-") ? "-" : null}
      <Unit>₹</Unit>
      {text.replace(/^-?₹/, "")}
    </>
  );
}

export function denied(error: unknown): boolean {
  return error instanceof QueryHttpError && error.status === 403;
}
