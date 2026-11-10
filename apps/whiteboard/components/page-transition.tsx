"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";

import { pageTransitionHref } from "@/lib/page-transition";

import "./page-transition.css";

const NAVIGATION_TIMEOUT_MS = 1500;

type PendingNavigation = {
  from: string;
  finish: () => void;
};

let pendingNavigation: PendingNavigation | null = null;
let suppressEnter = false;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function waitForPathChange(from: string): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(finish, NAVIGATION_TIMEOUT_MS);

    function finish() {
      window.clearTimeout(timer);
      if (pendingNavigation?.finish === finish) {
        pendingNavigation = null;
      }
      resolve();
    }

    pendingNavigation = { from, finish };
  });
}

function playEnter(node: HTMLElement) {
  node.removeAttribute("data-enter");
  void node.getBoundingClientRect();
  node.setAttribute("data-enter", "true");
}

export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const pathnameRef = useRef(pathname);
  const initialPathname = useRef(pathname);
  const routerRef = useRef(router);

  useLayoutEffect(() => {
    pathnameRef.current = pathname;
    routerRef.current = router;

    if (pendingNavigation != null && pathname !== pendingNavigation.from) {
      pendingNavigation.finish();
    }

    if (pathname === initialPathname.current) {
      return;
    }
    initialPathname.current = pathname;

    const node = rootRef.current;
    if (node == null || suppressEnter || prefersReducedMotion()) {
      return;
    }

    playEnter(node);
    function clear(event: AnimationEvent) {
      if (event.target !== node) return;
      node?.removeAttribute("data-enter");
    }
    node.addEventListener("animationend", clear);
    return () => {
      node.removeEventListener("animationend", clear);
    };
  }, [pathname, router]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const element = event.target instanceof Element ? event.target : null;
      const anchor = element?.closest("a");
      if (anchor == null) return;

      let destination: URL;
      try {
        destination = new URL(anchor.href);
      } catch {
        return;
      }

      const href = pageTransitionHref({
        destination,
        current: new URL(window.location.href),
        reducedMotion: prefersReducedMotion(),
        download: anchor.hasAttribute("download"),
        target: anchor.getAttribute("target"),
        button: event.button,
        modified:
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
        defaultPrevented: event.defaultPrevented,
        canViewTransition: typeof document.startViewTransition === "function",
      });
      if (href == null) return;

      // Capture runs before Next.js Link. preventDefault makes Link skip its
      // own navigation so the view transition can wait for the new page.
      event.preventDefault();
      if (pendingNavigation != null) return;
      const from = pathnameRef.current;
      suppressEnter = true;
      try {
        const transition = document.startViewTransition(() => {
          const done = waitForPathChange(from);
          routerRef.current.push(href);
          return done;
        });
        transition.finished.then(
          () => {
            suppressEnter = false;
          },
          () => {
            suppressEnter = false;
          },
        );
      } catch {
        // startViewTransition throws before its callback when one is already
        // running, so this navigation has not been issued yet.
        suppressEnter = false;
        routerRef.current.push(href);
      }
    }

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  useEffect(() => {
    return () => {
      pendingNavigation?.finish();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={cn(
        "page-transition flex min-h-0 w-full flex-1 flex-col",
        className,
      )}
    >
      {children}
    </div>
  );
}
