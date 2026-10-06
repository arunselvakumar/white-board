"use client";

import Image from "next/image";
import { useRef, type ReactNode } from "react";

import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";

const FEE_POINTS = [
  {
    name: "One Fee Plan per Enrollment",
    body: "Priya takes Tally and DCA. Each Enrollment has its own plan, so the two never mix.",
  },
  {
    name: "One-time, monthly, or installments",
    body: "Due dates on the plan. A sibling concession is an adjustment, not a new Course.",
  },
  {
    name: "Partial payments",
    body: "₹2,000 today by UPI, the rest next month. Remaining dues update on the spot.",
  },
  {
    name: "A numbered Receipt, every time",
    body: "Sequential per Workspace. Print it or save the PDF before they leave.",
  },
] as const;

type ReceiptRow = {
  label: string;
  value: ReactNode;
  mono?: boolean;
  mark?: "paid" | "due";
};

const RECEIPT_ROWS: readonly ReceiptRow[] = [
  { label: "Student", value: "Priya Nair" },
  { label: "Enrollment", value: "DCA, Weekday 9–11" },
  {
    label: "Fee Plan",
    value: (
      <>
        Monthly, <span className="font-mono text-[0.8125rem]">₹2,000</span>
      </>
    ),
  },
  {
    label: "Paid",
    value: (
      <>
        <span className="font-mono text-[0.8125rem]">₹2,000</span> by UPI
      </>
    ),
    mark: "paid",
  },
  { label: "Remaining dues", value: "₹4,000", mono: true, mark: "due" },
  { label: "Date", value: "6 Oct 2026", mono: true },
  { label: "Recorded by", value: "Owner" },
];

export function FeesSection() {
  const stage = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        const receipt = "[data-receipt]";
        const rows = "[data-receipt-row]";

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: stage.current,
            start: "top 75%",
            toggleActions: "play none none none",
          },
        });

        // The paper rises out of the slit and straightens up.
        tl.fromTo(
          receipt,
          { yPercent: 60, rotateX: 18 },
          { yPercent: 0, rotateX: 0, duration: 1.4, ease: "expo.out" },
          0,
        )
          // It is only visible once it clears the slit: the first 20%.
          .fromTo(
            receipt,
            { opacity: 0 },
            { opacity: 1, duration: 0.28, ease: "none" },
            0,
          )
          // The printed rows land one after another.
          .fromTo(
            rows,
            { opacity: 0, y: 6 },
            {
              opacity: 1,
              y: 0,
              duration: 0.6,
              stagger: 0.05,
              ease: "power2.out",
            },
            0.25,
          );
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set("[data-receipt]", { yPercent: 0, rotateX: 0, opacity: 1 });
        gsap.set("[data-receipt-row]", { y: 0, opacity: 1 });
      });

      return () => {
        mm.revert();
      };
    },
    { scope: stage },
  );

  return (
    <section
      id="fees"
      aria-labelledby="fees-heading"
      className="surface-night scroll-mt-16 overflow-hidden py-24 md:py-32 lg:py-40"
    >
      <div className="container-site grid items-center gap-16 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <h2 id="fees-heading" className="text-section max-w-[14ch]">
            Dues you can see from the desk.
          </h2>

          <dl className="border-sidebar-border mt-12 max-w-[60ch] border-t">
            {FEE_POINTS.map((point) => (
              <div
                key={point.name}
                className="border-sidebar-border border-b py-5"
              >
                <dt className="text-[1.0625rem] font-semibold">{point.name}</dt>
                <dd className="mt-1 text-[1.0625rem] leading-[1.6] text-[#c4b5fd]/85">
                  {point.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:col-span-7">
          <div
            ref={stage}
            aria-hidden="true"
            className="relative mx-auto w-full max-w-[460px]"
          >
            {/* Everything below this window's bottom edge is inside the slot. */}
            <div className="relative overflow-hidden px-4 pt-14 [perspective:900px] sm:px-12">
              <div
                data-receipt
                className="bg-card text-card-foreground relative -mb-5 w-full origin-bottom rounded-t-md shadow-[0_40px_60px_-24px_rgba(6,4,18,0.85)] will-change-transform motion-safe:opacity-0"
              >
                <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
                  <div className="flex items-center gap-2">
                    <Image
                      src="/whiteboard-logo.svg"
                      alt=""
                      width={20}
                      height={20}
                      unoptimized
                      className="size-5"
                    />
                    <span className="text-[0.9375rem] font-semibold">
                      Receipt
                    </span>
                  </div>
                  <span className="font-mono text-[0.8125rem]">R-0042</span>
                </div>

                <dl className="border-border mx-5 border-t sm:mx-6">
                  {RECEIPT_ROWS.map((row) => (
                    <div
                      key={row.label}
                      data-receipt-row
                      className="border-border flex items-baseline justify-between gap-4 border-b py-2.5 text-[0.8125rem] motion-safe:opacity-0 sm:text-[0.875rem]"
                    >
                      <dt className="text-muted-foreground shrink-0">
                        {row.label}
                      </dt>
                      <dd
                        className={`flex items-center gap-2 text-right ${
                          row.mono ? "font-mono text-[0.8125rem]" : ""
                        }`}
                      >
                        {row.mark ? (
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${
                              row.mark === "paid"
                                ? "bg-[#2f9e61]"
                                : "bg-[#c7900a]"
                            }`}
                          />
                        ) : null}
                        <span>{row.value}</span>
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* Tear line, then the stub still inside the slot. */}
                <div className="border-brand-200 mx-5 mt-6 border-t border-dashed sm:mx-6" />
                <div className="h-10" />
              </div>
            </div>

            {/* The plate: a dark slab seen from above, with the paper slit at its back edge. */}
            <div className="relative h-20 [perspective:700px]">
              <div className="border-sidebar-border absolute inset-x-0 -top-px h-24 origin-top [transform:rotateX(58deg)] rounded-b-xl border bg-[#201a3e] [transform-style:preserve-3d]">
                <div className="absolute inset-x-3 top-px h-[3px] rounded-full bg-[#f6f7fb]/85 sm:inset-x-11" />
                <div className="absolute inset-x-0 top-full h-4 origin-top [transform:rotateX(-58deg)] rounded-b-xl bg-[#17132f]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
