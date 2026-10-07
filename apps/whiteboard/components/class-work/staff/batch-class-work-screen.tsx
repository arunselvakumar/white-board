"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  BookOpen,
  ClipboardList,
  ExternalLink,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
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
import { Card, CardContent, CardHeader } from "@repo/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { AttachmentLinks } from "@/components/class-work/attachments";
import {
  classWorkQueries,
  removeHomework,
  removeStudyMaterial,
  type BatchClassWorkView,
  type StaffHomeworkView,
  type StudyMaterialView,
} from "@/src/queries/class-work";

import {
  dayDate,
  errorMessage,
  postedByLabel,
  setAfterPhrase,
  timestampLabel,
} from "./class-work-format";
import { HomeworkFormDialog } from "./homework-form-dialog";
import { StudyMaterialFormDialog } from "./study-material-form-dialog";

type Tab = "homework" | "materials";

function isTab(value: unknown): value is Tab {
  return value === "homework" || value === "materials";
}

type PendingRemove =
  | { kind: "homework"; id: string; title: string }
  | { kind: "material"; id: string; title: string };

export function BatchClassWorkScreen({
  batchId,
  basePath,
}: {
  batchId: string;
  /** `/batches/{id}/homework` for the Owner, `/teacher/batches/{id}/homework` for a Teacher. */
  basePath: string;
}) {
  const { data } = useSuspenseQuery(classWorkQueries.batch(batchId));
  return <BatchClassWorkContent view={data} basePath={basePath} />;
}

function backLink(basePath: string) {
  return basePath.startsWith("/teacher/")
    ? { label: "My Batches", href: "/teacher" }
    : { label: "Batches", href: "/batches" };
}

export function BatchClassWorkContent({
  view,
  basePath,
}: {
  view: BatchClassWorkView;
  basePath: string;
}) {
  const batchId = view.batch.id;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("homework");
  const [homeworkDialog, setHomeworkDialog] = useState<{
    homework: StaffHomeworkView | null;
  } | null>(null);
  const [materialDialog, setMaterialDialog] = useState<{
    material: StudyMaterialView | null;
  } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<PendingRemove | null>(
    null,
  );
  const remove = useMutation({
    mutationFn: async (target: PendingRemove): Promise<void> => {
      if (target.kind === "homework") await removeHomework(target.id);
      else await removeStudyMaterial(target.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: classWorkQueries.key.batch(batchId),
      });
      setPendingRemove(null);
    },
  });

  return (
    <main className="w-full p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          back={backLink(basePath)}
          title="Homework and Study Material"
          meta={`${view.batch.courseName} · ${view.batch.name}`}
          actions={
            view.batch.closed ? (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
              >
                Closed
              </Badge>
            ) : null
          }
        />
        {view.canEdit ? null : (
          <div className="bg-muted/50 flex items-start gap-2 rounded-2xl border p-4 text-sm">
            <Lock
              aria-hidden="true"
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
            />
            <p>
              This Batch is closed. Nothing new can be posted or edited, but you
              can still check Submissions.
            </p>
          </div>
        )}
        <Tabs
          value={tab}
          onValueChange={(value: unknown) => {
            if (isTab(value)) setTab(value);
          }}
          className="gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList aria-label="Homework and Study Material">
              <TabsTrigger value="homework" className="flex-none px-3 sm:px-4">
                Homework
                <Count value={view.homework.length} />
              </TabsTrigger>
              <TabsTrigger value="materials" className="flex-none px-3 sm:px-4">
                Study Material
                <Count value={view.materials.length} />
              </TabsTrigger>
            </TabsList>
            {view.canEdit ? (
              tab === "homework" ? (
                <Button
                  type="button"
                  onClick={() => {
                    setHomeworkDialog({ homework: null });
                  }}
                >
                  <Plus aria-hidden="true" />
                  Set homework
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => {
                    setMaterialDialog({ material: null });
                  }}
                >
                  <Plus aria-hidden="true" />
                  Share material
                </Button>
              )
            ) : null}
          </div>
          <TabsContent value="homework">
            <section aria-label="Homework" className="space-y-3">
              {view.homework.length === 0 ? (
                <HomeworkEmpty
                  canEdit={view.canEdit}
                  onSet={() => {
                    setHomeworkDialog({ homework: null });
                  }}
                />
              ) : (
                view.homework.map((homework) => (
                  <HomeworkCard
                    key={homework.id}
                    homework={homework}
                    today={view.today}
                    timezone={view.batch.timezone}
                    basePath={basePath}
                    canEdit={view.canEdit}
                    onEdit={() => {
                      setHomeworkDialog({ homework });
                    }}
                    onRemove={() => {
                      remove.reset();
                      setPendingRemove({
                        kind: "homework",
                        id: homework.id,
                        title: homework.title,
                      });
                    }}
                  />
                ))
              )}
            </section>
          </TabsContent>
          <TabsContent value="materials">
            <section aria-label="Study Material" className="space-y-3">
              {view.materials.length === 0 ? (
                <MaterialsEmpty
                  canEdit={view.canEdit}
                  onShare={() => {
                    setMaterialDialog({ material: null });
                  }}
                />
              ) : (
                view.materials.map((material) => (
                  <MaterialCard
                    key={material.id}
                    material={material}
                    timezone={view.batch.timezone}
                    canEdit={view.canEdit}
                    onEdit={() => {
                      setMaterialDialog({ material });
                    }}
                    onRemove={() => {
                      remove.reset();
                      setPendingRemove({
                        kind: "material",
                        id: material.id,
                        title: material.title,
                      });
                    }}
                  />
                ))
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>
      <HomeworkFormDialog
        open={homeworkDialog != null}
        onOpenChange={(open) => {
          if (!open) setHomeworkDialog(null);
        }}
        batchId={batchId}
        classDates={view.classDates}
        today={view.today}
        homework={homeworkDialog?.homework ?? null}
      />
      <StudyMaterialFormDialog
        open={materialDialog != null}
        onOpenChange={(open) => {
          if (!open) setMaterialDialog(null);
        }}
        batchId={batchId}
        classDates={view.classDates}
        today={view.today}
        material={materialDialog?.material ?? null}
      />
      <AlertDialog
        open={pendingRemove != null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove “{pendingRemove?.title ?? ""}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Students and Parents won’t see it any more. The Owner keeps the
              record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormAlert
            message={remove.isError ? errorMessage(remove.error) : undefined}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (pendingRemove != null) remove.mutate(pendingRemove);
              }}
            >
              {remove.isPending ? "Removing…" : "Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Count({ value }: { value: number }) {
  return (
    <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-xs tabular-nums">
      {value}
    </span>
  );
}

function RemovedBadge() {
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      Removed
    </Badge>
  );
}

function ItemActions({
  title,
  onEdit,
  onRemove,
}: {
  title: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Edit ${title}`}
        onClick={onEdit}
      >
        <Pencil aria-hidden="true" />
        Edit
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Remove ${title}`}
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" />
        Remove
      </Button>
    </div>
  );
}

/** Instructions or a note, line breaks kept, clamped when long. */
function LongText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 240 || text.split("\n").length > 3;
  return (
    <div className="space-y-1">
      <p
        className={`text-sm break-words whitespace-pre-line ${long && !expanded ? "line-clamp-3" : ""}`}
      >
        {text}
      </p>
      {long ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {children}
    </p>
  );
}

function HomeworkCard({
  homework,
  today,
  timezone,
  basePath,
  canEdit,
  onEdit,
  onRemove,
}: {
  homework: StaffHomeworkView;
  today: string;
  timezone: string;
  basePath: string;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const removed = homework.removedAt != null;
  const pastDue = today > homework.dueOn;
  const overdue = pastDue && homework.counts.notSubmitted > 0;
  const setAfter = setAfterPhrase(homework.classDate, today);
  const { counts } = homework;
  return (
    <Card
      aria-label={homework.title}
      role="article"
      className={removed ? "bg-muted/40 opacity-75" : undefined}
    >
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold break-words">
              {homework.title}
              {removed ? <RemovedBadge /> : null}
              {overdue && !removed ? (
                <Badge variant="destructive">Overdue</Badge>
              ) : null}
            </h3>
            <Meta>
              <span>Class: {dayDate(homework.classDate)}</span>
              <span
                className={
                  overdue && !removed ? "text-destructive font-medium" : ""
                }
              >
                Due: {dayDate(homework.dueOn)}
              </span>
              {setAfter == null ? null : <span>{setAfter}</span>}
            </Meta>
          </div>
          {canEdit && !removed ? (
            <ItemActions
              title={homework.title}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <LongText text={homework.instructions} />
        <AttachmentLinks attachments={homework.attachments} />
        <dl
          aria-label="Submissions"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          <Stat label="Submitted" value={counts.submitted} />
          <Stat label="Late" value={counts.late} />
          <Stat
            label="Not submitted"
            value={counts.notSubmitted}
            alert={overdue && !removed}
          />
          <Stat label="Checked" value={counts.checked} />
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            Posted by {postedByLabel(homework.postedBy)} ·{" "}
            {timestampLabel(homework.postedAt, timezone)}
          </p>
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`${basePath}/${homework.id}`} />}
          >
            <ClipboardList aria-hidden="true" />
            Review submissions
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className="bg-muted/40 rounded-lg px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={`text-lg font-semibold tabular-nums ${alert && value > 0 ? "text-destructive" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function MaterialCard({
  material,
  timezone,
  canEdit,
  onEdit,
  onRemove,
}: {
  material: StudyMaterialView;
  timezone: string;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const removed = material.removedAt != null;
  return (
    <Card
      aria-label={material.title}
      role="article"
      className={removed ? "bg-muted/40 opacity-75" : undefined}
    >
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold break-words">
              {material.title}
              {removed ? <RemovedBadge /> : null}
            </h3>
            <Meta>
              {material.classDate == null ? null : (
                <span>For {dayDate(material.classDate)}’s Class</span>
              )}
              <span>
                Posted by {postedByLabel(material.postedBy)} ·{" "}
                {timestampLabel(material.postedAt, timezone)}
              </span>
            </Meta>
          </div>
          {canEdit && !removed ? (
            <ItemActions
              title={material.title}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {material.note == null ? null : <LongText text={material.note} />}
        {material.linkUrl == null ? null : (
          <a
            href={material.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex max-w-full items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
          >
            <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{hostname(material.linkUrl)}</span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        <AttachmentLinks attachments={material.attachments} />
      </CardContent>
    </Card>
  );
}

function HomeworkEmpty({
  canEdit,
  onSet,
}: {
  canEdit: boolean;
  onSet: () => void;
}) {
  return (
    <Empty className="rounded-2xl border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ClipboardList aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No Homework yet</EmptyTitle>
        <EmptyDescription>
          {canEdit
            ? "After a Class, set Homework with a due date. Students and Parents see it and mark it done."
            : "No Homework was set for this Batch."}
        </EmptyDescription>
      </EmptyHeader>
      {canEdit ? (
        <EmptyContent>
          <Button type="button" onClick={onSet}>
            <Plus aria-hidden="true" />
            Set homework
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

function MaterialsEmpty({
  canEdit,
  onShare,
}: {
  canEdit: boolean;
  onShare: () => void;
}) {
  return (
    <Empty className="rounded-2xl border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BookOpen aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No Study Material yet</EmptyTitle>
        <EmptyDescription>
          {canEdit
            ? "Share notes, a link, or a PDF or photo with the Batch."
            : "No Study Material was shared with this Batch."}
        </EmptyDescription>
      </EmptyHeader>
      {canEdit ? (
        <EmptyContent>
          <Button type="button" onClick={onShare}>
            <Plus aria-hidden="true" />
            Share material
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
