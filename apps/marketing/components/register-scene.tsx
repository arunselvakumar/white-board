"use client";

import { useRef } from "react";
import { cn } from "@repo/ui/lib/utils";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";

/*
 * The hero's one memorable thing: a long-book register that opens and whose
 * handwritten rows lift into the Students table. CSS 3D only, driven by GSAP.
 *
 * Everything is laid out on a fixed 680 x 540 design stage and scaled to the
 * width of its container with `tan(atan2(100cqw, 680px))`, which yields a
 * unitless ratio in CSS so server and client markup are identical.
 */

const STAGE_W = 680;
const STAGE_H = 540;

/** Where the book rests once it has settled. */
const REST = { rotateX: 34, rotateY: -10, rotateZ: 2 };
/** Where the book starts, relative to rest. */
const START = {
  rotateX: REST.rotateX + 18,
  rotateY: REST.rotateY - 14,
  rotateZ: REST.rotateZ - 4,
};
const CARD_REST = { z: 120, y: 0, rotateX: -14 };

/** Bar widths for one handwritten row: name, Course, fee. */
type InkRow = readonly [number, number, number];

/** Earlier entries on the left page. */
const LEFT_ROWS: readonly InkRow[] = [
  [84, 30, 26],
  [98, 24, 32],
  [70, 34, 22],
  [92, 26, 30],
  [100, 32, 24],
  [76, 22, 34],
  [94, 36, 26],
  [82, 26, 30],
  [96, 30, 22],
  [72, 34, 28],
];

/** The five rows written on the right page; these lift into the table. */
const INK_ROWS: readonly InkRow[] = [
  [88, 28, 30],
  [100, 22, 26],
  [74, 34, 34],
  [94, 26, 22],
  [80, 32, 28],
];

type Student = {
  name: string;
  course: string;
  batch: string;
  mode: "Offline" | "Online";
  dues: string;
  paid: boolean;
};

const STUDENTS: readonly Student[] = [
  {
    name: "Priya Nair",
    course: "DCA",
    batch: "Weekday 9–11",
    mode: "Offline",
    dues: "₹0",
    paid: true,
  },
  {
    name: "Arjun Mehta",
    course: "Tally",
    batch: "Evening 6–8",
    mode: "Offline",
    dues: "₹1,500",
    paid: false,
  },
  {
    name: "Fathima K",
    course: "Python",
    batch: "Sunday 5–6",
    mode: "Offline",
    dues: "₹4,000",
    paid: false,
  },
  {
    name: "Rohan Das",
    course: "Python",
    batch: "Home, Tue 7–8",
    mode: "Online",
    dues: "₹0",
    paid: true,
  },
];

const RULED =
  "bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_27px,#d1d6ec_27px,#d1d6ec_28px)]";

const GRID = "grid grid-cols-[92px_50px_94px_70px_88px] gap-x-2.5";

function RegisterPage({
  rows,
  ink,
  serialFrom,
}: {
  rows: readonly InkRow[];
  ink?: boolean;
  serialFrom: number;
}) {
  return (
    <div className="absolute inset-[6px] overflow-hidden rounded-[2px] bg-white">
      {/* Ruled lines start under the header band. */}
      <div className={`absolute inset-x-0 top-[52px] bottom-0 ${RULED}`} />
      {/* Header band: a double red rule, as on a bought register. */}
      <div className="absolute inset-x-0 top-[44px] h-px bg-[#dc4a3a]/35" />
      <div className="absolute inset-x-0 top-[48px] h-px bg-[#dc4a3a]/35" />
      {/* Margin line and two column rules. */}
      <div className="absolute inset-y-0 left-[38px] w-px bg-[#dc4a3a]/35" />
      <div className="absolute inset-y-0 left-[62%] w-px bg-[#d1d6ec]" />
      <div className="absolute inset-y-0 left-[80%] w-px bg-[#d1d6ec]" />
      <div className="bg-muted-foreground/30 absolute top-[20px] left-[48px] h-[7px] w-[64px] rounded-full" />
      <div className="absolute inset-x-0 top-[52px]">
        {rows.map(([name, course, fee], index) => (
          <div
            key={serialFrom + index}
            className={cn("relative h-[28px]", ink && "js-ink")}
          >
            <span className="bg-muted-foreground/30 absolute top-[14px] left-[14px] h-[6px] w-[14px] rounded-full" />
            <span
              className="bg-muted-foreground/30 absolute top-[13px] left-[46px] h-[7px] rounded-full"
              style={{ width: name }}
            />
            <span
              className="bg-muted-foreground/30 absolute top-[13px] left-[calc(62%+8px)] h-[7px] rounded-full"
              style={{ width: course }}
            />
            <span
              className="bg-muted-foreground/30 absolute top-[13px] left-[calc(80%+8px)] h-[7px] rounded-full"
              style={{ width: fee }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Dot({ className }: { className: string }) {
  return (
    <span
      className={`inline-block size-[7px] shrink-0 rounded-full ${className}`}
    />
  );
}

function StudentsCard() {
  return (
    <div className="js-card border-border bg-card absolute top-[150px] left-[184px] w-[468px] origin-bottom overflow-hidden rounded-xl border opacity-0 shadow-[0_30px_60px_-30px_rgba(22,24,42,0.35)]">
      <div className="border-border bg-secondary flex h-[46px] items-center justify-between border-b px-4">
        <span className="text-foreground text-[15px] font-semibold">
          Students
        </span>
        <span className="text-muted-foreground text-[13px]">4 active</span>
      </div>
      <div
        className={`${GRID} text-muted-foreground px-4 pt-3 pb-2 text-[12.5px]`}
      >
        <span>Name</span>
        <span>Course</span>
        <span>Batch</span>
        <span className="whitespace-nowrap">Class Mode</span>
        <span>Dues</span>
      </div>
      {STUDENTS.map((student) => (
        <div
          key={student.name}
          className={`js-row ${GRID} border-border text-foreground items-center border-t px-4 py-[11px] text-[14px] opacity-0`}
        >
          <span className="truncate">{student.name}</span>
          <span>{student.course}</span>
          <span className="truncate">{student.batch}</span>
          <span
            className={
              student.mode === "Online"
                ? "text-[#2a7dbf]"
                : "text-muted-foreground"
            }
          >
            {student.mode}
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Dot className={student.paid ? "bg-[#2f9e61]" : "bg-[#c7900a]"} />
            <span className="font-mono text-[13px]">{student.dues}</span>
            <span
              className={
                student.paid ? "text-[#2f9e61]" : "text-muted-foreground"
              }
            >
              {student.paid ? "Paid" : "due"}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function RegisterScene() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      const hero = root.closest("section") ?? root;
      const mm = gsap.matchMedia();

      mm.add(
        MOTION_OK,
        () => {
          gsap.set(".js-stage", START);
          gsap.set(".js-card", { z: 0, y: 40, rotateX: 0 });
          gsap.set(".js-row", { y: 6 });

          const tl = gsap.timeline({
            delay: 0.3,
            defaults: { ease: "power3.out" },
          });

          // 1. The closed register settles onto the desk.
          tl.to(
            ".js-scene",
            { opacity: 1, duration: 0.5, ease: "power1.out" },
            0,
          )
            .to(".js-stage", { ...REST, duration: 1.1, ease: "expo.out" }, 0)
            // 2. The cover swings open around the spine.
            .to(
              ".js-cover",
              { rotateY: -165, duration: 1, ease: "power3.inOut" },
              0.3,
            )
            // 3. The handwritten rows lift off the page and fade...
            .to(
              ".js-ink",
              {
                z: (index: number) => 40 + index * 10,
                y: -8,
                opacity: 0,
                duration: 0.6,
                stagger: 0.08,
              },
              1.15,
            )
            // ...as the Students table rises out of the page.
            .to(
              ".js-card",
              { ...CARD_REST, opacity: 1, duration: 0.9, ease: "expo.out" },
              1.3,
            )
            .to(
              ".js-row",
              { y: 0, opacity: 1, duration: 0.45, stagger: 0.06 },
              1.6,
            );

          // Scrolling out tilts the resting object a little further.
          gsap.to(".js-tilt", {
            rotateX: 10,
            y: -60,
            ease: "none",
            scrollTrigger: {
              trigger: hero,
              start: "top top",
              end: "bottom top",
              scrub: 0.6,
            },
          });
        },
        root,
      );

      mm.add(
        "(prefers-reduced-motion: reduce)",
        () => {
          gsap.set(".js-scene", { opacity: 1 });
          gsap.set(".js-stage", REST);
          gsap.set(".js-cover", { rotateY: -165 });
          gsap.set(".js-ink", { opacity: 0 });
          gsap.set(".js-card", { ...CARD_REST, opacity: 1 });
          gsap.set(".js-row", { y: 0, opacity: 1 });
        },
        root,
      );

      return () => {
        mm.revert();
      };
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="relative -ml-[30%] w-[130%] sm:ml-0 sm:w-full">
      <div
        aria-hidden="true"
        className="js-scene @container relative w-full opacity-0"
        style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}` }}
      >
        <div
          className="scene absolute top-0 left-0 origin-top-left"
          style={{
            width: STAGE_W,
            height: STAGE_H,
            scale: `tan(atan2(100cqw, ${STAGE_W}px))`,
          }}
        >
          <div className="js-tilt preserve-3d absolute inset-0">
            <div className="js-stage preserve-3d absolute inset-0">
              {/* Spine */}
              <div className="absolute top-[90px] left-[303px] h-[400px] w-[14px] rounded-[3px] bg-[#100e22]" />
              {/* Back board with the right-hand pages on it */}
              <div className="preserve-3d absolute top-[90px] left-[310px] h-[400px] w-[262px]">
                <div className="absolute inset-0 rounded-r-[6px] bg-[#201a3e] shadow-[0_30px_60px_-30px_rgba(22,24,42,0.35)]" />
                <div
                  className="absolute inset-[4px] rounded-[2px] bg-[#eef0f8]"
                  style={{ transform: "translateZ(2px)" }}
                />
                <div
                  className="preserve-3d absolute inset-0"
                  style={{ transform: "translateZ(4px)" }}
                >
                  <RegisterPage rows={INK_ROWS} ink serialFrom={11} />
                </div>
              </div>
              {/* Front cover: hinged on the spine */}
              <div
                className="js-cover preserve-3d absolute top-[90px] left-[310px] h-[400px] w-[262px] origin-left"
                style={{ transform: "translateZ(7px)" }}
              >
                <div className="absolute inset-0 overflow-hidden rounded-r-[6px] bg-[#201a3e] backface-hidden">
                  {/* Binding tape */}
                  <div className="absolute inset-y-0 left-0 w-[26px] bg-[#100e22]" />
                  {/* Paper label */}
                  <div className="absolute top-[118px] left-[62px] flex w-[164px] items-center gap-2.5 rounded-[3px] bg-white px-3 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- decorative, fixed-size SVG */}
                    <img
                      src="/whiteboard-logo.svg"
                      alt=""
                      width={20}
                      height={20}
                      className="size-5 shrink-0"
                    />
                    <span className="text-foreground text-[15px] leading-tight font-normal">
                      Admissions 2026
                    </span>
                  </div>
                </div>
                <div
                  className="absolute inset-0 rounded-l-[6px] bg-[#201a3e] backface-hidden"
                  style={{ transform: "rotateY(180deg)" }}
                >
                  <RegisterPage rows={LEFT_ROWS} serialFrom={1} />
                </div>
              </div>
              <StudentsCard />
            </div>
          </div>
        </div>
      </div>
      <p className="sr-only">
        An illustration of the Whiteboard Students table: Priya Nair in the DCA
        Weekday 9–11 Batch has paid in full, Arjun Mehta in the Tally Evening
        6–8 Batch has ₹1,500 due, Fathima K in the Python Sunday 5–6 Batch has
        ₹4,000 due, and Rohan Das studies Python online with nothing due.
      </p>
    </div>
  );
}
