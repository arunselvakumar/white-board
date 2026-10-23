"use client";

import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import { cn } from "@repo/ui/lib/utils";

import {
  PROJECT_COLORS,
  type ProjectColor,
} from "@/src/projects/domain/project-color";

import { PROJECT_FOLDER_TINTS } from "./project-folder-colors";

/**
 * The Project's folder colour on the Project form (ADR CM-0026 §2): eight
 * round swatches in a radio group, so one is always chosen and the arrow
 * keys move between them. Each swatch is named ("Lavender"); the chosen
 * one has a ring and a dot.
 */
export function ProjectColorField({
  value,
  onChange,
  disabled,
}: {
  value: ProjectColor;
  onChange: (color: ProjectColor) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p id="project-color-label" className="text-sm leading-none font-medium">
        Colour
      </p>
      <RadioGroup
        aria-labelledby="project-color-label"
        aria-describedby="project-color-hint"
        value={value}
        onValueChange={(next) => {
          onChange(next as ProjectColor);
        }}
        disabled={disabled}
        className="flex w-auto flex-wrap gap-2.5 py-1"
      >
        {PROJECT_COLORS.map((color) => {
          const tint = PROJECT_FOLDER_TINTS[color.key];
          return (
            <RadioGroupItem
              key={color.key}
              value={color.key}
              aria-label={color.label}
              title={color.label}
              className={cn(
                "data-checked:ring-foreground/70 data-checked:ring-offset-background size-8 items-center justify-center border-black/10 transition-shadow after:-inset-1 data-checked:border-black/10 data-checked:ring-2 data-checked:ring-offset-2 dark:border-white/15 dark:data-checked:border-white/15 [&_[data-slot=radio-group-indicator]>span]:bg-black/60",
                tint.swatch,
              )}
            />
          );
        })}
      </RadioGroup>
      <p id="project-color-hint" className="text-muted-foreground text-xs">
        The colour of this Project&apos;s folder on the Projects home.
      </p>
    </div>
  );
}
