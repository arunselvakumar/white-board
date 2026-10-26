"use client";

import { CircleCheck } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@repo/ui/lib/utils";

/**
 * What a new Company is shown while it is set up. The request does the work
 * in one go; these steps pace it so the Owner sees something happen.
 */
export const COMPANY_SETUP_STEPS = [
  "Creating your Company",
  "Setting up your database",
  "Provisioning your system",
  "Setting up master data",
  "Adding Roles and leave types",
  "Opening Cash and Bank accounts",
  "Getting your Projects ready",
] as const;

export const COMPANY_SETUP_STEP_MS = 1000;

/** Each row is this tall, and the list moves up one row per step. */
const ROW_PX = 40;

/**
 * Full-page loader after Create Company (Aceternity's Multi Step Loader,
 * without the close button: the Owner waits until the app opens). Calls
 * `onPlayed` once the last step has had its turn; it then stays on the last
 * step until the page leaves.
 */
export function CompanySetupLoader({
  stepMs = COMPANY_SETUP_STEP_MS,
  onPlayed,
}: {
  stepMs?: number;
  onPlayed?: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const last = COMPANY_SETUP_STEPS.length - 1;
  const played = useEffectEvent(() => onPlayed?.());

  useEffect(() => {
    const timer = setTimeout(() => {
      if (current < last) setCurrent(current + 1);
      else played();
    }, stepMs);
    return () => {
      clearTimeout(timer);
    };
  }, [current, last, stepMs]);

  return createPortal(
    <div className="bg-background/60 fixed inset-0 z-100 flex items-center justify-center px-6 backdrop-blur-2xl">
      <div className="relative h-96 w-full max-w-md">
        <ol
          aria-hidden="true"
          className="mt-40 flex flex-col transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateY(${-current * ROW_PX}px)` }}
        >
          {COMPANY_SETUP_STEPS.map((step, index) => {
            const distance = Math.abs(index - current);
            const now = index === current;
            return (
              <li
                key={step}
                className={cn(
                  "flex h-10 items-start gap-2 text-base whitespace-nowrap transition-opacity duration-500 ease-out motion-reduce:transition-none sm:text-lg",
                  now ? "text-primary font-semibold" : "text-foreground",
                )}
                style={{ opacity: Math.max(1 - distance * 0.2, 0) }}
              >
                <CircleCheck
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-6 shrink-0",
                    // Done and current steps are filled; the rest are outlines.
                    index <= current && "stroke-background fill-current",
                  )}
                />
                {step}
              </li>
            );
          })}
        </ol>
      </div>
      {/* Fades the list into the page at the edges. */}
      <div className="bg-background pointer-events-none absolute inset-0 [mask-image:radial-gradient(900px_at_center,transparent_30%,white)]" />
      <p role="status" className="sr-only">
        Setting up your Company: {COMPANY_SETUP_STEPS[current]}
      </p>
    </div>,
    document.body,
  );
}
