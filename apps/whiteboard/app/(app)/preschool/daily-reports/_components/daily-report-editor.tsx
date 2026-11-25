"use client";

import {
  Frown,
  Laugh,
  Link2,
  Moon,
  Plus,
  Smile,
  Thermometer,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { isClockTime } from "@/src/preschool/domain/attendance";
import {
  ATE,
  EMPTY_DAILY_REPORT,
  MAX_PHOTOS,
  MAX_TOILET_ENTRIES,
  MOODS,
  TOILET_KINDS,
  type Ate,
  type DailyReportContent,
  type Mood,
  type ToiletKind,
} from "@/src/preschool/domain/daily-report";
import { timeInIndia } from "@/src/preschool/domain/dates";
import {
  PRESCHOOL_MEAL_LABELS,
  PRESCHOOL_MOOD_LABELS,
  type PreschoolDailyReport,
} from "@/src/queries/preschool/daily-reports";

import { ActivityChips } from "./activity-chips";
import { dailyReportErrorMessage } from "./daily-report-errors";

const ATE_SHORT: Record<Ate, string> = {
  all: "All",
  some: "Some",
  none: "None",
};

const TOILET_BUTTONS: Record<ToiletKind, string> = {
  diaper_wet: "Diaper – wet",
  diaper_soiled: "Diaper – soiled",
  potty: "Potty",
  toilet: "Toilet",
};

const MOOD_ICONS: Record<Mood, LucideIcon> = {
  happy: Laugh,
  calm: Smile,
  tired: Moon,
  fussy: Frown,
  unwell: Thermometer,
};

function contentOf(report: PreschoolDailyReport | null): DailyReportContent {
  if (report == null) return EMPTY_DAILY_REPORT;
  return {
    meals: report.meals,
    napFrom: report.napFrom,
    napTo: report.napTo,
    toilet: report.toilet,
    mood: report.mood,
    activities: report.activities,
    note: report.note,
    photos: report.photos,
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

/** A row of big choices, one of which may be picked. */
function Choices<Value extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly { value: Value; label: string; icon?: LucideIcon }[];
  value: Value | null;
  onChange: (value: Value) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-1.5", className)}
    >
      {options.map((option) => {
        const selected = value === option.value;
        const Icon = option.icon;
        return (
          <Button
            key={option.value}
            type="button"
            variant="outline"
            role="radio"
            aria-checked={selected}
            className={cn(
              "h-11 rounded-lg",
              Icon != null && "h-16 flex-col gap-1 text-xs",
              selected &&
                "border-primary bg-primary/10 text-foreground hover:bg-primary/10",
            )}
            onClick={() => {
              onChange(option.value);
            }}
          >
            {Icon == null ? null : (
              <Icon aria-hidden="true" className="size-6" />
            )}
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * One Child's Daily Report: meals from the Classroom's menu, nap, toilet,
 * mood, activities, a note and photo links. Saved as a draft; a published
 * report stays published when it is saved again.
 */
export function DailyReportEditor({
  childName,
  report,
  editable,
  onSave,
  onDirtyChange,
}: {
  childName: string;
  report: PreschoolDailyReport | null;
  editable: boolean;
  onSave: (content: DailyReportContent) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [saved, setSaved] = useState(() => contentOf(report));
  const [content, setContent] = useState(saved);
  const [noNap, setNoNap] = useState(saved.napFrom == null);
  const [showPhotos, setShowPhotos] = useState(saved.photos.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty =
    JSON.stringify({
      ...content,
      ...(noNap ? { napFrom: null, napTo: null } : {}),
    }) !== JSON.stringify(saved);
  const firstName = childName.split(" ")[0] ?? childName;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const change = (next: Partial<DailyReportContent>) => {
    setContent({ ...content, ...next });
  };

  const save = async () => {
    const napFrom = noNap ? null : content.napFrom;
    const napTo = noNap ? null : content.napTo;
    if (
      !noNap &&
      (napFrom == null ||
        napTo == null ||
        !isClockTime(napFrom) ||
        !isClockTime(napTo))
    ) {
      setError("Enter when the nap started and ended, or switch on No nap.");
      return;
    }
    if (napFrom != null && napTo != null && napTo <= napFrom) {
      setError("The nap must end after it starts.");
      return;
    }
    const photos = content.photos.map((photo) => photo.trim()).filter(Boolean);
    if (photos.some((photo) => !photo.startsWith("https://"))) {
      setError("Photo links must start with https://.");
      return;
    }
    const next = { ...content, napFrom, napTo, photos };
    setError(null);
    setSaving(true);
    try {
      await onSave(next);
      setSaved(next);
      setContent(next);
    } catch (failure) {
      setError(dailyReportErrorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      aria-label={`Daily Report for ${childName}`}
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={!editable} className="space-y-5">
        <FormAlert message={error ?? undefined} />
        <Section title="Meals">
          {content.meals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Add today&apos;s menu under For the whole Classroom.
            </p>
          ) : (
            <div className="space-y-3">
              {content.meals.map((entry) => (
                <div key={entry.meal} className="space-y-1">
                  <p className="text-sm">
                    <span className="font-medium">
                      {PRESCHOOL_MEAL_LABELS[entry.meal]}
                    </span>
                    {entry.menu == null ? null : (
                      <span className="text-muted-foreground">
                        {" "}
                        · {entry.menu}
                      </span>
                    )}
                  </p>
                  <Choices
                    label={`${PRESCHOOL_MEAL_LABELS[entry.meal]}: how much ${firstName} ate`}
                    className="grid-cols-3"
                    options={ATE.map((ate) => ({
                      value: ate,
                      label: ATE_SHORT[ate],
                    }))}
                    value={entry.ate}
                    onChange={(ate) => {
                      change({
                        meals: content.meals.map((meal) =>
                          meal.meal === entry.meal ? { ...meal, ate } : meal,
                        ),
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Nap">
          <div className="flex items-center gap-3">
            <Switch
              id={`nap-none-${firstName}`}
              checked={noNap}
              onCheckedChange={(checked) => {
                setNoNap(checked);
              }}
            />
            <Label htmlFor={`nap-none-${firstName}`}>No nap</Label>
          </div>
          {noNap ? null : (
            <div className="grid grid-cols-2 gap-2 sm:w-80">
              <div className="space-y-1">
                <Label htmlFor={`nap-from-${firstName}`} className="text-xs">
                  From
                </Label>
                <Input
                  id={`nap-from-${firstName}`}
                  type="time"
                  className="h-11"
                  value={content.napFrom ?? ""}
                  onChange={(event) => {
                    change({ napFrom: event.target.value || null });
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`nap-to-${firstName}`} className="text-xs">
                  To
                </Label>
                <Input
                  id={`nap-to-${firstName}`}
                  type="time"
                  className="h-11"
                  value={content.napTo ?? ""}
                  onChange={(event) => {
                    change({ napTo: event.target.value || null });
                  }}
                />
              </div>
            </div>
          )}
        </Section>

        <Section title="Toilet / diaper">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {TOILET_KINDS.map((kind) => (
              <Button
                key={kind}
                type="button"
                variant="outline"
                className="h-11"
                disabled={content.toilet.length >= MAX_TOILET_ENTRIES}
                onClick={() => {
                  change({
                    toilet: [
                      ...content.toilet,
                      { time: timeInIndia(new Date()), kind },
                    ],
                  });
                }}
              >
                <Plus aria-hidden="true" />
                {TOILET_BUTTONS[kind]}
              </Button>
            ))}
          </div>
          {content.toilet.length === 0 ? null : (
            <ul
              aria-label="Toilet entries"
              className="divide-y rounded-lg border"
            >
              {content.toilet.map((entry, index) => (
                <li
                  key={`${entry.time}-${entry.kind}-${String(index)}`}
                  className="flex items-center justify-between gap-2 px-3"
                >
                  <span className="text-sm">
                    <span className="tabular-nums">{entry.time}</span> ·{" "}
                    {TOILET_BUTTONS[entry.kind]}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`Remove ${TOILET_BUTTONS[entry.kind]} at ${entry.time}`}
                    onClick={() => {
                      change({
                        toilet: content.toilet.filter((_, at) => at !== index),
                      });
                    }}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Mood">
          <Choices
            label={`${firstName}'s mood`}
            className="grid-cols-5"
            options={MOODS.map((mood) => ({
              value: mood,
              label: PRESCHOOL_MOOD_LABELS[mood],
              icon: MOOD_ICONS[mood],
            }))}
            value={content.mood}
            onChange={(mood) => {
              change({ mood: content.mood === mood ? null : mood });
            }}
          />
        </Section>

        <ActivityChips
          idPrefix={`report-${firstName}`}
          value={content.activities}
          onChange={(activities) => {
            change({ activities });
          }}
        />

        <div className="space-y-1.5">
          <Label htmlFor={`note-${firstName}`}>Note</Label>
          <Textarea
            id={`note-${firstName}`}
            rows={3}
            placeholder={`Anything ${firstName}'s Parents should know about today`}
            value={content.note ?? ""}
            onChange={(event) => {
              change({
                note: event.target.value === "" ? null : event.target.value,
              });
            }}
          />
        </div>

        {showPhotos ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Photo links</legend>
            <p className="text-muted-foreground text-xs">
              Photo uploads are coming. For now, paste an https link.
            </p>
            {content.photos.map((photo, index) => (
              <div key={String(index)} className="flex gap-2">
                <Input
                  aria-label={`Photo link ${String(index + 1)}`}
                  type="url"
                  inputMode="url"
                  className="h-11"
                  placeholder="https://"
                  value={photo}
                  onChange={(event) => {
                    change({
                      photos: content.photos.map((each, at) =>
                        at === index ? event.target.value : each,
                      ),
                    });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`Remove photo link ${String(index + 1)}`}
                  onClick={() => {
                    change({
                      photos: content.photos.filter((_, at) => at !== index),
                    });
                  }}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            ))}
            {content.photos.length >= MAX_PHOTOS ? null : (
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => {
                  change({ photos: [...content.photos, ""] });
                }}
              >
                <Plus aria-hidden="true" />
                Add a photo link
              </Button>
            )}
          </fieldset>
        ) : (
          <Button
            type="button"
            variant="link"
            className="text-muted-foreground h-11 px-0"
            onClick={() => {
              setShowPhotos(true);
              change({ photos: [""] });
            }}
          >
            <Link2 aria-hidden="true" />
            Add a photo link
          </Button>
        )}
      </fieldset>

      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="h-11" disabled={saving || !dirty}>
            {saving
              ? "Saving…"
              : report?.status === "published"
                ? "Save changes"
                : "Save draft"}
          </Button>
          {dirty ? (
            <Badge
              variant="outline"
              className="border-amber-400 text-amber-800 dark:text-amber-300"
            >
              Unsaved changes
            </Badge>
          ) : null}
          {report?.status === "published" ? (
            <p className="text-muted-foreground text-xs">
              Already sent; saving updates what Parents see.
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
