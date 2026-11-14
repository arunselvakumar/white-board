import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";

/**
 * One person or party in a Teams section. With `href` the whole row opens
 * their page (ADR CM-0044 §1): the name is the row's only link, stretched
 * over it, so the link is announced by the name alone. `actions` sit above
 * the link and stay targets of their own; badges are part of the link's
 * area.
 */
export function TeamRow({
  name,
  href,
  detail,
  badges,
  actions,
  className,
}: {
  name: string;
  /** Null when the viewer may not open the page. */
  href: string | null;
  detail?: string | null;
  badges?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <li
      className={cn(
        "relative flex min-w-0 items-center gap-3 px-4 py-3",
        href != null &&
          "hover:bg-muted/50 has-[a:focus-visible]:ring-ring/50 transition-colors has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-inset",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        {href == null ? (
          <span className="block truncate text-sm font-medium">{name}</span>
        ) : (
          <Link
            href={href}
            className="block truncate text-sm font-medium outline-none after:absolute after:inset-0"
          >
            {name}
          </Link>
        )}
        {detail != null && detail !== "" && (
          <span className="text-muted-foreground block truncate text-xs">
            {detail}
          </span>
        )}
      </span>
      {badges}
      {actions != null && actions !== false && (
        <span className="relative z-10 flex shrink-0 items-center">
          {actions}
        </span>
      )}
      {href != null && (
        <ChevronRight
          aria-hidden="true"
          className="text-muted-foreground size-4 shrink-0"
        />
      )}
    </li>
  );
}
