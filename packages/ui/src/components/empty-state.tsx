import type { Icon } from "@phosphor-icons/react";
import {
  CalendarBlankIcon,
  FileTextIcon,
  FolderSimpleIcon,
  ImageSquareIcon,
  PlayCircleIcon,
  SquaresFourIcon,
  TableIcon,
} from "@phosphor-icons/react/ssr";
import { cva } from "class-variance-authority";
import { cn } from "cn";
import type { ReactNode } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "./empty";

/**
 * An empty state: what is missing (the centre icon), a title, a description
 * and optional actions. At `md` and `lg` the centre icon sits in an orbit of
 * faded rings with small file-like tiles on them; `sm` drops the orbit for
 * tables, sheets and small cards.
 *
 * Icons come from Phosphor's server-safe entry, so a Server Component can
 * render one too:
 *
 *   import { UsersThreeIcon } from "@phosphor-icons/react/ssr";
 *   <EmptyState icon={UsersThreeIcon} title="No Labour yet" … />
 */
export type EmptyStateTone =
  "neutral" | "brand" | "success" | "warning" | "danger";

export type EmptyStateSize = "sm" | "md" | "lg";

export type EmptyStateProps = {
  /** The thing that is missing: a folder for Projects, people for Labour. Drawn duotone. */
  icon: Icon;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or links, laid out in a centred row under the description. */
  actions?: ReactNode;
  /** Anything else that belongs under the description (a list, a hint). */
  children?: ReactNode;
  /** Colour of the centre icon, from the theme's tokens. */
  tone?: EmptyStateTone;
  /** `lg` for a whole page, `md` inside a card, `sm` in a table, sheet or list. */
  size?: EmptyStateSize;
  /** Draw the rings and tiles around the icon (`md` and `lg` only). Off for errors. */
  orbit?: boolean;
  className?: string;
} & Omit<React.ComponentProps<"div">, "title" | "children">;

/** Each tone sets `--empty-tone`; the tile, halo and glyph read from it. */
const toneVariants = cva("", {
  variants: {
    tone: {
      neutral: "[--empty-tone:var(--foreground)]",
      brand: "[--empty-tone:var(--primary)]",
      success: "[--empty-tone:var(--chart-3)]",
      warning: "[--empty-tone:var(--chart-4)]",
      danger: "[--empty-tone:var(--destructive)]",
    },
  },
  defaultVariants: { tone: "brand" },
});

const tileVariants = cva(
  [
    "relative flex shrink-0 items-center justify-center border border-[color-mix(in_oklab,var(--empty-tone)_18%,var(--border))]",
    "bg-linear-to-b from-card to-[color-mix(in_oklab,var(--empty-tone)_9%,var(--card))]",
    "text-(--empty-tone) shadow-[0_1px_2px_rgb(0_0_0/0.04),0_10px_24px_-10px_color-mix(in_oklab,var(--empty-tone)_45%,transparent)]",
  ],
  {
    variants: {
      size: {
        sm: "size-10 rounded-xl [&_svg]:size-5",
        md: "size-12 rounded-[0.9rem] [&_svg]:size-6",
        lg: "size-14 rounded-2xl [&_svg]:size-7",
      },
    },
    defaultVariants: { size: "lg" },
  },
);

const orbitVariants = cva("relative mx-auto aspect-8/5 w-full", {
  variants: {
    size: {
      sm: "",
      // The title sits over the faded lower rings, as the tiles fan out above it.
      md: "-mb-8 max-w-60",
      lg: "-mb-10 max-w-80",
    },
  },
  defaultVariants: { size: "lg" },
});

const titleVariants = cva("font-semibold text-foreground", {
  variants: {
    size: {
      sm: "text-sm",
      md: "text-sm",
      lg: "text-base",
    },
  },
  defaultVariants: { size: "lg" },
});

/* The orbit is drawn in a 320 × 200 box centred on the icon. */
const CX = 160;
const CY = 100;
const RINGS = [44, 76, 112, 148] as const;

type Satellite = { ring: number; angle: number; icon: Icon };

/**
 * Small tiles that sit on the rings, placed by angle (0° is 3 o'clock,
 * negative is above) so each one is centred on its ring's line.
 */
const SATELLITES: readonly Satellite[] = [
  { ring: 76, angle: -122, icon: FileTextIcon },
  { ring: 76, angle: -38, icon: SquaresFourIcon },
  { ring: 76, angle: 152, icon: FolderSimpleIcon },
  { ring: 112, angle: -162, icon: TableIcon },
  { ring: 112, angle: 166, icon: FileTextIcon },
  { ring: 112, angle: -14, icon: ImageSquareIcon },
  { ring: 112, angle: 24, icon: PlayCircleIcon },
  { ring: 148, angle: -170, icon: CalendarBlankIcon },
];

function polar(ring: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: CX + ring * Math.cos(radians),
    y: CY + ring * Math.sin(radians),
  };
}

function EmptyStateOrbit() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 320 200"
      className="absolute inset-0 size-full overflow-visible [mask-image:radial-gradient(circle_at_50%_50%,#000_42%,transparent_88%)]"
    >
      <circle
        cx={CX}
        cy={CY}
        r={RINGS[0]}
        className="fill-[color-mix(in_oklab,var(--empty-tone)_6%,transparent)]"
      />
      {RINGS.map((r) => (
        <circle
          key={r}
          cx={CX}
          cy={CY}
          r={r}
          fill="none"
          vectorEffect="non-scaling-stroke"
          className="stroke-border"
        />
      ))}
      {SATELLITES.map(({ ring, angle, icon: SatelliteIcon }, index) => {
        // Further rings carry smaller tiles, so the orbit recedes.
        const tile = ring <= 76 ? 26 : ring <= 112 ? 22 : 20;
        const glyph = ring <= 76 ? 14 : ring <= 112 ? 12 : 11;
        const { x, y } = polar(ring, angle);
        return (
          <g key={index} data-slot="empty-state-satellite">
            <rect
              x={x - tile / 2}
              y={y - tile / 2}
              width={tile}
              height={tile}
              rx={tile * 0.28}
              vectorEffect="non-scaling-stroke"
              className="fill-card stroke-border"
            />
            <SatelliteIcon
              x={x - glyph / 2}
              y={y - glyph / 2}
              size={glyph}
              className="text-muted-foreground"
            />
          </g>
        );
      })}
    </svg>
  );
}

function EmptyState({
  icon: CentreIcon,
  title,
  description,
  actions,
  children,
  tone = "brand",
  size = "lg",
  orbit = true,
  className,
  ...props
}: EmptyStateProps) {
  const showOrbit = orbit && size !== "sm";
  const tile = (
    <div
      aria-hidden="true"
      data-slot="empty-state-icon"
      className={tileVariants({ size })}
    >
      <CentreIcon weight="duotone" />
    </div>
  );

  return (
    <Empty
      data-size={size}
      data-tone={tone}
      className={cn(
        toneVariants({ tone }),
        size === "sm" ? "gap-3 p-4" : "gap-5",
        className,
      )}
      {...props}
    >
      <EmptyHeader
        className={cn(
          size === "sm" ? "gap-1.5" : "gap-2",
          // Without a set width the header shrinks to its text and squeezes the orbit.
          showOrbit && "w-full",
        )}
      >
        {showOrbit ? (
          <div
            data-slot="empty-state-orbit"
            className={orbitVariants({ size })}
          >
            <EmptyStateOrbit />
            <div className="absolute inset-0 flex items-center justify-center">
              {tile}
            </div>
          </div>
        ) : (
          <div className={size === "sm" ? "mb-1" : "mb-2"}>{tile}</div>
        )}
        <EmptyTitle className={titleVariants({ size })}>{title}</EmptyTitle>
        {description == null ? null : (
          <EmptyDescription>{description}</EmptyDescription>
        )}
      </EmptyHeader>
      {children}
      {actions == null ? null : (
        <EmptyContent className="flex-row flex-wrap justify-center gap-2">
          {actions}
        </EmptyContent>
      )}
    </Empty>
  );
}

export { EmptyState };
