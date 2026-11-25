"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";

import {
  MAX_ACTIVITIES,
  MAX_ACTIVITY_LENGTH,
} from "@/src/preschool/domain/daily-report";

export const QUICK_ACTIVITIES = [
  "Circle time",
  "Story time",
  "Art & craft",
  "Free play",
  "Outdoor play",
  "Music & movement",
  "Rhymes",
  "Puzzles",
] as const;

/**
 * Activities as chips: tap a quick pick to add it, type anything else, tap a
 * chip's × to remove it. At most ten.
 */
export function ActivityChips({
  value,
  onChange,
  idPrefix,
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
  idPrefix: string;
}) {
  const [draft, setDraft] = useState("");
  const listed = new Set(value.map((activity) => activity.toLowerCase()));
  const full = value.length >= MAX_ACTIVITIES;
  const add = (activity: string) => {
    const trimmed = activity.trim().slice(0, MAX_ACTIVITY_LENGTH);
    if (trimmed === "" || listed.has(trimmed.toLowerCase()) || full) return;
    onChange([...value, trimmed]);
  };
  const picks = QUICK_ACTIVITIES.filter(
    (activity) => !listed.has(activity.toLowerCase()),
  );

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Activities</legend>
      {value.length === 0 ? null : (
        <ul aria-label="Chosen activities" className="flex flex-wrap gap-1.5">
          {value.map((activity) => (
            <li key={activity}>
              <Button
                type="button"
                variant="secondary"
                className="h-9 rounded-full pr-2"
                aria-label={`Remove ${activity}`}
                onClick={() => {
                  onChange(value.filter((each) => each !== activity));
                }}
              >
                {activity}
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {full || picks.length === 0 ? null : (
        <div className="flex flex-wrap gap-1.5">
          {picks.map((activity) => (
            <Button
              key={activity}
              type="button"
              variant="outline"
              className="h-9 rounded-full border-dashed"
              aria-label={`Add ${activity}`}
              onClick={() => {
                add(activity);
              }}
            >
              <Plus aria-hidden="true" />
              {activity}
            </Button>
          ))}
        </div>
      )}
      {full ? (
        <p className="text-muted-foreground text-xs">
          Ten activities is the most a report holds.
        </p>
      ) : (
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}-activity`}
            aria-label="Another activity"
            placeholder="Another activity"
            className="h-11"
            value={draft}
            maxLength={MAX_ACTIVITY_LENGTH}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              add(draft);
              setDraft("");
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={draft.trim() === ""}
            onClick={() => {
              add(draft);
              setDraft("");
            }}
          >
            Add
          </Button>
        </div>
      )}
    </fieldset>
  );
}
