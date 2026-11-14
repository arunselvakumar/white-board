"use client";

import { ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { cn } from "@repo/ui/lib/utils";

import { checkInPhotoUrl } from "@/src/queries/check-ins";

import { CheckInPhoto } from "./check-in-photo";

/**
 * What the Check-In log and the Activity feeds show of a check-in entry:
 * its photo, where it was taken and Open in Maps (ADR CM-0043 §7,
 * ADR CM-0044 §2).
 */

type Location = { latitude: number; longitude: number };

export type CheckInPlace = {
  location: Location | null;
  fence: "inside" | "outside" | null;
  /** Set with `fence`; 0 inside. */
  metresOutside: number | null;
};

const timeFormats = new Map<string, Intl.DateTimeFormat>();

/** `10:02 am` in the Company's time zone. */
export function formatTime(at: string | number, timeZone: string): string {
  let format = timeFormats.get(timeZone);
  if (format == null) {
    format = new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    });
    timeFormats.set(timeZone, format);
  }
  // ICU puts a narrow no-break space before am/pm; screens and tests want a space.
  return format.format(new Date(at)).replace(/\s+/g, " ").toLowerCase();
}

/** Google Maps at a point, for "Open in Maps". */
export function mapsUrl(location: Location): string {
  return `https://www.google.com/maps?q=${String(location.latitude)},${String(location.longitude)}`;
}

/**
 * "Inside the site fence", "240 m outside the site fence", "Location
 * saved" (a location, no Site fence) or "No location" (ADR CM-0044 §2).
 */
export function checkInLocation(entry: CheckInPlace): string {
  if (entry.location == null) return "No location";
  if (entry.fence === "inside") return "Inside the site fence";
  if (entry.fence === "outside")
    return `${(entry.metresOutside ?? 0).toLocaleString("en-IN")} m outside the site fence`;
  return "Location saved";
}

/** Google Maps in a new tab. */
export function OpenInMaps({ location }: { location: Location }) {
  return (
    <a
      href={mapsUrl(location)}
      target="_blank"
      rel="noreferrer"
      className="text-primary inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
    >
      Open in Maps
      <ExternalLink aria-hidden="true" className="size-3.5" />
    </a>
  );
}

/** The entry's photo large, from a preview. */
export function CheckInPhotoDialog({
  entryId,
  title,
  description,
  onClose,
}: {
  /** The entry whose photo is open; null when closed. */
  entryId: string | null;
  title: ReactNode;
  description: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={entryId != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entryId == null ? "Photo" : title}</DialogTitle>
          <DialogDescription>
            {entryId == null ? null : description}
          </DialogDescription>
        </DialogHeader>
        {entryId == null ? null : (
          <CheckInPhoto
            src={checkInPhotoUrl(entryId)}
            className="aspect-[4/3] max-h-[70vh] w-full rounded-xl"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The entry's photo as a small preview that opens it, or "Photo removed"
 * once retention took it (90 days, ADR CM-0043 §6).
 */
export function CheckInPhotoButton({
  entryId,
  hasPhoto,
  label,
  className,
  onOpen,
}: {
  entryId: string;
  hasPhoto: boolean;
  /** Names the entry: "Open the photo: <label>". */
  label: string;
  /** The preview's size. */
  className?: string;
  onOpen: () => void;
}) {
  if (!hasPhoto)
    return (
      <CheckInPhoto src={null} showLabel className={cn("size-16", className)} />
    );
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={`Open the photo: ${label}`}
      className={cn(
        "size-16 shrink-0 overflow-hidden rounded-lg p-0",
        className,
      )}
      onClick={onOpen}
    >
      <CheckInPhoto
        src={checkInPhotoUrl(entryId)}
        className="size-full rounded-none"
      />
    </Button>
  );
}

/** A preview with its own dialog, for a list that shows one entry a row. */
export function CheckInPhotoPreview({
  entryId,
  hasPhoto,
  label,
  description,
  className,
}: {
  entryId: string;
  hasPhoto: boolean;
  label: string;
  description: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CheckInPhotoButton
        entryId={entryId}
        hasPhoto={hasPhoto}
        label={label}
        className={className}
        onOpen={() => {
          setOpen(true);
        }}
      />
      <CheckInPhotoDialog
        entryId={open ? entryId : null}
        title={label}
        description={description}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}
