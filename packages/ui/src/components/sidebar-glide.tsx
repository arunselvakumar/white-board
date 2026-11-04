"use client";

import * as React from "react";
import { cn } from "cn";

/**
 * The rows the pill follows: menu buttons and submenu buttons, unless they
 * are disabled.
 */
const ROW =
  "[data-sidebar=menu-button]:not([disabled]):not([aria-disabled=true]),[data-sidebar=menu-sub-button]:not([aria-disabled=true])";

/**
 * How long the pointer may rest off the rows (a gap between two rows, a
 * label, a disabled row, empty space) before the pill fades out. Crossing
 * the gap between two rows takes less, so that move still glides.
 */
const OFF_ROW_GRACE_MS = 150;

function rowOf(target: EventTarget | null, box: HTMLElement) {
  if (!(target instanceof Element)) return null;
  const row = target.closest<HTMLElement>(ROW);
  return row != null && box.contains(row) ? row : null;
}

/**
 * Moves the highlight pill under the pointer, as the dropdown menu's and
 * the Select's pills do (React Bits' Glide Select, ADR-0050). Moving from
 * one row to another glides; arriving from outside the rows, or by
 * keyboard, jumps and fades in; resting off the rows, or leaving the box,
 * fades it out where it was, so the row the pointer comes back to is
 * where it starts from. When the rows move under a resting pointer (a
 * submenu above them opens or folds) the pill is measured again.
 */
function useSidebarGlidePill() {
  return React.useCallback((pill: HTMLSpanElement | null) => {
    const box = pill?.parentElement;
    if (!pill || !box) return;

    let current: HTMLElement | null = null;
    let offRowTimer: ReturnType<typeof setTimeout> | undefined;

    const shown = () => pill.style.opacity === "1";
    const move = (row: HTMLElement, jump: boolean) => {
      const boxRect = box.getBoundingClientRect();
      const rect = row.getBoundingClientRect();
      pill.style.transitionDuration = jump ? "0ms, 150ms, 0ms, 0ms" : "";
      pill.style.width = `${String(rect.width)}px`;
      pill.style.height = `${String(rect.height)}px`;
      pill.style.transform = `translate(${String(rect.left - boxRect.left)}px, ${String(rect.top - boxRect.top)}px)`;
      pill.style.borderRadius = getComputedStyle(row).borderRadius;
      pill.style.opacity = "1";
      current = row;
    };
    const hide = () => {
      clearTimeout(offRowTimer);
      pill.style.opacity = "0";
    };
    const hideSoon = () => {
      clearTimeout(offRowTimer);
      offRowTimer = setTimeout(hide, OFF_ROW_GRACE_MS);
    };

    const onPointerOver = (event: PointerEvent) => {
      const row = rowOf(event.target, box);
      if (row == null) {
        if (shown()) hideSoon();
        return;
      }
      clearTimeout(offRowTimer);
      if (row === current && shown()) return;
      move(row, !shown());
    };
    const onPointerLeave = () => {
      hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      const row = rowOf(event.target, box);
      if (row?.matches(":focus-visible")) move(row, true);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !box.contains(event.relatedTarget)
      )
        hide();
    };
    // The rows moved (a submenu opened or folded): put the pill back on
    // the row it rests on, without a glide.
    const observer = new ResizeObserver(() => {
      if (current != null && shown() && current.isConnected)
        move(current, true);
    });
    observer.observe(box);

    box.addEventListener("pointerover", onPointerOver);
    box.addEventListener("pointerleave", onPointerLeave);
    box.addEventListener("focusin", onFocusIn);
    box.addEventListener("focusout", onFocusOut);
    return () => {
      clearTimeout(offRowTimer);
      observer.disconnect();
      box.removeEventListener("pointerover", onPointerOver);
      box.removeEventListener("pointerleave", onPointerLeave);
      box.removeEventListener("focusin", onFocusIn);
      box.removeEventListener("focusout", onFocusOut);
    };
  }, []);
}

/**
 * Wraps a run of sidebar menus so one highlight pill glides between their
 * rows on hover (ADR-0050). Rows inside it should draw no hover background
 * of their own; the active row keeps its solid pill, which paints over
 * this one. One `SidebarGlide` per scrolling region: the content and the
 * footer each get their own.
 */
function SidebarGlide({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const pillRef = useSidebarGlidePill();
  return (
    <div
      data-slot="sidebar-glide"
      className={cn("relative isolate flex min-h-0 flex-1 flex-col", className)}
      {...props}
    >
      <span
        ref={pillRef}
        aria-hidden
        data-slot="sidebar-glide-pill"
        className="bg-sidebar-accent pointer-events-none absolute top-0 left-0 z-0 h-10 w-full rounded-xl opacity-0 transition-[transform,opacity,width,height] duration-[220ms,150ms,220ms,220ms] ease-[var(--ease-glide),ease,var(--ease-glide),var(--ease-glide)] will-change-transform motion-reduce:duration-[0ms,150ms,0ms,0ms]"
      />
      {children}
    </div>
  );
}

export { SidebarGlide };
