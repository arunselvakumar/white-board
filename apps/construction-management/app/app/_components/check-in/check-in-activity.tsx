import { MapPin } from "lucide-react";

import type { ActivityFeedItem } from "@/app/app/_components/activity/activity-feed";

import {
  CheckInPhotoPreview,
  checkInLocation,
  OpenInMaps,
  type CheckInPlace,
} from "./check-in-entry-parts";

/** A check-in entry as both Activity feeds return it (ADR CM-0044 §2). */
export type ActivityCheckInEntry = CheckInPlace & {
  action: "check_in" | "check_out";
  at: string;
  entryId: string;
  hasPhoto: boolean;
  voided: { reason: string } | null;
  by: string | null;
};

/** The verb after the person's name, or the start of the Labour feed's line. */
export const CHECKED: Record<ActivityCheckInEntry["action"], string> = {
  check_in: "checked in",
  check_out: "checked out",
};

/**
 * What every check-in entry shows under its title: where it was taken and
 * Open in Maps, the photo as a small preview that opens large, and a void.
 * `label` names the entry in words, for the preview and its dialog.
 */
export function checkInActivityParts(
  entry: ActivityCheckInEntry,
  label: string,
): Pick<ActivityFeedItem, "icon" | "tone" | "detail" | "preview" | "voided"> {
  const place = checkInLocation(entry);
  return {
    icon: MapPin,
    tone:
      entry.action === "check_in" && entry.voided == null ? "added" : "default",
    // No dot between the two: on a phone the link wraps to its own line,
    // and a dot would be left hanging at the end of the first.
    detail: (
      <span className="inline-flex flex-wrap items-center gap-x-2">
        <span>{place}</span>
        {entry.location == null ? null : (
          <OpenInMaps location={entry.location} />
        )}
      </span>
    ),
    preview: (
      <CheckInPhotoPreview
        entryId={entry.entryId}
        hasPhoto={entry.hasPhoto}
        label={label}
        description={entry.by == null ? place : `${place} · by ${entry.by}`}
        className="size-12"
      />
    ),
    ...(entry.voided == null ? {} : { voided: entry.voided }),
  };
}
