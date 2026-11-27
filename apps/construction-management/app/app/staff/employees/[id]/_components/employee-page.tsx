"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { CalendarCheck, History, UserRound } from "lucide-react";

import {
  EditLabourDetails,
  FormPage,
  editLabourMeta,
} from "@/app/app/staff/labours/_components/labour-form";
import { PersonAttendance } from "@/app/app/_components/person-attendance/person-attendance";
import { labourQuery } from "@/src/queries/labours";
import { labourAttendanceQuery } from "@/src/queries/person-attendance";

import { LabourActivity } from "./labour-activity";

const TABS = ["details", "attendance", "activity"] as const;

/**
 * A Labour's page (ADR CM-0038 §5, CM-0051): Details (Edit Labour's
 * form), Attendance and Activity, the tab kept in the address
 * (`?tab=activity`). Details stays mounted while another tab shows, so
 * typed changes survive a tab switch.
 */
export function LabourPage({
  id,
  now,
}: {
  id: string;
  /** For stories: what "Today" is in the feed. */
  now?: Date;
}) {
  const { data } = useSuspenseQuery(labourQuery(id));
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS).withDefault("details"),
  );
  return (
    <FormPage
      title={`Edit ${data.name}`}
      watermark="Labours"
      meta={editLabourMeta(data)}
    >
      <Tabs
        value={tab}
        onValueChange={(next: (typeof TABS)[number]) => {
          void setTab(next === "details" ? null : next);
        }}
      >
        <TabsList>
          <TabsTrigger value="details">
            <UserRound aria-hidden="true" />
            Details
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <CalendarCheck aria-hidden="true" />
            Attendance
          </TabsTrigger>
          <TabsTrigger value="activity">
            <History aria-hidden="true" />
            Activity
          </TabsTrigger>
        </TabsList>
        <TabsContent value="details" keepMounted className="pt-4">
          <EditLabourDetails labour={data} />
        </TabsContent>
        <TabsContent value="attendance" className="pt-4">
          <PersonAttendance
            query={labourAttendanceQuery(id)}
            emptyMessage="Days marked on the attendance sheet, or by Check-In, will show here."
          />
        </TabsContent>
        <TabsContent value="activity" className="pt-4">
          <LabourActivity labourId={id} now={now} />
        </TabsContent>
      </Tabs>
    </FormPage>
  );
}
