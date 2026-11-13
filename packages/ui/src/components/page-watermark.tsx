"use client";

import { cn } from "cn";
import { useLayoutEffect, useRef } from "react";

/** The page the drift is running on, and when it began (`performance.now()`). */
let drift: { pathname: string; startedAt: number } | null = null;

/**
 * A page's name drawn large and faint behind its heading; it drifts in from
 * the left as the page appears.
 *
 * - Give the heading's box `relative`: the watermark fills it and centres the
 *   name on it.
 * - It paints below the page's content (`-z-10`), so an ancestor without a
 *   background of its own has to be a stacking context (`isolate`). Both
 *   shells do that on `<main>`, and cut the name at the page's edge there.
 * - The name is wider than the box. `contain-layout` makes that overflow
 *   paint only, so it never adds a scrollbar or widens a parent.
 * - The name is CSS generated content, not a text node: queries by text, find
 *   in page and copy see the heading only.
 * - A page that swaps a skeleton for its loaded screen mounts the watermark
 *   twice. The second one joins the drift where the first one was instead of
 *   starting over.
 */
function PageWatermark({
  text,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const pathname = window.location.pathname;
    const now = performance.now();
    if (drift?.pathname !== pathname) {
      drift = { pathname, startedAt: now };
    }
    if (ref.current != null) {
      ref.current.style.animationDelay = `${drift.startedAt - now}ms`;
    }
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-slot="page-watermark"
      data-text={text}
      className={cn(
        "text-foreground/[0.045] animate-page-watermark pointer-events-none absolute inset-0 -z-10 flex items-center text-[4.5rem] leading-none font-semibold tracking-[-0.05em] whitespace-nowrap contain-layout select-none before:shrink-0 before:content-[attr(data-text)] motion-reduce:animate-none md:text-[6rem] print:hidden",
        className,
      )}
      {...props}
    />
  );
}

export { PageWatermark };
