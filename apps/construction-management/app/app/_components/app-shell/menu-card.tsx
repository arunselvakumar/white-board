import { ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import type { AppHref } from "@/lib/page-href";

/** The keyboard focus ring of the menu's cards and tiles. */
export const MENU_FOCUS_RING =
  "focus-visible:ring-ring/50 focus-visible:border-ring outline-none focus-visible:ring-3";

/** The icon on its tinted square; it fills with the primary on hover or focus of the link around it. */
export function MenuIconChip({
  icon: Icon,
  size,
}: {
  icon: LucideIcon;
  size: "md" | "lg";
}) {
  return (
    <span
      aria-hidden="true"
      className={`bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground group-focus-visible:bg-primary group-focus-visible:text-primary-foreground flex shrink-0 items-center justify-center transition-colors ${
        size === "lg"
          ? "size-12 rounded-2xl [&>svg]:size-6"
          : "size-14 rounded-2xl [&>svg]:size-6"
      }`}
    >
      <Icon />
    </span>
  );
}

/**
 * A screen as a card (ADR CM-0046): the icon, the screen's name and what
 * it holds. The whole card is the link; the arrow only says so.
 */
export function MenuCard({
  href,
  label,
  description,
  icon,
}: {
  href: AppHref;
  label: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className={`group bg-card hover:border-primary/50 flex w-full flex-col gap-4 rounded-2xl border p-5 transition-colors ${MENU_FOCUS_RING}`}
    >
      <span className="flex items-start justify-between gap-3">
        <MenuIconChip icon={icon} size="lg" />
        <ArrowUpRight
          aria-hidden="true"
          className="text-muted-foreground group-hover:text-primary group-focus-visible:text-primary size-5 transition-colors"
        />
      </span>
      <span className="min-w-0 space-y-1">
        <span className="block text-base font-semibold">{label}</span>
        <span className="text-muted-foreground line-clamp-3 block text-sm">
          {description}
        </span>
      </span>
    </Link>
  );
}
