"use client";

import { ChevronDown } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";

function CardIcon({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4"
    >
      {children}
    </span>
  );
}

const CARD = "bg-card rounded-xl border";
const BODY = "px-4 pt-4 pb-5 sm:px-5";

/** A form section that is always open: icon, title, then its fields. */
export function FormCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={CARD}>
      <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-5">
        <CardIcon>{icon}</CardIcon>
        <h2 id={headingId} className="text-base font-semibold">
          {title}
        </h2>
      </div>
      <div className={BODY}>{children}</div>
    </section>
  );
}

/**
 * An optional form section. Closed, its header shows a one-line summary of
 * what is filled in ("Optional" when nothing is); the header is the button.
 */
export function CollapsibleFormCard({
  icon,
  title,
  summary,
  open,
  onOpenChange,
  children,
}: {
  icon: ReactNode;
  title: string;
  /** What is filled in, for the closed header; null when nothing is. */
  summary: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={CARD}>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <h2 className="text-base font-semibold">
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                className="hover:bg-muted/50 aria-expanded:hover:bg-muted/50 h-auto w-full justify-start gap-3 rounded-xl border-0 px-4 py-3 text-left text-base font-semibold whitespace-normal aria-expanded:bg-transparent data-[panel-open]:rounded-b-none sm:px-5 [&[data-panel-open]_[data-chevron]]:rotate-180"
              />
            }
          >
            <CardIcon>{icon}</CardIcon>
            <span id={headingId} className="shrink-0">
              {title}
            </span>
            <span className="text-muted-foreground ml-auto min-w-0 truncate text-right text-sm font-normal">
              {open ? null : (summary ?? "Optional")}
            </span>
            <ChevronDown
              aria-hidden="true"
              data-chevron=""
              className="text-muted-foreground shrink-0 transition-transform"
            />
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent className={`border-t ${BODY}`}>
          {children}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
