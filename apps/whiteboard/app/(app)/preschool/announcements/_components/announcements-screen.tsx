"use client";

import { MegaphoneIcon, MagnifyingGlassIcon } from "@phosphor-icons/react/ssr";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { MoreVertical, Plus } from "lucide-react";
import { Suspense, useDeferredValue, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { EmptyState } from "@repo/ui/components/empty-state";
import { FilterTabs } from "@repo/ui/components/filter-tabs";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FormAlert } from "@/components/auth/form-alert";
import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import type { Option } from "@/app/(app)/preschool/_components/form-fields";
import {
  formatDate,
  formatDateTime,
} from "@/app/(app)/preschool/_components/preschool-format";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { QueryHttpError } from "@/src/queries/http";
import {
  createPreschoolAnnouncement,
  PRESCHOOL_ANNOUNCEMENT_KIND_LABELS,
  preschoolAnnouncementKeys,
  preschoolAnnouncementsQueryOptions,
  preschoolUpcomingAnnouncementsQueryOptions,
  removePreschoolAnnouncement,
  updatePreschoolAnnouncement,
  type CreatePreschoolAnnouncementInput,
  type PreschoolAnnouncement,
  type PreschoolAnnouncementKind,
} from "@/src/queries/preschool/announcements";
import { classroomsQueryOptions } from "@/src/queries/preschool/classrooms";

import {
  ALL_CENTRES,
  AnnouncementForm,
  WHOLE_CENTRE,
} from "./announcement-form";

type KindFilter = PreschoolAnnouncementKind | "all";

const KIND_TABS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "notice", label: "Notices" },
  { value: "event", label: "Events" },
  { value: "holiday", label: "Holidays" },
];

const KIND_BADGE = {
  notice: "secondary",
  event: "default",
  holiday: "outline",
} as const;

/** "25 Dec 2026", or "24 – 26 Dec 2026" style for several days. */
export function dateRange(
  announcement: Pick<PreschoolAnnouncement, "startsOn" | "endsOn">,
): string | null {
  if (announcement.startsOn == null) return null;
  if (
    announcement.endsOn == null ||
    announcement.endsOn === announcement.startsOn
  )
    return formatDate(announcement.startsOn);
  return `${formatDate(announcement.startsOn)} – ${formatDate(announcement.endsOn)}`;
}

function ComingUp({ centreId }: { centreId: string }) {
  const { data } = useQuery(
    preschoolUpcomingAnnouncementsQueryOptions(centreId),
  );
  if (data == null || data.items.length === 0) return null;
  return (
    <section aria-labelledby="coming-up-heading" className="space-y-2">
      <h2 id="coming-up-heading" className="text-sm font-semibold">
        Coming up
      </h2>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {data.items.map((item) => (
          <li
            key={item.id}
            className="bg-card min-w-52 shrink-0 rounded-xl border p-3 text-sm"
          >
            <p className="text-muted-foreground text-xs">
              {PRESCHOOL_ANNOUNCEMENT_KIND_LABELS[item.kind]} ·{" "}
              {dateRange(item)}
            </p>
            <p className="font-medium">{item.title}</p>
            <p className="text-muted-foreground text-xs">{item.audience}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AnnouncementCard({
  announcement,
  onEdit,
  onRemove,
}: {
  announcement: PreschoolAnnouncement;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const dates = dateRange(announcement);
  return (
    <li className="bg-card space-y-2 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={KIND_BADGE[announcement.kind]}>
              {PRESCHOOL_ANNOUNCEMENT_KIND_LABELS[announcement.kind]}
            </Badge>
            <span className="text-muted-foreground">
              For {announcement.audience}
            </span>
          </p>
          <h3 className="font-semibold break-words">{announcement.title}</h3>
          {dates == null ? null : <p className="text-sm">{dates}</p>}
        </div>
        {announcement.canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Actions for ${announcement.title}`}
                />
              }
            >
              <MoreVertical aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onRemove}>
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <p className="text-sm break-words whitespace-pre-line">
        {announcement.body}
      </p>
      <p className="text-muted-foreground text-xs">
        {announcement.createdByName} ·{" "}
        {formatDateTime(announcement.publishedAt)}
      </p>
    </li>
  );
}

function Feed({
  centreId,
  kind,
  cursors,
  onPage,
  onEdit,
  onRemove,
  emptyAction,
}: {
  centreId: string;
  kind: KindFilter;
  cursors: string[];
  onPage: (cursors: string[]) => void;
  onEdit: (announcement: PreschoolAnnouncement) => void;
  onRemove: (announcement: PreschoolAnnouncement) => void;
  emptyAction: React.ReactNode;
}) {
  const { data } = useSuspenseQuery(
    preschoolAnnouncementsQueryOptions(
      centreId,
      kind === "all" ? undefined : kind,
      cursors.at(-1),
    ),
  );
  if (data.items.length === 0)
    return kind === "all" ? (
      <EmptyState
        className="border"
        icon={MegaphoneIcon}
        tone="pink"
        title="No Announcements yet"
        description="Tell Parents about holidays, events and anything else, for the whole Centre or one Classroom."
        actions={emptyAction}
      />
    ) : (
      <EmptyState
        size="sm"
        className="border"
        icon={MagnifyingGlassIcon}
        tone="neutral"
        title={`No ${PRESCHOOL_ANNOUNCEMENT_KIND_LABELS[kind].toLowerCase()}s`}
      />
    );
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {data.items.map((announcement) => (
          <AnnouncementCard
            key={announcement.id}
            announcement={announcement}
            onEdit={() => {
              onEdit(announcement);
            }}
            onRemove={() => {
              onRemove(announcement);
            }}
          />
        ))}
      </ul>
      {cursors.length === 0 && data.nextCursor == null ? null : (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cursors.length === 0}
            onClick={() => {
              onPage(cursors.slice(0, -1));
            }}
          >
            Newer
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null)
                onPage([...cursors, data.nextCursor]);
            }}
          >
            Older
          </Button>
        </div>
      )}
    </div>
  );
}

/** The audiences this role may post to, in the active Centre. */
function useAudiences(): {
  audiences: Option[];
  kinds: PreschoolAnnouncementKind[];
} {
  const { me, centre } = useActiveCentre();
  const { data } = useQuery(classroomsQueryOptions(centre.id));
  const rooms = (data?.items ?? [])
    .filter(
      (room) => me.role !== "teacher" || me.classroomIds.includes(room.id),
    )
    .map((room) => ({ value: room.id, label: room.name }));
  if (me.role === "teacher")
    return { audiences: rooms, kinds: ["notice", "event"] };
  return {
    audiences: [
      ...(me.role === "owner"
        ? [{ value: ALL_CENTRES, label: "All Centres" }]
        : []),
      { value: WHOLE_CENTRE, label: `${centre.name} (whole Centre)` },
      ...rooms,
    ],
    kinds: ["notice", "event", "holiday"],
  };
}

/** Notices, events and holidays for Parents, from this Centre and Head Office. */
export function AnnouncementsScreen() {
  const { centre } = useActiveCentre();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<KindFilter>("all");
  const [cursors, setCursors] = useState<string[]>([]);
  const shown = useDeferredValue({ kind, cursors });
  const [composing, setComposing] = useState<
    | { mode: "new" }
    | { mode: "edit"; announcement: PreschoolAnnouncement }
    | null
  >(null);
  const [removing, setRemoving] = useState<PreschoolAnnouncement | null>(null);
  const [removeError, setRemoveError] = useState<string>();
  const { audiences, kinds } = useAudiences();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: preschoolAnnouncementKeys.all });
  const newButton = (
    <Button
      type="button"
      onClick={() => {
        setComposing({ mode: "new" });
      }}
    >
      <Plus aria-hidden="true" />
      New Announcement
    </Button>
  );

  return (
    <PreschoolPage
      title="Announcements"
      watermark="Announcements"
      actions={newButton}
    >
      <ComingUp centreId={centre.id} />
      <FilterTabs
        aria-label="Kind"
        value={kind}
        onValueChange={(next) => {
          setKind(next);
          setCursors([]);
        }}
        items={KIND_TABS}
      />
      <FormAlert message={removeError} />
      <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
        <Feed
          centreId={centre.id}
          kind={shown.kind}
          cursors={shown.cursors}
          onPage={setCursors}
          onEdit={(announcement) => {
            setComposing({ mode: "edit", announcement });
          }}
          onRemove={setRemoving}
          emptyAction={newButton}
        />
      </Suspense>
      <Dialog
        open={composing != null}
        onOpenChange={(open) => {
          if (!open) setComposing(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {composing?.mode === "edit"
                ? "Edit Announcement"
                : "New Announcement"}
            </DialogTitle>
          </DialogHeader>
          {composing == null ? null : (
            <AnnouncementForm
              centreId={centre.id}
              audiences={audiences}
              kinds={kinds}
              editing={
                composing.mode === "edit" ? composing.announcement : undefined
              }
              onCancel={() => {
                setComposing(null);
              }}
              onSubmit={async (input) => {
                if (composing.mode === "edit")
                  await updatePreschoolAnnouncement(
                    composing.announcement.id,
                    input,
                  );
                else
                  await createPreschoolAnnouncement(
                    input as CreatePreschoolAnnouncementInput,
                  );
                await refresh();
                setComposing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={removing != null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from every feed. Emails already sent stay sent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const target = removing;
                setRemoving(null);
                if (target == null) return;
                setRemoveError(undefined);
                void removePreschoolAnnouncement(target.id)
                  .then(refresh)
                  .catch((error: unknown) => {
                    setRemoveError(
                      error instanceof QueryHttpError
                        ? error.message
                        : "Could not remove it. Please try again.",
                    );
                  });
              }}
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PreschoolPage>
  );
}
