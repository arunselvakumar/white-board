"use client";

import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "cn";
import { ChevronRightIcon, CheckIcon } from "lucide-react";

/*
 * Looks and moves like our Select (React Bits' Glide Select): the menu pops
 * out of the trigger's corner, rows are 32 px with roomy padding, and one
 * highlight pill glides between rows under the pointer.
 */

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

const MENU_ROW =
  "[data-slot=dropdown-menu-item],[data-slot=dropdown-menu-sub-trigger],[data-slot=dropdown-menu-checkbox-item],[data-slot=dropdown-menu-radio-item]";

/**
 * Moves the highlight pill onto Base UI's highlighted row. Pointer moves
 * glide; opening and keyboard moves jump. When the pointer leaves the menu
 * the pill stays on the last row, so re-entry glides from there.
 */
function useMenuGlidePill() {
  return React.useCallback((pill: HTMLSpanElement | null) => {
    const popup = pill?.parentElement;
    if (!pill || !popup) return;

    let wasOpen = false;
    let current: HTMLElement | null = null;
    let input: "pointer" | "keyboard" = "pointer";

    const sync = () => {
      if (!popup.hasAttribute("data-open")) {
        wasOpen = false;
        return;
      }
      if (!wasOpen) {
        wasOpen = true;
        current = null;
        popup.removeAttribute("data-live");
        pill.style.transitionDuration = "0ms";
        pill.style.opacity = "0";
        void pill.getBoundingClientRect();
      }
      const row = popup.querySelector<HTMLElement>(
        `:is(${MENU_ROW})[data-highlighted]`,
      );
      if (!row || row === current) return;
      const jump = input !== "pointer" || pill.style.opacity !== "1";
      pill.style.transitionDuration = jump ? "0ms, 150ms" : "";
      pill.style.height = `${String(row.offsetHeight)}px`;
      pill.style.transform = `translateY(${String(row.offsetTop)}px)`;
      pill.style.opacity = "1";
      pill.dataset["variant"] = row.dataset["variant"] ?? "default";
      popup.setAttribute("data-live", "");
      current = row;
    };

    const onKeyDown = () => {
      input = "keyboard";
    };
    const onPointerMove = () => {
      input = "pointer";
    };
    const observer = new MutationObserver(sync);
    observer.observe(popup, {
      attributes: true,
      attributeFilter: ["data-open", "data-highlighted"],
      subtree: true,
    });
    popup.addEventListener("keydown", onKeyDown, true);
    popup.addEventListener("pointermove", onPointerMove);
    popup.addEventListener("pointerdown", onPointerMove);
    sync();

    return () => {
      observer.disconnect();
      popup.removeEventListener("keydown", onKeyDown, true);
      popup.removeEventListener("pointermove", onPointerMove);
      popup.removeEventListener("pointerdown", onPointerMove);
    };
  }, []);
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 6,
  className,
  children,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  const pillRef = useMenuGlidePill();
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "group/dropdown-menu bg-popover text-popover-foreground ring-foreground/10 relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-44 origin-(--transform-origin) overflow-x-hidden overflow-y-auto overscroll-contain rounded-[10px] p-1 shadow-[0_4px_16px_rgb(0_0_0/22%)] ring-1 outline-none data-closed:overflow-hidden",
            "data-open:animate-select-pop-in data-closed:animate-select-pop-out motion-reduce:data-open:animate-select-fade-in motion-reduce:data-closed:animate-select-fade-out",
            className,
          )}
          {...props}
        >
          <span
            ref={pillRef}
            aria-hidden
            data-slot="dropdown-menu-pill"
            className="bg-accent data-[variant=destructive]:bg-destructive/10 dark:data-[variant=destructive]:bg-destructive/20 pointer-events-none absolute inset-x-1 top-0 h-8 rounded-[6px] opacity-0 transition-[transform,opacity] duration-[220ms,150ms] ease-[var(--ease-glide),ease] motion-reduce:duration-[0ms,150ms]"
          />
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "text-muted-foreground px-2.5 py-1.5 text-xs font-medium data-inset:pl-8",
        className,
      )}
      {...props}
    />
  );
}

// Before the pill is live (the first frame), the highlighted row paints
// its own background; after that the pill does.
const menuRowClass =
  "relative z-1 flex min-h-8 w-full cursor-default items-center gap-2 rounded-[6px] py-1.5 pl-2.5 text-[13px] font-[500] outline-hidden transition-colors duration-150 select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground group-data-live/dropdown-menu:data-highlighted:bg-transparent data-inset:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-popover-foreground/60 data-highlighted:[&_svg:not([class*='text-'])]:text-accent-foreground";

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        menuRowClass,
        "group/dropdown-menu-item data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:text-destructive data-[variant=destructive]:*:[svg]:text-destructive pr-2.5",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        menuRowClass,
        "data-popup-open:bg-accent data-popup-open:text-accent-foreground pr-2",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-3.5!" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -5,
  side = "right",
  sideOffset = 4,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn("w-auto min-w-40", className)}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(menuRowClass, "pr-8", className)}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2.5 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon strokeWidth={2.5} className="size-[13px]" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(menuRowClass, "pr-8", className)}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2.5 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon strokeWidth={2.5} className="size-[13px]" />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "text-muted-foreground group-data-highlighted/dropdown-menu-item:text-accent-foreground ml-auto text-xs tracking-widest",
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
