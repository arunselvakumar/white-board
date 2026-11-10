"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { CollapsibleTrigger } from "@repo/ui/components/collapsible";
import { SidebarMenuAction } from "@repo/ui/components/sidebar";

/**
 * Centred on the row, whatever its height. The sidebar places an action at
 * a fixed `top` for each button size, which sat it 4px high on our 40px
 * rows, so those are overridden too. Muted like a row's icon; white on
 * the primary pill of an active row.
 */
const TOGGLE_CLASS =
  "top-1/2 right-2 -translate-y-1/2 peer-data-[size=default]/menu-button:top-1/2 peer-data-[size=lg]/menu-button:top-1/2 peer-data-[size=sm]/menu-button:top-1/2 data-panel-open:[&>svg]:rotate-90 text-sidebar-foreground/65 peer-data-active/menu-button:text-sidebar-primary-foreground";

/**
 * A submenu entry (ADR-0049): a 36px row with room between its icon and
 * words (the sidebar's own sub-button is 28px), on the primary pill when
 * it is the current page, like a top-level row. No hover background of its
 * own: the `SidebarGlide` pill moves under it (ADR-0050).
 */
export const SUBMENU_BUTTON_CLASS =
  "text-sidebar-foreground/70 hover:bg-transparent hover:text-sidebar-foreground data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:font-semibold data-active:[&>svg]:text-sidebar-primary-foreground h-9 translate-x-0 gap-2.5 rounded-lg px-2.5 [&>svg]:size-[17px] [&>svg]:text-sidebar-foreground/65";

/**
 * The open submenu: indented under its row with no left rule (ADR-0049),
 * clear of the row above it and the entry below it.
 */
export const SUBMENU_CLASS =
  "mx-0 mt-1 mb-2 ml-7 translate-x-0 gap-1 border-0 px-0 py-1";

/**
 * A sidebar entry with a submenu, inside its `Collapsible`: the entry's
 * button and the `>` that folds the submenu out. The row is its own box,
 * so the open submenu below it does not move the arrow.
 */
export function SubmenuRow({
  button,
  label,
  open,
}: {
  button: ReactNode;
  label: string;
  open: boolean;
}) {
  return (
    <div className="relative">
      {button}
      <CollapsibleTrigger
        aria-label={open ? `Hide ${label} list` : `Show ${label} list`}
        render={<SidebarMenuAction className={TOGGLE_CLASS} />}
      >
        <ChevronRight className="transition-transform" />
      </CollapsibleTrigger>
    </div>
  );
}
