"use client";

import { useActiveCompany } from "@repo/auth/construction/react";
import { ArrowRight, SearchIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@repo/ui/components/input";
import { PageWatermark } from "@repo/ui/components/page-watermark";

import { APP_NAV_ICONS } from "./app-nav-icons";
import type { AreaNavGroup } from "./area-nav-menu";
import {
  HOME_LABEL,
  filterMainMenu,
  mainMenuAreas,
  sidebarHomePath,
  type MainMenuAccess,
  type MainMenuArea,
} from "./main-menu-areas";
import { menuQuery, noMatchMessage } from "./menu-filter";
import { readMenuLayout, useMenuLayout } from "./menu-layout";

/**
 * Home (ADR CM-0039): the main menu on one page, in the full-page menu
 * layout only. In the sidebar layout the menu is already beside the page,
 * so Home shows nothing and opens the Dashboard (Projects without
 * Dashboard Read): the User never sees the menu twice.
 */
export function HomeMenu(access: MainMenuAccess) {
  const layout = useMenuLayout();
  const router = useRouter();
  const sidebarHome = sidebarHomePath(access.canOpenDashboard);
  useEffect(() => {
    // The stored choice, not `layout`: while the page hydrates the hook
    // says `sidebar` for everyone, and a User who picked the full page
    // must stay here.
    if (readMenuLayout() === "sidebar") router.replace(sidebarHome);
  }, [layout, router, sidebarHome]);

  if (layout === "sidebar") return null;
  return <MainMenuPage {...access} />;
}

/**
 * The one-page areas (Dashboard, Projects, Settings) are cards; Human
 * Resources, Workspace and Masters are blocks with their groups and one
 * tile per entry. It renders the sidebar's list (`mainMenuAreas`) under the
 * sidebar's search rule, so the two never differ. Every tile is a link to
 * its page.
 */
function MainMenuPage(access: MainMenuAccess) {
  const { company } = useActiveCompany();
  const [query, setQuery] = useState("");
  const rows = filterMainMenu(mainMenuAreas(access), menuQuery(query));
  const pages = rows.filter((row) => row.match == null);
  const areas = rows.filter((row) => row.match != null);

  return (
    <div className="w-full p-6">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="relative min-w-0 space-y-1">
            <PageWatermark text={HOME_LABEL} />
            <h1 className="text-3xl font-semibold tracking-tight">
              {HOME_LABEL}
            </h1>
            <p className="text-muted-foreground text-sm">
              {company == null
                ? "Everything in your Company, on one page."
                : `Everything in ${company.name}, on one page.`}
            </p>
          </div>
          <div className="relative w-full sm:w-80">
            <SearchIcon
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
            />
            <Input
              type="search"
              aria-label="Search menu"
              placeholder="Search menu…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              className="h-11 rounded-full pl-10 [&::-webkit-search-cancel-button]:appearance-none"
            />
          </div>
        </header>

        <nav aria-label="Main" className="space-y-8">
          {rows.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {noMatchMessage(query)}
            </p>
          )}
          {pages.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pages.map(({ area }) => (
                <li key={area.item.href} className="flex">
                  <PageCard area={area} />
                </li>
              ))}
            </ul>
          )}
          {areas.map(({ area, match }) => (
            <AreaBlock
              key={area.item.href}
              area={area}
              groups={match?.groups ?? []}
            />
          ))}
        </nav>
      </div>
    </div>
  );
}

/** The icon on its tinted square; it fills with the primary on hover or focus of the link around it. */
function IconChip({
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

const FOCUS_RING =
  "focus-visible:ring-ring/50 focus-visible:border-ring outline-none focus-visible:ring-3";

/** An area that is one page: its icon, name and what it holds. */
function PageCard({ area }: { area: MainMenuArea }) {
  return (
    <Link
      href={area.href}
      className={`group bg-card hover:border-primary/50 flex w-full items-start gap-4 rounded-2xl border p-5 transition-colors ${FOCUS_RING}`}
    >
      <IconChip icon={APP_NAV_ICONS[area.item.href]} size="lg" />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-base font-semibold">{area.item.label}</span>
        <span className="text-muted-foreground line-clamp-2 text-sm">
          {area.item.description}
        </span>
      </span>
    </Link>
  );
}

/**
 * An area with a submenu: its name (a link to the area's own page) and,
 * side by side, its groups, each a labelled run of tiles.
 */
function AreaBlock({
  area,
  groups,
}: {
  area: MainMenuArea;
  groups: readonly AreaNavGroup[];
}) {
  const Icon = APP_NAV_ICONS[area.item.href];
  const headingId = `home-area-${slug(area.item.label)}`;
  return (
    <section
      aria-labelledby={headingId}
      className="bg-card rounded-2xl border p-5 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl [&>svg]:size-[18px]"
        >
          <Icon />
        </span>
        <h2 id={headingId} className="min-w-0 text-lg font-semibold">
          <Link
            href={area.href}
            className={`group hover:text-primary inline-flex items-center gap-1.5 rounded-md ${FOCUS_RING}`}
          >
            {area.item.label}
            <ArrowRight
              aria-hidden="true"
              className="size-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          </Link>
        </h2>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-10 gap-y-6">
        {groups.map((group) => {
          const groupId = `${headingId}-${slug(group.label ?? "all")}`;
          return (
            <div key={group.label ?? "all"} className="min-w-0 max-sm:w-full">
              {group.label != null && (
                <h3
                  id={groupId}
                  className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.12em] uppercase"
                >
                  {group.label}
                </h3>
              )}
              <ul
                aria-labelledby={group.label == null ? headingId : groupId}
                className="grid grid-cols-3 gap-x-1 gap-y-4 sm:flex sm:flex-wrap"
              >
                {group.sections.map((section) => (
                  <li key={section.href} className="sm:w-24">
                    <Link
                      href={section.href}
                      className={`group flex flex-col items-center gap-2 rounded-xl px-1 py-1.5 text-center ${FOCUS_RING}`}
                    >
                      <IconChip icon={section.icon} size="md" />
                      <span className="text-foreground/85 group-hover:text-foreground line-clamp-2 text-[13px] leading-tight font-medium">
                        {section.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
