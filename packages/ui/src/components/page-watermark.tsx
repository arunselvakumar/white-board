"use client";

import { cn } from "cn";
import { useLayoutEffect, useRef } from "react";

/**
 * What a page's `<main>` needs for the PageWatermark inside it: a stacking
 * context, so the name paints above the shell's background, and a horizontal
 * clip, so a long name is cut at the page's edge. Every shell layout uses it,
 * and so do the Storybook previews. Import it from Client Components only,
 * as this file is one: a Server Component would get a reference, not the
 * string.
 */
const PAGE_WATERMARK_HOST_CLASS = "isolate overflow-x-clip";

/**
 * The drift that is running: its page, when it began (`performance.now()`),
 * and how many watermarks are showing it.
 */
let drift: { pathname: string; startedAt: number; mounted: number } | null =
  null;

/**
 * A page's name drawn large and faint behind its heading; it drifts in from
 * the left as the page appears.
 *
 * - Give the heading's box `relative`: the watermark fills it and centres the
 *   name on it.
 * - It paints below the page's content (`-z-10`), so the page's `<main>`
 *   carries `PAGE_WATERMARK_HOST_CLASS`.
 * - The name is wider than the box. `contain-layout` makes that overflow
 *   paint only, so it never adds a scrollbar or widens a parent.
 * - The name is CSS generated content, not a text node: queries by text, find
 *   in page and copy see the heading only.
 * - A page that swaps a skeleton for its loaded screen mounts the watermark
 *   twice. The second one joins the drift where the first one was instead of
 *   starting over. A page left with no watermark ends its drift, so the name
 *   drifts in again when the page comes back.
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
      drift = { pathname, startedAt: now, mounted: 0 };
    }
    const joined = drift;
    joined.mounted += 1;
    if (ref.current != null) {
      ref.current.style.animationDelay = `${joined.startedAt - now}ms`;
    }
    return () => {
      joined.mounted -= 1;
      // A skeleton and the screen that replaces it swap in one commit, and
      // this cleanup runs before the new watermark mounts. So the count is
      // read once the commit is over.
      queueMicrotask(() => {
        if (drift === joined && joined.mounted === 0) drift = null;
      });
    };
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

export { PAGE_WATERMARK_HOST_CLASS, PageWatermark };
