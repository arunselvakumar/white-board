"use client";

import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FormAlert } from "@/components/auth/form-alert";
import { MEALS, type Meal } from "@/src/preschool/domain/daily-report";
import {
  PRESCHOOL_MEAL_LABELS,
  type ApplyPreschoolDailyReportInput,
  type PreschoolClassroomDailyReports,
} from "@/src/queries/preschool/daily-reports";

import { ActivityChips } from "./activity-chips";
import { dailyReportErrorMessage } from "./daily-report-errors";

/** The menu already on the day's reports, so the card opens with it. */
function savedMenus(day: PreschoolClassroomDailyReports): Record<Meal, string> {
  const menus: Record<Meal, string> = { breakfast: "", snack: "", lunch: "" };
  for (const child of day.children)
    for (const entry of child.report?.meals ?? [])
      if (menus[entry.meal] === "" && entry.menu != null)
        menus[entry.meal] = entry.menu;
  return menus;
}

/**
 * For the whole Classroom: the day's menu and activities, laid over every
 * present Child's report in one go. Each Child's report can then be changed.
 */
export function ClassItemsCard({
  day,
  presentCount,
  onApply,
}: {
  day: PreschoolClassroomDailyReports;
  presentCount: number;
  onApply: (
    input: Pick<ApplyPreschoolDailyReportInput, "meals" | "activities">,
  ) => Promise<void>;
}) {
  const [menus, setMenus] = useState(() => savedMenus(day));
  const [activities, setActivities] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const meals = MEALS.filter((meal) => menus[meal].trim() !== "").map(
    (meal) => ({ meal, menu: menus[meal].trim() }),
  );
  const empty = meals.length === 0 && activities.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>For the whole Classroom</h2>
        </CardTitle>
        <CardDescription>
          Today&apos;s menu and activities, added to every present Child&apos;s
          report.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormAlert message={error ?? undefined} />
        <div className="grid gap-3 sm:grid-cols-3">
          {MEALS.map((meal) => (
            <div key={meal} className="space-y-1.5">
              <Label htmlFor={`class-menu-${meal}`}>
                {PRESCHOOL_MEAL_LABELS[meal]}
              </Label>
              <Input
                id={`class-menu-${meal}`}
                className="h-11"
                autoComplete="off"
                placeholder={meal === "lunch" ? "Curd rice, beans" : undefined}
                value={menus[meal]}
                onChange={(event) => {
                  setApplied(false);
                  setMenus({ ...menus, [meal]: event.target.value });
                }}
              />
            </div>
          ))}
        </div>
        <ActivityChips
          idPrefix="class"
          value={activities}
          onChange={(next) => {
            setApplied(false);
            setActivities(next);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            className="h-11 w-full sm:w-auto"
            disabled={empty || applying || !day.editable}
            onClick={() => {
              setApplying(true);
              setError(null);
              onApply({ meals, activities })
                .then(() => {
                  setApplied(true);
                })
                .catch((failure: unknown) => {
                  setError(dailyReportErrorMessage(failure));
                })
                .finally(() => {
                  setApplying(false);
                });
            }}
          >
            {applying
              ? "Applying…"
              : presentCount > 0
                ? `Apply to everyone present (${presentCount})`
                : "Apply to everyone present"}
          </Button>
          {applied ? (
            <p role="status" className="text-muted-foreground text-sm">
              Added to the reports. Change any Child&apos;s below.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
