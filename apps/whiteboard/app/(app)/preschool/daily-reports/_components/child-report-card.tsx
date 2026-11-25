"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { ChildInitialsAvatar } from "@/app/(app)/preschool/_components/child-initials-avatar";
import type { DailyReportContent } from "@/src/preschool/domain/daily-report";
import type { PreschoolClassroomDailyReports } from "@/src/queries/preschool/daily-reports";

import { DailyReportEditor } from "./daily-report-editor";

type RosterChild = PreschoolClassroomDailyReports["children"][number];

/** "3:40 pm" in India. */
export function sentAt(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    })
    .toLowerCase();
}

function StatusBadge({ child }: { child: RosterChild }) {
  const report = child.report;
  if (report?.status === "published" && report.publishedAt != null)
    return (
      <Badge className="bg-emerald-600 text-white dark:bg-emerald-500">
        Sent {sentAt(report.publishedAt)}
      </Badge>
    );
  if (report?.status === "draft")
    return <Badge variant="secondary">Draft</Badge>;
  return <Badge variant="outline">Not started</Badge>;
}

/**
 * One Child's report for the day: a header with its status that opens the
 * editor. A Child marked absent or on leave has no report to write.
 */
export function ChildReportCard({
  child,
  editable,
  onSave,
  onDirtyChange,
}: {
  child: RosterChild;
  editable: boolean;
  onSave: (content: DailyReportContent) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  // Closing keeps the editor mounted, so unsaved changes survive.
  const [opened, setOpened] = useState(false);
  const away = child.attendance === "absent" || child.attendance === "leave";
  const panelId = `report-${child.childId}`;

  return (
    <li
      className={cn(
        "bg-card min-w-0 rounded-xl border",
        away && "bg-muted/40 text-muted-foreground",
      )}
    >
      {away ? (
        <div className="flex min-h-16 items-center gap-3 px-3 py-2">
          <ChildInitialsAvatar
            id={child.childId}
            name={child.name}
            photoUrl={child.photoUrl}
            className="opacity-60"
          />
          <p className="min-w-0 flex-1 truncate font-medium">{child.name}</p>
          <Badge variant="outline">
            {child.attendance === "absent" ? "Absent" : "On leave"}
          </Badge>
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            aria-expanded={open}
            aria-controls={panelId}
            className="h-auto min-h-16 w-full justify-start gap-3 rounded-xl px-3 py-2 text-left font-normal whitespace-normal"
            onClick={() => {
              setOpen(!open);
              setOpened(true);
            }}
          >
            <ChildInitialsAvatar
              id={child.childId}
              name={child.name}
              photoUrl={child.photoUrl}
            />
            <span className="min-w-0 flex-1 truncate font-medium">
              {child.name}
            </span>
            <StatusBadge child={child} />
            <ChevronDown
              aria-hidden="true"
              className={cn("transition-transform", open && "rotate-180")}
            />
          </Button>
          {opened ? (
            <div id={panelId} hidden={!open} className="border-t p-3 sm:p-4">
              <DailyReportEditor
                key={child.report?.updatedAt ?? "new"}
                childName={child.name}
                report={child.report}
                editable={editable}
                onSave={onSave}
                onDirtyChange={onDirtyChange}
              />
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}
