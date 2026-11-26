import { Badge } from "@repo/ui/components/badge";

import { formatDate } from "@/app/(app)/preschool/_components/preschool-format";
import {
  PRESCHOOL_ANNOUNCEMENT_KIND_LABELS,
  type PreschoolAnnouncement,
} from "@/src/queries/preschool/announcements";

import { dayLabel } from "./family-format";

/** "Sat, 12 Dec" or "Mon, 21 Dec – Fri, 1 Jan" for an event or holiday. */
export function announcementDates(item: PreschoolAnnouncement): string | null {
  if (item.startsOn == null) return null;
  if (item.endsOn == null || item.endsOn === item.startsOn)
    return dayLabel(item.startsOn);
  return `${dayLabel(item.startsOn)} – ${dayLabel(item.endsOn)}`;
}

/** One Announcement as a family reads it. */
export function AnnouncementCard({ item }: { item: PreschoolAnnouncement }) {
  const dates = announcementDates(item);
  return (
    <article
      aria-label={item.title}
      className="bg-card space-y-2 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            item.kind === "holiday"
              ? "secondary"
              : item.kind === "event"
                ? "default"
                : "outline"
          }
        >
          {PRESCHOOL_ANNOUNCEMENT_KIND_LABELS[item.kind]}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {item.audience} · {formatDate(item.publishedAt.slice(0, 10))}
        </span>
      </div>
      <h3 className="font-semibold">{item.title}</h3>
      {dates == null ? null : <p className="text-sm font-medium">{dates}</p>}
      <p className="text-sm whitespace-pre-line">{item.body}</p>
    </article>
  );
}
