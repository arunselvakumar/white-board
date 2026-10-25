"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:flex-row",
        className,
      )}
      {...props}
    />
  );
}

type TabsVariant = "default" | "pill";

const TabsVariantContext = React.createContext<TabsVariant>("default");

/*
 * `default`: an underline under the picked tab that springs across when
 * another is picked, and a faint one that grows under the tab the pointer
 * is on. Icon on the left, label on the right, as in the sidebar. `pill`
 * is the older Aceternity Animated Tabs look, kept for the sign-in forms.
 * A long row scrolls sideways instead of wrapping.
 */
const tabsListVariants = cva(
  "group/tabs-list relative isolate inline-flex w-fit max-w-full items-center gap-1 text-muted-foreground group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:items-stretch",
  {
    variants: {
      variant: {
        default:
          "overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        pill: "justify-center",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

// The underline sits 12 px in from each side, under the icon and label.
const tabsIndicatorVariants = cva(
  "absolute top-0 left-0 -z-1 ease-spring transition-[translate,width,height] motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary h-0.5 w-[calc(var(--active-tab-width)-1.5rem)] translate-x-[calc(var(--active-tab-left)+0.75rem)] translate-y-[calc(var(--active-tab-top)+var(--active-tab-height)-2px)] rounded-full duration-500 group-data-[orientation=vertical]/tabs:h-[calc(var(--active-tab-height)-1rem)] group-data-[orientation=vertical]/tabs:w-0.5 group-data-[orientation=vertical]/tabs:translate-x-0 group-data-[orientation=vertical]/tabs:translate-y-[calc(var(--active-tab-top)+0.5rem)]",
        pill: "bg-foreground/8 dark:bg-foreground/10 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) translate-y-(--active-tab-top) rounded-full duration-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  const resolved = variant ?? "default";
  return (
    <TabsVariantContext.Provider value={resolved}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={resolved}
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      >
        {children}
        <TabsPrimitive.Indicator
          data-slot="tabs-indicator"
          renderBeforeHydration
          className={tabsIndicatorVariants({ variant })}
        />
      </TabsPrimitive.List>
    </TabsVariantContext.Provider>
  );
}

const tabsTriggerVariants = cva(
  "group/tabs-trigger text-muted-foreground hover:text-foreground data-active:text-foreground focus-visible:ring-ring/50 relative inline-flex items-center text-sm font-medium whitespace-nowrap outline-none select-none group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // As in the sidebar: muted until hovered, and the picked tab's icon
        // in the primary colour. The icon lifts a little on hover and the
        // tab dips when pressed.
        default:
          "after:bg-foreground/15 h-10 shrink-0 gap-2 rounded-md px-3 [transition:color_150ms_ease,transform_160ms_var(--ease-glide)] after:pointer-events-none after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:transition-transform after:duration-300 after:ease-glide group-data-[orientation=vertical]/tabs:after:hidden hover:after:scale-x-100 focus-visible:ring-2 focus-visible:ring-inset active:scale-[0.97] data-active:after:opacity-0 motion-reduce:after:transition-none motion-reduce:active:scale-100 [&_svg]:transition-[color,translate] [&_svg]:duration-200 [&_svg]:ease-glide hover:[&_svg]:-translate-y-px data-active:[&_svg]:text-primary motion-reduce:hover:[&_svg]:translate-y-0",
        pill: "flex-1 justify-center gap-1.5 rounded-full px-4 py-2 transition-colors focus-visible:ring-[3px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  );
}

/** A number after a tab's label, such as how many rows a filter shows. */
function TabsCount({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="tabs-count"
      className={cn(
        "bg-muted text-muted-foreground group-data-active/tabs-trigger:bg-primary/10 group-data-active/tabs-trigger:text-primary min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold tabular-nums transition-colors duration-150",
        className,
      )}
      {...props}
    />
  );
}

// The picked panel slides in from the side of the tab that was picked;
// the first render (activation direction "none") does not animate.
function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "fade-in-0 not-data-[activation-direction=none]:animate-in data-[activation-direction=down]:slide-in-from-bottom-2 data-[activation-direction=left]:slide-in-from-left-2 data-[activation-direction=right]:slide-in-from-right-2 data-[activation-direction=up]:slide-in-from-top-2 flex-1 text-sm outline-none not-data-[activation-direction=none]:duration-300 not-data-[activation-direction=none]:ease-out motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsCount,
  TabsContent,
  tabsListVariants,
};
