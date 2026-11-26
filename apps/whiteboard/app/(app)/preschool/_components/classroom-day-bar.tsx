"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { cn } from "@repo/ui/lib/utils";

import {
  addDays,
  isIsoDate,
  todayInIndia,
  type IsoDate,
} from "@/src/preschool/domain/dates";

export type DayBarClassroom = { id: string; name: string };

/** "Wed, 25 Nov" */
export function formatDayLabel(date: IsoDate): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * The Classroom and day a Teacher is working on, kept in the URL
 * (`?classroomId=…&date=…`) so a link from the Teacher Home opens the right
 * one. A date ahead of today, or a Classroom the User cannot open, falls
 * back to today and the first Classroom.
 */
export function useClassroomDay(classrooms: readonly DayBarClassroom[]) {
  const router = useRouter();
  const pathname = usePathname() || "/preschool";
  const searchParams = useSearchParams();
  const today = todayInIndia(new Date());
  const [state, setState] = useState(() => {
    const wanted = searchParams.get("classroomId");
    const wantedDate = searchParams.get("date") ?? "";
    return {
      classroomId:
        classrooms.find((classroom) => classroom.id === wanted)?.id ??
        classrooms[0]?.id ??
        null,
      date: isIsoDate(wantedDate) && wantedDate <= today ? wantedDate : today,
    };
  });
  const classroomId =
    classrooms.find((classroom) => classroom.id === state.classroomId)?.id ??
    classrooms[0]?.id ??
    null;

  const update = (next: { classroomId?: string; date?: IsoDate }) => {
    const merged = { classroomId, date: state.date, ...next };
    setState(merged);
    const params = new URLSearchParams(searchParams.toString());
    if (merged.classroomId != null)
      params.set("classroomId", merged.classroomId);
    if (merged.date === today) params.delete("date");
    else params.set("date", merged.date);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return {
    classroomId,
    date: state.date,
    today,
    setClassroomId: (id: string) => {
      update({ classroomId: id });
    },
    setDate: (date: IsoDate) => {
      update({ date: date > today ? today : date });
    },
  };
}

/**
 * Classroom picker and date stepper for the Teacher's daily screens. With one
 * Classroom there is no picker; the stepper never goes past today.
 */
export function ClassroomDayBar({
  classrooms,
  classroomId,
  onClassroomChange,
  date,
  today,
  onDateChange,
  readOnly = false,
  hideDate = false,
}: {
  classrooms: readonly DayBarClassroom[];
  classroomId: string;
  onClassroomChange: (id: string) => void;
  date: IsoDate;
  today: IsoDate;
  onDateChange: (date: IsoDate) => void;
  /** The day cannot be changed by this User. */
  readOnly?: boolean;
  /** Only the Classroom picker (the monthly register picks a month instead). */
  hideDate?: boolean;
}) {
  const items = classrooms.map((classroom) => ({
    value: classroom.id,
    label: classroom.name,
  }));
  const current = classrooms.find((classroom) => classroom.id === classroomId);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {classrooms.length > 1 ? (
        <Select
          items={items}
          value={classroomId}
          onValueChange={(value) => {
            if (value != null) onClassroomChange(value);
          }}
        >
          <SelectTrigger
            aria-label="Classroom"
            size="lg"
            className="h-11 min-w-0 flex-1 sm:w-56 sm:flex-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="min-w-0 flex-1 truncate font-medium sm:flex-none">
          {current?.name}
        </p>
      )}
      <div
        role="group"
        aria-label="Day"
        className={cn("flex items-center gap-1", hideDate && "hidden")}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Previous day"
          onClick={() => {
            onDateChange(addDays(date, -1));
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <p
          aria-live="polite"
          className="min-w-24 text-center text-sm font-medium tabular-nums"
        >
          {formatDayLabel(date)}
        </p>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Next day"
          disabled={date >= today}
          onClick={() => {
            onDateChange(addDays(date, 1));
          }}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
        {date === today ? (
          <Badge variant="secondary" className="ml-1">
            Today
          </Badge>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => {
              onDateChange(today);
            }}
          >
            Today
          </Button>
        )}
      </div>
      {readOnly ? <Badge variant="outline">Read only</Badge> : null}
    </div>
  );
}
