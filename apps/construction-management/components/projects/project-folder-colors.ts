import type { ProjectColor } from "@/src/projects/domain/project-color";

/**
 * How each Project colour tints its folder on the Projects home and its
 * swatch on the Project form (ADR CM-0026). Whole class names, so Tailwind
 * reads them from source. Light mode is a pastel body with a stronger back
 * panel and tab; dark mode mixes a little of the hue into the card colour,
 * so the folder stays deep and low in saturation with readable text. The colours are the folder only: text stays `foreground`.
 */
export type ProjectFolderTint = {
  /**
   * The swatch on the form. Important (`!`), so it wins over the radio's
   * own checked fill.
   */
  swatch: string;
  /** The front of the folder. */
  body: string;
  /** The back panel and its tab, peeking out above the front. */
  back: string;
  /** The tinted square behind the kebab. */
  chip: string;
  /** The progress bar's track on the folder. */
  track: string;
};

export const PROJECT_FOLDER_TINTS: Record<ProjectColor, ProjectFolderTint> = {
  lavender: {
    swatch: "bg-violet-300! dark:bg-violet-400!",
    body: "border-violet-200/80 bg-violet-100 dark:border-violet-400/20 dark:bg-[color-mix(in_oklab,var(--color-violet-400)_14%,var(--color-card))]",
    back: "bg-violet-200 dark:bg-[color-mix(in_oklab,var(--color-violet-400)_28%,var(--color-card))]",
    chip: "bg-violet-200/80 text-violet-700 hover:bg-violet-300/70 dark:bg-violet-400/15 dark:text-violet-300 dark:hover:bg-violet-400/25",
    track: "bg-violet-200 dark:bg-violet-400/20",
  },
  peach: {
    swatch: "bg-orange-300! dark:bg-orange-400!",
    body: "border-orange-200/80 bg-orange-100 dark:border-orange-400/20 dark:bg-[color-mix(in_oklab,var(--color-orange-400)_14%,var(--color-card))]",
    back: "bg-orange-200 dark:bg-[color-mix(in_oklab,var(--color-orange-400)_28%,var(--color-card))]",
    chip: "bg-orange-200/80 text-orange-700 hover:bg-orange-300/70 dark:bg-orange-400/15 dark:text-orange-300 dark:hover:bg-orange-400/25",
    track: "bg-orange-200 dark:bg-orange-400/20",
  },
  sky: {
    swatch: "bg-sky-300! dark:bg-sky-400!",
    body: "border-sky-200/80 bg-sky-100 dark:border-sky-400/20 dark:bg-[color-mix(in_oklab,var(--color-sky-400)_14%,var(--color-card))]",
    back: "bg-sky-200 dark:bg-[color-mix(in_oklab,var(--color-sky-400)_28%,var(--color-card))]",
    chip: "bg-sky-200/80 text-sky-700 hover:bg-sky-300/70 dark:bg-sky-400/15 dark:text-sky-300 dark:hover:bg-sky-400/25",
    track: "bg-sky-200 dark:bg-sky-400/20",
  },
  mint: {
    swatch: "bg-emerald-300! dark:bg-emerald-400!",
    body: "border-emerald-200/80 bg-emerald-100 dark:border-emerald-400/20 dark:bg-[color-mix(in_oklab,var(--color-emerald-400)_14%,var(--color-card))]",
    back: "bg-emerald-200 dark:bg-[color-mix(in_oklab,var(--color-emerald-400)_28%,var(--color-card))]",
    chip: "bg-emerald-200/80 text-emerald-700 hover:bg-emerald-300/70 dark:bg-emerald-400/15 dark:text-emerald-300 dark:hover:bg-emerald-400/25",
    track: "bg-emerald-200 dark:bg-emerald-400/20",
  },
  lemon: {
    swatch: "bg-yellow-300! dark:bg-yellow-400!",
    body: "border-yellow-200 bg-yellow-50 dark:border-yellow-400/20 dark:bg-[color-mix(in_oklab,var(--color-yellow-400)_14%,var(--color-card))]",
    back: "bg-yellow-200/70 dark:bg-[color-mix(in_oklab,var(--color-yellow-400)_28%,var(--color-card))]",
    chip: "bg-yellow-200/70 text-yellow-800 hover:bg-yellow-300/70 dark:bg-yellow-400/15 dark:text-yellow-300 dark:hover:bg-yellow-400/25",
    track: "bg-yellow-200 dark:bg-yellow-400/20",
  },
  rose: {
    swatch: "bg-rose-300! dark:bg-rose-400!",
    body: "border-rose-200/80 bg-rose-100 dark:border-rose-400/20 dark:bg-[color-mix(in_oklab,var(--color-rose-400)_14%,var(--color-card))]",
    back: "bg-rose-200 dark:bg-[color-mix(in_oklab,var(--color-rose-400)_28%,var(--color-card))]",
    chip: "bg-rose-200/80 text-rose-700 hover:bg-rose-300/70 dark:bg-rose-400/15 dark:text-rose-300 dark:hover:bg-rose-400/25",
    track: "bg-rose-200 dark:bg-rose-400/20",
  },
  sand: {
    swatch: "bg-stone-300! dark:bg-stone-400!",
    body: "border-stone-200 bg-stone-100 dark:border-stone-400/20 dark:bg-[color-mix(in_oklab,var(--color-stone-400)_14%,var(--color-card))]",
    back: "bg-stone-200 dark:bg-[color-mix(in_oklab,var(--color-stone-400)_28%,var(--color-card))]",
    chip: "bg-stone-200 text-stone-700 hover:bg-stone-300/70 dark:bg-stone-400/15 dark:text-stone-300 dark:hover:bg-stone-400/25",
    track: "bg-stone-200 dark:bg-stone-400/20",
  },
  slate: {
    swatch: "bg-slate-400! dark:bg-slate-400!",
    body: "border-slate-200 bg-slate-100 dark:border-slate-400/20 dark:bg-[color-mix(in_oklab,var(--color-slate-400)_14%,var(--color-card))]",
    back: "bg-slate-200 dark:bg-[color-mix(in_oklab,var(--color-slate-400)_28%,var(--color-card))]",
    chip: "bg-slate-200 text-slate-700 hover:bg-slate-300/70 dark:bg-slate-400/15 dark:text-slate-300 dark:hover:bg-slate-400/25",
    track: "bg-slate-200 dark:bg-slate-400/20",
  },
};
