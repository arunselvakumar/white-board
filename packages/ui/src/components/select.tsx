"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react";

/*
 * Animation and spacing follow React Bits' Glide Select: the menu pops out of
 * the trigger's corner and one highlight pill glides between rows. Colours
 * come from the theme tokens, so light, dark and both apps' themes still work.
 */

type SelectSize = "sm" | "default" | "lg";

/** Closes that skip the 120 ms pop-out, as in Glide Select. */
const INSTANT_CLOSE_REASONS = new Set([
  "item-press",
  "escape-key",
  "focus-out",
]);

type SelectInput = "pointer" | "keyboard";

type SelectGlideContextValue = {
  size: SelectSize;
  setSize: (size: SelectSize) => void;
  instantClose: boolean;
  /** Whether the last highlight move came from the pointer or the keyboard. */
  getInput: () => SelectInput;
  setInput: (input: SelectInput) => void;
  setTrigger: (trigger: HTMLElement | null) => void;
};

const SelectGlideContext = React.createContext<SelectGlideContextValue | null>(
  null,
);

function Select<Value, Multiple extends boolean | undefined = false>({
  onOpenChange,
  onValueChange,
  ...props
}: SelectPrimitive.Root.Props<Value, Multiple>) {
  const [size, setSize] = React.useState<SelectSize>("default");
  const [instantClose, setInstantClose] = React.useState(false);
  const inputRef = React.useRef<SelectInput>("pointer");
  const triggerRef = React.useRef<HTMLElement | null>(null);
  // Stable, so the pill's observer is not rebuilt each time the menu closes.
  const getInput = React.useCallback(() => inputRef.current, []);
  const setInput = React.useCallback((input: SelectInput) => {
    inputRef.current = input;
  }, []);
  const setTrigger = React.useCallback((trigger: HTMLElement | null) => {
    triggerRef.current = trigger;
  }, []);
  const context = React.useMemo(
    () => ({ size, setSize, instantClose, getInput, setInput, setTrigger }),
    [size, instantClose, getInput, setInput, setTrigger],
  );

  return (
    <SelectGlideContext.Provider value={context}>
      <SelectPrimitive.Root<Value, Multiple>
        {...props}
        onOpenChange={(open, eventDetails) => {
          onOpenChange?.(open, eventDetails);
          if (eventDetails.isCanceled) return;
          setInstantClose(
            !open && INSTANT_CLOSE_REASONS.has(eventDetails.reason),
          );
        }}
        onValueChange={(value, eventDetails) => {
          onValueChange?.(value, eventDetails);
          if (eventDetails.isCanceled) return;
          // A pointer pick settles the trigger label in (opacity and blur).
          const trigger = triggerRef.current;
          if (
            trigger &&
            eventDetails.reason === "item-press" &&
            inputRef.current === "pointer"
          ) {
            trigger.removeAttribute("data-swap");
            // Reflow, so a second pick restarts the animation.
            void trigger.getBoundingClientRect();
            trigger.setAttribute("data-swap", "");
          }
        }}
      />
    </SelectGlideContext.Provider>
  );
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("grid scroll-my-1 gap-px", className)}
      {...props}
    />
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn(
        "group-data-swap/select-trigger:animate-select-value-swap flex flex-1 text-left motion-reduce:animate-none!",
        className,
      )}
      {...props}
    />
  );
}

const selectTriggerVariants = cva(
  "group/select-trigger border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground aria-invalid:ring-3 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 hover:bg-accent/60 data-popup-open:bg-accent/60 dark:hover:bg-accent/60 dark:data-popup-open:bg-accent/60 flex w-fit items-center justify-between gap-1.5 rounded-[6px] border bg-field pr-2 pl-2.5 font-[500] whitespace-nowrap outline-none select-none [transition:color_100ms_ease,background-color_100ms_ease,border-color_100ms_ease,box-shadow_100ms_ease,transform_160ms_var(--ease-glide)] focus-visible:ring-3 enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:enabled:active:scale-100 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      size: {
        default: "h-8 text-[13px]",
        sm: "h-7 text-[12px]",
        // 40 px, not Glide's 44, so it lines up with `h-10` Inputs in forms.
        lg: "h-10 text-[14px]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

function SelectTrigger({
  className,
  size = "default",
  children,
  ref,
  onAnimationEnd,
  ...props
}: SelectPrimitive.Trigger.Props &
  VariantProps<typeof selectTriggerVariants> & {
    ref?: React.Ref<HTMLButtonElement>;
  }) {
  const glide = React.useContext(SelectGlideContext);
  const setSize = glide?.setSize;
  const registerTrigger = glide?.setTrigger;
  const resolvedSize = size ?? "default";
  React.useLayoutEffect(() => {
    setSize?.(resolvedSize);
  }, [setSize, resolvedSize]);
  const setTrigger = React.useCallback(
    (element: HTMLButtonElement | null) => {
      registerTrigger?.(element);
      if (typeof ref === "function") return ref(element);
      if (ref) ref.current = element;
    },
    [registerTrigger, ref],
  );

  return (
    <SelectPrimitive.Trigger
      ref={setTrigger}
      data-slot="select-trigger"
      data-size={resolvedSize}
      className={cn(selectTriggerVariants({ size }), className)}
      onAnimationEnd={(event) => {
        if (event.animationName === "select-value-swap") {
          event.currentTarget.removeAttribute("data-swap");
        }
        onAnimationEnd?.(event);
      }}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon
            strokeWidth={2.5}
            className="text-foreground/55 ease-glide pointer-events-none size-3 transition-transform duration-200 group-data-popup-open/select-trigger:rotate-180 motion-reduce:transition-none"
          />
        }
      />
    </SelectPrimitive.Trigger>
  );
}

/**
 * Moves the highlight pill onto Base UI's highlighted row. Pointer moves
 * glide; opening and keyboard moves jump. When the pointer leaves the list
 * the pill stays on the last row, so re-entry glides from there.
 */
const pointerInput = (): SelectInput => "pointer";
function ignoreInput() {
  // Nothing to remember without the root.
}

function useGlidePill(
  getInput: () => SelectInput,
  setInput: (input: SelectInput) => void,
) {
  return React.useCallback(
    (pill: HTMLSpanElement | null) => {
      const list = pill?.parentElement;
      const popup = pill?.closest<HTMLElement>("[data-slot=select-content]");
      if (!pill || !list || !popup) return;

      let wasOpen = false;
      let current: HTMLElement | null = null;

      const sync = () => {
        if (!popup.hasAttribute("data-open")) {
          wasOpen = false;
          return;
        }
        if (!wasOpen) {
          wasOpen = true;
          current = null;
          list.removeAttribute("data-live");
          pill.style.transitionDuration = "0ms";
          pill.style.opacity = "0";
          void pill.getBoundingClientRect();
        }
        const row =
          list.querySelector<HTMLElement>(
            "[data-slot=select-item][data-highlighted]",
          ) ??
          (current
            ? null
            : list.querySelector<HTMLElement>(
                "[data-slot=select-item][data-selected]",
              ));
        if (!row || row === current) return;
        const jump = getInput() !== "pointer" || pill.style.opacity !== "1";
        pill.style.transitionDuration = jump ? "0ms, 150ms" : "";
        pill.style.height = `${row.offsetHeight}px`;
        pill.style.transform = `translateY(${row.offsetTop}px)`;
        pill.style.opacity = "1";
        list.setAttribute("data-live", "");
        current = row;
      };

      const onKeyDown = () => {
        setInput("keyboard");
      };
      const onPointerMove = () => {
        setInput("pointer");
      };
      const observer = new MutationObserver(sync);
      observer.observe(popup, {
        attributes: true,
        attributeFilter: ["data-open", "data-highlighted"],
        subtree: true,
      });
      document.addEventListener("keydown", onKeyDown, true);
      popup.addEventListener("pointermove", onPointerMove);
      popup.addEventListener("pointerdown", onPointerMove);
      sync();

      return () => {
        observer.disconnect();
        document.removeEventListener("keydown", onKeyDown, true);
        popup.removeEventListener("pointermove", onPointerMove);
        popup.removeEventListener("pointerdown", onPointerMove);
      };
    },
    [getInput, setInput],
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = false,
  "aria-label": listLabel,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  const glide = React.useContext(SelectGlideContext);
  // Outside our `Select` root every pill move counts as a pointer move.
  const pillRef = useGlidePill(
    glide?.getInput ?? pointerInput,
    glide?.setInput ?? ignoreInput,
  );

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-size={glide?.size ?? "default"}
          data-align-trigger={alignItemWithTrigger}
          data-instant-close={glide?.instantClose ? "" : undefined}
          className={cn(
            "bg-popover text-popover-foreground ring-foreground/10 relative isolate z-50 flex max-h-(--available-height) w-44 min-w-(--anchor-width) flex-col overflow-hidden rounded-[10px] p-1 shadow-[0_4px_16px_rgb(0_0_0/22%)] ring-1 outline-none",
            // Row height and font per trigger size.
            "[--select-font:13px] [--select-row:30px] data-[size=lg]:[--select-font:14px] data-[size=lg]:[--select-row:40px] data-[size=sm]:[--select-font:12px] data-[size=sm]:[--select-row:26px]",
            // Pop out of the trigger's corner, flipping with the menu.
            "origin-(--transform-origin) data-[side=bottom]:data-[align=center]:origin-top data-[side=bottom]:data-[align=end]:origin-top-right data-[side=bottom]:data-[align=start]:origin-top-left data-[side=top]:data-[align=center]:origin-bottom data-[side=top]:data-[align=end]:origin-bottom-right data-[side=top]:data-[align=start]:origin-bottom-left",
            "data-open:animate-select-pop-in data-closed:animate-select-pop-out motion-reduce:data-open:animate-select-fade-in motion-reduce:data-closed:animate-select-fade-out data-instant-close:animate-none! data-[align-trigger=true]:animate-none!",
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          {/* `aria-label` names the listbox, which assistive tech announces. */}
          <SelectPrimitive.List
            aria-label={listLabel}
            className="group/select-list relative grid min-h-0 flex-1 gap-px overflow-y-auto overscroll-contain"
          >
            <span
              ref={pillRef}
              aria-hidden
              data-slot="select-pill"
              className="bg-accent pointer-events-none absolute inset-x-0 top-0 h-(--select-row) rounded-[6px] opacity-0 transition-[transform,opacity] duration-[220ms,150ms] ease-[var(--ease-glide),ease] motion-reduce:duration-[0ms,150ms]"
            />
            {children}
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("text-muted-foreground px-2.5 py-1 text-xs", className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  tag,
  ...props
}: SelectPrimitive.Item.Props & {
  /** Secondary text after the label, such as a duration or a count. */
  tag?: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "group/select-item data-selected:bg-accent/60 relative z-1 flex h-(--select-row) w-full cursor-default items-center gap-2 rounded-[6px] pr-2 pl-2.5 text-(length:--select-font) outline-hidden transition-colors duration-150 select-none data-disabled:pointer-events-none data-disabled:opacity-50 group-data-live/select-list:data-selected:bg-transparent [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex min-w-0 flex-1 items-center gap-2 truncate font-[500] whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      {tag != null ? (
        <span
          data-slot="select-item-tag"
          className="text-popover-foreground/55 shrink-0 text-[length:calc(var(--select-font)_-_2px)]"
        >
          {tag}
        </span>
      ) : null}
      <CheckIcon
        aria-hidden
        strokeWidth={2.5}
        className="invisible size-[13px] group-data-selected/select-item:visible"
      />
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "bg-popover top-0 z-10 flex w-full cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bg-popover bottom-0 z-10 flex w-full cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
