import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudRain,
  Sun,
  ThermometerSun,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@repo/ui/components/badge";

import {
  WEATHER_LABELS,
  type Weather,
} from "@/src/site-work/domain/site-diary";
import { addDays } from "@/src/shared-kernel/calendar-date";

const WEATHER_ICONS: Record<Weather, LucideIcon> = {
  sunny: Sun,
  cloudy: Cloud,
  light_rain: CloudDrizzle,
  heavy_rain: CloudRain,
  windy: Wind,
  foggy: CloudFog,
  very_hot: ThermometerSun,
};

/** "Morning · Sunny" with the weather's icon. */
export function WeatherChip({
  when,
  weather,
}: {
  when: string;
  weather: Weather | null;
}) {
  if (weather == null)
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {when} · Not recorded
      </Badge>
    );
  const Icon = WEATHER_ICONS[weather];
  return (
    <Badge variant="outline">
      <Icon aria-hidden="true" />
      {when} · {WEATHER_LABELS[weather]}
    </Badge>
  );
}

export function WeatherIcon({
  weather,
  className,
}: {
  weather: Weather;
  className?: string;
}) {
  const Icon = WEATHER_ICONS[weather];
  return (
    <Icon
      role="img"
      aria-label={WEATHER_LABELS[weather]}
      className={className}
    />
  );
}

/** `2026-10-10` → `Saturday, 10 Oct 2026`. */
export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** `2026-10-10` → `Sat 10`. */
export function formatDayOfMonth(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** `2026-10` → `October 2026`. */
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

/** The first and last dates of a `YYYY-MM` month. */
export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  const next = addDays(from, 32).slice(0, 7);
  return { from, to: addDays(`${next}-01`, -1) };
}

/** The month before or after `YYYY-MM`. */
export function shiftMonth(month: string, by: -1 | 1): string {
  const from = `${month}-01`;
  return by === 1
    ? addDays(from, 32).slice(0, 7)
    : addDays(from, -1).slice(0, 7);
}

/** "4.5 mm" or a dash. */
export function formatRainfall(value: string | null): string {
  return value == null ? "—" : `${value} mm`;
}
