"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";

import { gsap, useGSAP, MOTION_OK } from "@/lib/gsap";

/* ------------------------------------------------------------------------- */
/* Mock product UI. Hand-built, aria-hidden: the list text carries meaning.  */
/* ------------------------------------------------------------------------- */

function MockCard({
  title,
  context,
  children,
  footer,
  className,
}: {
  title: string;
  context: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-brand-200 bg-card text-foreground flex h-[300px] w-full max-w-[440px] flex-col overflow-hidden rounded-xl border shadow-[0_30px_60px_-30px_rgba(22,24,42,0.35)]",
        className,
      )}
    >
      <div className="border-brand-200 bg-secondary flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <span className="text-[13px] font-semibold">{title}</span>
        <span className="text-muted-foreground truncate text-xs">
          {context}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4">{children}</div>
      {footer ? (
        <div className="border-border flex items-center justify-end gap-2 border-t px-4 py-2.5">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

function Row({
  label,
  children,
  className,
  noTruncate = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  noTruncate?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-border flex min-h-9 items-center justify-between gap-3 border-b py-1.5 text-[13px] last:border-b-0",
        className,
      )}
    >
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("min-w-0 text-right", !noTruncate && "truncate")}>
        {children}
      </span>
    </div>
  );
}

function Mono({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("font-mono text-[12.5px]", className)}>{children}</span>
  );
}

function MockButton({ children }: { children: ReactNode }) {
  return (
    <span className="bg-foreground text-background rounded-md px-3 py-1 text-xs font-semibold">
      {children}
    </span>
  );
}

function Dot({ className }: { className: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
    />
  );
}

function Segmented({
  options,
  selected,
}: {
  options: { label: string; dot?: string }[];
  selected: string;
}) {
  return (
    <span className="border-brand-200 inline-flex overflow-hidden rounded-md border text-xs">
      {options.map((option) => (
        <span
          key={option.label}
          className={cn(
            "border-brand-200 flex items-center gap-1.5 border-l px-2 py-0.5 first:border-l-0",
            option.label === selected
              ? "bg-foreground text-background"
              : "text-muted-foreground",
          )}
        >
          {option.dot ? <Dot className={option.dot} /> : null}
          {option.label}
        </span>
      ))}
    </span>
  );
}

function StudentCard() {
  return (
    <MockCard
      title="New Student"
      context="Students"
      footer={<MockButton>Save Student</MockButton>}
    >
      <div className="border-border flex items-center gap-3 border-b py-3">
        <span className="bg-brand-100 text-brand-900 flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          PN
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[15px] font-semibold">Priya Nair</span>
          <Mono className="text-muted-foreground">98470 12345</Mono>
        </span>
      </div>
      <Row label="Father">
        Suresh Nair{" "}
        <Mono className="text-muted-foreground ml-1">98470 55210</Mono>
      </Row>
      <Row label="Mother">
        Lakshmi Nair{" "}
        <Mono className="text-muted-foreground ml-1">94460 21877</Mono>
      </Row>
      <Row label="Guardian">Kamala Menon, grandmother</Row>
    </MockCard>
  );
}

function CourseCard() {
  return (
    <MockCard
      title="New Course"
      context="Courses"
      footer={<MockButton>Save Course</MockButton>}
    >
      <Row label="Name">DCA</Row>
      <Row label="Course code">
        <Mono>DCA-01</Mono>
      </Row>
      <Row label="Expected duration">
        <Mono>6</Mono> months
      </Row>
      <Row label="Learning hours">
        <Mono>180</Mono>
      </Row>
      <Row label="Default fee">
        <Mono className="text-[14px]">₹12,000</Mono>
      </Row>
    </MockCard>
  );
}

function BatchCard() {
  return (
    <MockCard title="New Batch" context="Batches">
      <Row label="Name">DCA Weekday 9–11</Row>
      <Row label="Course">DCA</Row>
      <Row label="Timings">
        Mon–Fri <Mono className="ml-1">9:00–11:00 AM</Mono>
      </Row>
      <Row label="Class Mode">
        <span className="border-brand-200 rounded-md border px-2 py-0.5 text-xs">
          Offline
        </span>
      </Row>
      <Row label="Room">Lab 1</Row>
      <div className="flex flex-col gap-2 py-2.5 text-[13px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Seats</span>
          <span>
            <Mono>14</Mono> of <Mono>20</Mono> enrolled
          </span>
        </div>
        <div className="flex h-1.5 gap-0.5">
          {Array.from({ length: 20 }, (_, seat) => (
            <span
              key={seat}
              className={cn(
                "flex-1 rounded-[1px]",
                seat < 14 ? "bg-brand-500" : "bg-brand-100",
              )}
            />
          ))}
        </div>
      </div>
    </MockCard>
  );
}

function TimingOption({
  label,
  value,
  selected,
}: {
  label: string;
  value: string;
  selected: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1">
      <span
        className={cn(
          "mt-[3px] flex size-3.5 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-foreground" : "border-brand-300",
        )}
      >
        {selected ? (
          <span className="bg-foreground size-1.5 rounded-full" />
        ) : null}
      </span>
      <span className="flex flex-col">
        <span className={selected ? "" : "text-muted-foreground"}>{label}</span>
        <Mono className="text-muted-foreground">{value}</Mono>
      </span>
    </div>
  );
}

function EnrollmentCard() {
  return (
    <MockCard
      title="Enroll Student"
      context="Priya Nair"
      footer={<MockButton>Enroll</MockButton>}
    >
      <Row label="Batch">DCA Weekday 9–11</Row>
      <Row label="Class Mode" noTruncate>
        <Segmented
          selected="Offline"
          options={[
            { label: "Offline" },
            { label: "Online", dot: "bg-chart-2" },
            { label: "Hybrid" },
          ]}
        />
      </Row>
      <div className="border-border flex flex-col border-b py-1 text-[13px]">
        <TimingOption
          selected
          label="Inherited from Batch"
          value="Mon–Fri 9:00–11:00 AM"
        />
        <TimingOption
          selected={false}
          label="Student-specific"
          value="Sun 5:00–6:00 PM"
        />
      </div>
      <Row label="Fee Plan">
        Installments <Mono className="ml-1">3 × ₹4,000</Mono>
      </Row>
    </MockCard>
  );
}

function FeePaymentCard() {
  return (
    <MockCard
      title="Fee Payment"
      context="Priya Nair, DCA"
      footer={<MockButton>Record Fee Payment</MockButton>}
    >
      <Row label="Fee Plan">
        <Mono>₹12,000</Mono>
      </Row>
      <Row label="Paid earlier">
        <span className="inline-flex items-center gap-2">
          <Dot className="bg-chart-3" />
          <Mono>₹6,000</Mono>
        </span>
      </Row>
      <Row label="Method" noTruncate>
        <Segmented
          selected="UPI"
          options={[{ label: "Cash" }, { label: "UPI" }, { label: "Card" }]}
        />
      </Row>
      <Row label="Amount">
        <span className="inline-flex items-center gap-2">
          <span className="border-brand-200 text-muted-foreground rounded-md border px-1.5 text-xs">
            Partial
          </span>
          <Mono className="text-[15px]">₹2,000</Mono>
        </span>
      </Row>
      <div className="flex flex-col gap-2 py-2 text-[13px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Remaining dues</span>
          <span className="inline-flex items-center gap-2">
            <Dot className="bg-chart-4" />
            <Mono>₹4,000</Mono>
          </span>
        </div>
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
          <span className="bg-chart-3 w-1/2" />
          <span className="bg-chart-3/60 w-1/6" />
          <span className="bg-chart-4 w-1/3" />
        </div>
      </div>
    </MockCard>
  );
}

function ReceiptCard() {
  return (
    <MockCard
      title="Receipt"
      context={<Mono>R-0042</Mono>}
      footer={<MockButton>Print</MockButton>}
    >
      <div className="border-brand-300 flex items-baseline justify-between gap-3 border-b border-dashed py-2.5">
        <span className="text-[14px] font-semibold">
          Lakeview Computer Centre
        </span>
        <Mono className="text-muted-foreground shrink-0">6 Oct 2026</Mono>
      </div>
      <Row label="Student">Priya Nair</Row>
      <Row label="Enrollment">DCA Weekday 9–11</Row>
      <Row label="Received">
        <span className="inline-flex items-center gap-2">
          <Dot className="bg-chart-3" />
          <Mono className="text-[14px]">₹2,000</Mono>
          <span className="text-muted-foreground">UPI</span>
        </span>
      </Row>
      <Row label="Remaining dues">
        <span className="inline-flex items-center gap-2">
          <Dot className="bg-chart-4" />
          <Mono>₹4,000</Mono>
        </span>
      </Row>
    </MockCard>
  );
}

/* ------------------------------------------------------------------------- */
/* The six steps of the P0 loop.                                            */
/* ------------------------------------------------------------------------- */

const steps = [
  {
    name: "Add a Student",
    body: "Name, phone, photo, father’s and mother’s details, a Guardian or two. The walk-in form, without the form.",
    Card: StudentCard,
  },
  {
    name: "Define a Course",
    body: "DCA, Tally, Python. What you teach, how long it runs, and the default fee.",
    Card: CourseCard,
  },
  {
    name: "Open a Batch",
    body: "When it runs and how: Weekday 9–11, Offline, Lab 1, 20 seats.",
    Card: BatchCard,
  },
  {
    name: "Enroll the Student",
    body: "Put them in the Batch. Timings come from the Batch, or set Sunday 5–6 for home tuition.",
    Card: EnrollmentCard,
  },
  {
    name: "Take a Fee Payment",
    body: "Cash, UPI, Card. Partial is fine. Remaining dues update on the spot.",
    Card: FeePaymentCard,
  },
  {
    name: "Print the Receipt",
    body: "Numbered per Workspace, printable, handed over before they leave the desk.",
    Card: ReceiptCard,
  },
] as const;

/* Pinned 3D sequence: only on wide screens that allow motion. */
const DECK_QUERY = `(min-width: 1024px) and ${MOTION_OK}`;
/* Below this height the six sentences do not fit beside the deck at once. */
const SHORT_QUERY = "(max-height: 879px)";

/** Timeline units: each step change moves for MOVE and rests for HOLD on both sides. */
const MOVE = 1;
const HOLD = 0.35;
const STEP = MOVE + HOLD * 2;

/**
 * Where a card sits relative to the active one. d = 0 is the front card,
 * d > 0 waits behind it (back and up), d < 0 has been flipped down off the
 * front of the deck, hinged on its bottom edge like a register page.
 */
function cardState(d: number): gsap.TweenVars {
  if (d < 0) {
    return {
      x: -110,
      y: 300,
      z: 120,
      rotationX: -72,
      rotationZ: -6,
      opacity: 0,
    };
  }
  const depth = Math.min(d, 4);
  return {
    x: 0,
    y: -24 * depth,
    z: -80 * depth,
    rotationX: 0,
    rotationZ: 0,
    opacity: d > 3 ? 0 : d > 2 ? 0.55 : 1,
  };
}

/** Cards waiting behind the front one read as blank sheets, not as text. */
function veilState(d: number): gsap.TweenVars {
  return { opacity: d <= 0 ? 0 : Math.min(0.9, 0.55 + 0.15 * d) };
}

export function RegisterLoop() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add({ deck: DECK_QUERY, short: SHORT_QUERY }, (context) => {
        const { deck: isDeck, short } = context.conditions ?? {};
        const pinEl = pinRef.current;
        if (!isDeck || !pinEl) return;

        const q = gsap.utils.selector(sectionRef);
        const cards = q<HTMLElement>("[data-deck-card]");
        const nums = q<HTMLElement>("[data-step-num]");
        const texts = q<HTMLElement>("[data-step-text]");
        const descs = q<HTMLElement>("[data-step-desc]");
        const veils = q<HTMLElement>("[data-deck-veil]");
        const fill = q<HTMLElement>("[data-step-fill]");
        const deck = q<HTMLElement>("[data-deck]");

        const css = getComputedStyle(document.documentElement);
        const token = (name: string, fallback: string) =>
          css.getPropertyValue(name).trim() || fallback;
        const ink = token("--foreground", "#16182a");
        const muted = token("--muted-foreground", "#6b6f8c");
        const paper = token("--background", "#f6f7fb");
        const line = token("--border", "#e2e4ef");
        const violet = token("--primary", "#595fae");
        const onViolet = token("--primary-foreground", "#f7f8fc");

        const numOn = {
          backgroundColor: violet,
          borderColor: violet,
          color: onViolet,
        };
        const numOff = {
          backgroundColor: paper,
          borderColor: line,
          color: muted,
        };

        gsap.set(deck, { rotationX: 8, rotationY: -10 });
        gsap.set(cards, { transformOrigin: "50% 100%", force3D: true });
        cards.forEach((card, j) => {
          gsap.set(card, cardState(j));
        });
        veils.forEach((veil, j) => {
          gsap.set(veil, veilState(j));
        });
        nums.forEach((num, k) => {
          gsap.set(num, k === 0 ? numOn : numOff);
        });
        texts.forEach((text, k) => {
          gsap.set(text, { color: k === 0 ? ink : muted });
        });
        /* On short screens only the active step keeps its sentence open. */
        const descOpen = (el: HTMLElement): gsap.TweenVars => ({
          height: () => el.scrollHeight,
          opacity: 1,
          marginTop: 4,
        });
        const descShut: gsap.TweenVars = {
          height: 0,
          opacity: 0,
          marginTop: 0,
        };
        if (short) {
          gsap.set(descs, { overflow: "hidden" });
          descs.forEach((desc, k) => {
            gsap.set(desc, k === 0 ? descOpen(desc) : descShut);
          });
        }
        gsap.set(fill, {
          scaleY: 0,
          transformOrigin: "50% 0%",
          visibility: "visible",
        });

        const total = (steps.length - 1) * STEP;
        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut", immediateRender: false },
          scrollTrigger: {
            trigger: pinEl,
            pin: true,
            pinSpacing: true,
            scrub: 0.8,
            start: "top top",
            end: `+=${steps.length * 90}%`,
            invalidateOnRefresh: true,
            snap: {
              snapTo: "labels",
              duration: { min: 0.2, max: 0.6 },
              delay: 0.1,
              ease: "power1.inOut",
            },
          },
        });

        tl.addLabel("step-1", 0);
        tl.fromTo(
          fill,
          { scaleY: 0 },
          { scaleY: 1, ease: "none", duration: total },
          0,
        );

        for (let i = 1; i < steps.length; i++) {
          const at = (i - 1) * STEP + HOLD;

          cards.forEach((card, j) => {
            if (j < i - 1 || j - i > 4) return;
            const from = cardState(j - (i - 1));
            const to = cardState(j - i);
            if (j === i - 1) {
              /* The leaving page fades early so it never sits over the next one. */
              delete from.opacity;
              delete to.opacity;
              tl.fromTo(
                card,
                { opacity: 1 },
                { opacity: 0, duration: MOVE * 0.5, ease: "power1.in" },
                at + MOVE * 0.1,
              );
            }
            tl.fromTo(card, from, { ...to, duration: MOVE }, at);
            tl.fromTo(
              veils.slice(j, j + 1),
              veilState(j - (i - 1)),
              { ...veilState(j - i), duration: MOVE },
              at,
            );
          });

          const swap = at + MOVE * 0.3;
          tl.fromTo(
            nums.slice(i - 1, i),
            numOn,
            { ...numOff, duration: MOVE * 0.4 },
            swap,
          )
            .fromTo(
              nums.slice(i, i + 1),
              numOff,
              { ...numOn, duration: MOVE * 0.4 },
              swap,
            )
            .fromTo(
              texts.slice(i - 1, i),
              { color: ink },
              { color: muted, duration: MOVE * 0.4 },
              swap,
            )
            .fromTo(
              texts.slice(i, i + 1),
              { color: muted },
              { color: ink, duration: MOVE * 0.4 },
              swap,
            );

          const prev = descs[i - 1];
          const next = descs[i];
          if (short && prev && next) {
            tl.fromTo(
              prev,
              descOpen(prev),
              { ...descShut, duration: MOVE * 0.6 },
              at + MOVE * 0.2,
            ).fromTo(
              next,
              descShut,
              { ...descOpen(next), duration: MOVE * 0.6 },
              at + MOVE * 0.2,
            );
          }

          tl.addLabel(`step-${i + 1}`, i * STEP);
        }
      });

      return () => {
        mm.revert();
      };
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      aria-labelledby="how-heading"
      className="bg-background text-foreground scroll-mt-16 overflow-x-clip"
    >
      <div
        ref={pinRef}
        className="py-24 md:py-32 lg:py-40 lg:motion-safe:flex lg:motion-safe:h-svh lg:motion-safe:items-center lg:motion-safe:pt-20 lg:motion-safe:pb-8 lg:motion-safe:[@media(max-height:879px)]:items-start lg:motion-safe:[@media(max-height:879px)]:pt-28"
      >
        <div className="container-site lg:motion-safe:grid lg:motion-safe:grid-cols-12 lg:motion-safe:gap-10">
          <div className="lg:motion-safe:col-span-5">
            <h2 id="how-heading" className="text-section max-w-[18ch]">
              From admission to Receipt, in six steps.
            </h2>
            <p className="text-muted-foreground mt-5 max-w-[60ch] text-[1.25rem] leading-[1.5] text-pretty">
              The same loop a desk runs on paper, without the paper.
            </p>

            <div className="relative mt-12 lg:motion-safe:mt-10">
              <div
                aria-hidden="true"
                className="bg-brand-200 absolute top-4 bottom-4 left-4 hidden w-px -translate-x-1/2 lg:motion-safe:block"
              >
                <div
                  data-step-fill
                  className="bg-primary invisible h-full w-full"
                />
              </div>

              <ol className="relative flex flex-col gap-14 lg:motion-safe:gap-5 lg:motion-reduce:gap-20">
                {steps.map(({ name, body, Card }, k) => (
                  <li
                    key={name}
                    className="flex flex-col gap-6 lg:motion-reduce:grid lg:motion-reduce:grid-cols-12 lg:motion-reduce:items-center lg:motion-reduce:gap-10"
                  >
                    <div className="flex gap-4 lg:motion-reduce:col-span-5">
                      <span
                        data-step-num
                        className="border-brand-200 bg-background text-foreground flex size-8 shrink-0 items-center justify-center rounded-md border text-sm font-semibold"
                      >
                        {k + 1}
                      </span>
                      <div
                        data-step-text
                        className="text-foreground min-w-0 pt-0.5"
                      >
                        <h3 className="text-[1.25rem] leading-snug font-semibold lg:motion-safe:text-[1.125rem]">
                          {name}
                        </h3>
                        <p
                          data-step-desc
                          className="mt-1.5 max-w-[60ch] text-[1.0625rem] leading-[1.6] lg:motion-safe:mt-1 lg:motion-safe:text-[0.9375rem] lg:motion-safe:leading-[1.5]"
                        >
                          {body}
                        </p>
                      </div>
                    </div>
                    <div
                      aria-hidden="true"
                      className="sm:pl-12 lg:motion-safe:hidden lg:motion-reduce:col-span-7 lg:motion-reduce:pl-0"
                    >
                      <Card />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="scene hidden items-center justify-center lg:motion-safe:col-span-7 lg:motion-safe:flex"
          >
            <div
              data-deck
              className="preserve-3d relative mt-16 h-[300px] w-[440px]"
            >
              {steps.map(({ name, Card }, j) => (
                <div
                  key={name}
                  data-deck-card
                  className="absolute inset-0 backface-hidden"
                  style={{ zIndex: steps.length - j }}
                >
                  <Card />
                  <div
                    data-deck-veil
                    className="bg-secondary absolute inset-px rounded-[11px] opacity-0"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
