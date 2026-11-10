import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";

/**
 * The module heading of a Site Diary or Hindrance page (CM-607), in the
 * style of the other M6 screens: a back link, then an `h2` (`text-lg` on
 * forms, `text-xl` on a detail), an optional line under it and actions.
 */
export function SiteRecordHeader({
  back,
  title,
  meta,
  actions,
  size = "form",
}: {
  back: { label: string; href: string };
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  size?: "form" | "detail";
}) {
  return (
    <div className="space-y-3">
      <Link
        href={back.href}
        className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {back.label}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2
            className={cn(
              "font-semibold break-words",
              size === "form" ? "text-lg" : "text-xl",
            )}
          >
            {title}
          </h2>
          {meta == null ? null : (
            <p className="text-muted-foreground text-sm">{meta}</p>
          )}
        </div>
        {actions == null ? null : (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
