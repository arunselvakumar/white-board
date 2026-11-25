"use client";

import { ChalkboardIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import { NotebookPen, ScrollText, Shapes } from "lucide-react";
import { Suspense, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  ClassroomDayBar,
  useClassroomDay,
} from "@/app/(app)/preschool/_components/classroom-day-bar";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { classroomsQueryOptions } from "@/src/queries/preschool/classrooms";

import { DomainsDialog } from "./domains-dialog";
import { ObservationsTab } from "./observations-tab";
import { ReportsTab } from "./reports-tab";

function Loading() {
  return <Skeleton className="h-64 w-full rounded-xl" />;
}

/** Observations and term Progress Reports for a Classroom. */
export function ProgressScreen() {
  const { centre, me } = useActiveCentre();
  const { data: classrooms } = useSuspenseQuery(
    classroomsQueryOptions(centre.id),
  );
  const day = useClassroomDay(classrooms.items);
  const [tab, setTab] = useState<"observations" | "reports">("observations");
  const [domainsOpen, setDomainsOpen] = useState(false);
  const domainsButton =
    me.role === "owner" ? (
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setDomainsOpen(true);
        }}
      >
        <Shapes aria-hidden="true" />
        Development Domains
      </Button>
    ) : undefined;

  return (
    <PreschoolPage
      title="Progress"
      watermark="Progress"
      actions={domainsButton}
    >
      {day.classroomId == null ? (
        <EmptyState
          className="border"
          icon={ChalkboardIcon}
          tone="amber"
          title="No Classrooms yet"
          description="Observations and Progress Reports are kept per Classroom."
        />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value: "observations" | "reports") => {
            setTab(value);
          }}
          className="gap-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <ClassroomDayBar
              classrooms={classrooms.items}
              classroomId={day.classroomId}
              onClassroomChange={day.setClassroomId}
              date={day.date}
              today={day.today}
              onDateChange={day.setDate}
              hideDate
            />
            <TabsList aria-label="Progress view">
              <TabsTrigger value="observations" className="h-11">
                <NotebookPen aria-hidden="true" />
                Observations
              </TabsTrigger>
              <TabsTrigger value="reports" className="h-11">
                <ScrollText aria-hidden="true" />
                Progress Reports
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="observations">
            <Suspense fallback={<Loading />}>
              <ObservationsTab
                key={day.classroomId}
                classroomId={day.classroomId}
              />
            </Suspense>
          </TabsContent>
          <TabsContent value="reports">
            <Suspense fallback={<Loading />}>
              <ReportsTab key={day.classroomId} classroomId={day.classroomId} />
            </Suspense>
          </TabsContent>
        </Tabs>
      )}
      <DomainsDialog open={domainsOpen} onOpenChange={setDomainsOpen} />
    </PreschoolPage>
  );
}
