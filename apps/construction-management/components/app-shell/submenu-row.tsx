"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { CollapsibleTrigger } from "@repo/ui/components/collapsible";
import { SidebarMenuAction } from "@repo/ui/components/sidebar";

/**
 * Centred on the row, whatever its height. The sidebar places an action at
 * a fixed `top` for each button size, which sat it 4px high on our 40px
 * rows, so those are overridden too.
 */
const TOGGLE_CLASS =
  "top-1/2 right-2 -translate-y-1/2 peer-data-[size=default]/menu-button:top-1/2 peer-data-[size=lg]/menu-button:top-1/2 peer-data-[size=sm]/menu-button:top-1/2 data-panel-open:[&>svg]:rotate-90";

/**
 * A submenu entry: the sidebar's own sub-button is 28px with tight icon and
 * text gaps, which read squeezed under our 40px rows, so it gets a 36px row
 * and room between its icon and words.
 */
export const SUBMENU_BUTTON_CLASS =
  "text-sidebar-foreground/80 h-9 gap-2.5 rounded-lg px-2.5 [&>svg]:size-[17px]";

/** The open submenu: clear of the row above it and the entry below it. */
export const SUBMENU_CLASS = "mt-1.5 mb-2 gap-1 py-1";

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
