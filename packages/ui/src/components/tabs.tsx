"use client";

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

// Aceternity's Animated Tabs: no track, just labels, and a pill behind the
// active one that springs across when another tab is picked.
const tabsListVariants = cva(
  "group/tabs-list relative isolate inline-flex w-fit items-center justify-center gap-1 text-muted-foreground group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:items-stretch",
  {
    variants: {
      variant: {
        default: "",
        line: "",
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
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        data-slot="tabs-indicator"
        renderBeforeHydration
        className={cn(
          "ease-spring absolute top-0 left-0 -z-1 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) translate-y-(--active-tab-top) transition-[translate,width,height] duration-600 motion-reduce:transition-none",
          "group-data-[variant=default]/tabs-list:bg-foreground/8 dark:group-data-[variant=default]/tabs-list:bg-foreground/10 group-data-[variant=default]/tabs-list:rounded-full",
          "group-data-[variant=line]/tabs-list:border-primary group-data-[orientation=horizontal]/tabs:group-data-[variant=line]/tabs-list:border-b-2 group-data-[orientation=vertical]/tabs:group-data-[variant=line]/tabs-list:border-r-2",
        )}
      />
    </TabsPrimitive.List>
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 data-active:text-foreground relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:data-active:text-primary group-data-[variant=line]/tabs-list:rounded-none",
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

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
