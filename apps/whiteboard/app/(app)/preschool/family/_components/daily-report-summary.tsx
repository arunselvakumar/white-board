import {
  Frown,
  Laugh,
  Moon,
  Smile,
  Thermometer,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@repo/ui/components/badge";

import type {
  DailyReportContent,
  Mood,
} from "@/src/preschool/domain/daily-report";
import { formatClockTime } from "@/app/(app)/preschool/_components/preschool-format";
import {
  PRESCHOOL_MEAL_LABELS,
  PRESCHOOL_MOOD_LABELS,
  PRESCHOOL_TOILET_LABELS,
} from "@/src/queries/preschool/daily-reports";

const MOOD_ICONS: Record<Mood, LucideIcon> = {
  happy: Laugh,
  calm: Smile,
  tired: Moon,
  fussy: Frown,
  unwell: Thermometer,
};

const ATE_WORDS = {
  all: "ate it all",
  some: "ate some",
  none: "did not eat",
} as const;

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** One day's Daily Report as a Parent reads it. */
export function DailyReportSummary({
  report,
  firstName,
}: {
  report: DailyReportContent;
  firstName: string;
}) {
  const MoodIcon = report.mood == null ? null : MOOD_ICONS[report.mood];
  return (
    <div className="space-y-4">
      {report.mood == null || MoodIcon == null ? null : (
        <p className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-full">
            <MoodIcon aria-hidden="true" className="size-6" />
          </span>
          <span>
            {firstName} was{" "}
            <span className="font-semibold">
              {PRESCHOOL_MOOD_LABELS[report.mood].toLowerCase()}
            </span>{" "}
            today
          </span>
        </p>
      )}
      <dl className="space-y-2">
        {report.meals.map((meal) => (
          <Row key={meal.meal} label={PRESCHOOL_MEAL_LABELS[meal.meal]}>
            {meal.menu == null ? "" : `${meal.menu} — `}
            {ATE_WORDS[meal.ate]}
          </Row>
        ))}
        <Row label="Nap">
          {report.napFrom == null || report.napTo == null
            ? "No nap"
            : `${formatClockTime(report.napFrom)} – ${formatClockTime(report.napTo)}`}
        </Row>
        {report.toilet.length === 0 ? null : (
          <Row label="Toilet">
            <ul>
              {report.toilet.map((entry, index) => (
                <li key={`${entry.time}-${String(index)}`}>
                  {formatClockTime(entry.time)} ·{" "}
                  {PRESCHOOL_TOILET_LABELS[entry.kind]}
                </li>
              ))}
            </ul>
          </Row>
        )}
      </dl>
      {report.activities.length === 0 ? null : (
        <ul aria-label="Activities" className="flex flex-wrap gap-1.5">
          {report.activities.map((activity) => (
            <li key={activity}>
              <Badge variant="secondary" className="rounded-full">
                {activity}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {report.note == null ? null : (
        <blockquote className="bg-muted/50 rounded-xl p-3 text-sm italic">
          {report.note}
        </blockquote>
      )}
      {report.photos.length === 0 ? null : (
        <ul aria-label="Photos" className="grid grid-cols-3 gap-2">
          {report.photos.map((photo, index) => (
            <li key={photo}>
              <a href={photo} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- Photos are links on other hosts; next/image needs each host configured. */}
                <img
                  src={photo}
                  alt={`${firstName}'s day, ${String(index + 1)} of ${String(report.photos.length)}`}
                  className="aspect-square w-full rounded-lg object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
