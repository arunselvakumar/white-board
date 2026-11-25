"use client";

import { BabyIcon } from "@phosphor-icons/react/ssr";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useCallback, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";

import { CountStrip } from "@/app/(app)/preschool/_components/count-strip";
import { useStatusToast } from "@/app/(app)/preschool/_components/status-toast";
import {
  applyPreschoolDailyReportToClassroom,
  preschoolDailyReportKeys,
  preschoolDailyReportsDayQueryOptions,
  publishPreschoolDailyReports,
  savePreschoolDailyReport,
  type PreschoolClassroomDailyReports,
} from "@/src/queries/preschool/daily-reports";

import { ChildReportCard } from "./child-report-card";
import { ClassItemsCard } from "./class-items-card";
import { dailyReportErrorMessage } from "./daily-report-errors";

type RosterChild = PreschoolClassroomDailyReports["children"][number];

/** Present first, then not yet marked, then absent and on leave; by name within each. */
function rank(child: RosterChild): number {
  if (child.attendance === "present") return 0;
  if (child.attendance == null) return 1;
  return 2;
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** One Classroom's Daily Reports for a day. */
export function DailyReportsDay({
  classroomId,
  date,
}: {
  classroomId: string;
  date: string;
}) {
  const queryClient = useQueryClient();
  const options = preschoolDailyReportsDayQueryOptions(classroomId, date);
  const { data } = useSuspenseQuery(options);
  const { show, toast } = useStatusToast();
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const markDirty = useCallback((childId: string, isDirty: boolean) => {
    setDirty((current) => {
      if (current.has(childId) === isDirty) return current;
      const next = new Set(current);
      if (isDirty) next.add(childId);
      else next.delete(childId);
      return next;
    });
  }, []);

  const refreshLater = () =>
    queryClient.invalidateQueries({
      queryKey: preschoolDailyReportKeys.all,
      refetchType: "none",
    });

  const publish = useMutation({
    mutationFn: () => publishPreschoolDailyReports({ classroomId, date }),
    onSuccess: async (result) => {
      setConfirming(false);
      show(
        `${plural(result.published, "report", "reports")} sent to Parents.`,
        "info",
      );
      await queryClient.invalidateQueries({ queryKey: options.queryKey });
    },
    onError: (error) => {
      setConfirming(false);
      show(dailyReportErrorMessage(error));
    },
  });

  const children = [...data.children].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );
  const counts = { published: 0, drafts: 0, none: 0 };
  for (const child of data.children) {
    if (child.report == null) counts.none += 1;
    else if (child.report.status === "draft") counts.drafts += 1;
    else counts.published += 1;
  }
  const present = data.children.filter(
    (child) => child.attendance === "present",
  ).length;

  return (
    <div className="space-y-4 pb-24">
      {data.editable ? null : (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Badge variant="outline">Read only</Badge>
          You can view this day but not change it.
        </p>
      )}
      <CountStrip
        label="Daily Report counts"
        items={[
          { label: "Published", value: counts.published, tone: "green" },
          { label: "Draft", value: counts.drafts, tone: "amber" },
          { label: "Not started", value: counts.none, tone: "muted" },
        ]}
      />
      {data.children.length === 0 ? (
        <EmptyState
          className="border"
          size="md"
          icon={BabyIcon}
          tone="violet"
          title="No Children in this Classroom"
          description="Daily Reports are written for the Children admitted to the Classroom."
        />
      ) : (
        <>
          {data.editable ? (
            <ClassItemsCard
              day={data}
              presentCount={present}
              onApply={async (input) => {
                const day = await applyPreschoolDailyReportToClassroom({
                  ...input,
                  classroomId,
                  date,
                });
                queryClient.setQueryData(options.queryKey, day);
                await refreshLater();
              }}
            />
          ) : null}
          <ul aria-label="Daily Reports" className="space-y-2">
            {children.map((child) => (
              <ChildReportCard
                key={child.childId}
                child={child}
                editable={data.editable}
                onDirtyChange={(isDirty) => {
                  markDirty(child.childId, isDirty);
                }}
                onSave={async (content) => {
                  const report = await savePreschoolDailyReport({
                    ...content,
                    childId: child.childId,
                    date,
                  });
                  queryClient.setQueryData<PreschoolClassroomDailyReports>(
                    options.queryKey,
                    (day) =>
                      day == null
                        ? day
                        : {
                            ...day,
                            children: day.children.map((each) =>
                              each.childId === child.childId
                                ? { ...each, report }
                                : each,
                            ),
                          },
                  );
                  await refreshLater();
                }}
              />
            ))}
          </ul>
        </>
      )}
      {data.editable && counts.drafts > 0 ? (
        <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 z-10 -mx-4 border-t px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <Button
            type="button"
            className="h-12 w-full text-base sm:w-auto"
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Send aria-hidden="true" />
            Publish {plural(counts.drafts, "report", "reports")} to Parents
          </Button>
        </div>
      ) : null}
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) setConfirming(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Publish {plural(counts.drafts, "Daily Report", "Daily Reports")}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each Child&apos;s Parents are emailed that today&apos;s report is
              ready. You can still change a report after it is sent.
              {dirty.size > 0
                ? ` ${plural(dirty.size, "report has", "reports have")} unsaved changes; they are sent as last saved.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <Button
              type="button"
              disabled={publish.isPending}
              onClick={() => {
                publish.mutate();
              }}
            >
              {publish.isPending ? "Publishing…" : "Publish"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {toast}
    </div>
  );
}
