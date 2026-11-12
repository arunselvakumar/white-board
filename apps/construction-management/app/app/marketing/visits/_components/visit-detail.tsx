"use client";

import { formatMobile } from "@repo/auth/construction/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarClock,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  VISIT_LIMITS,
  VISIT_PURPOSE_LABELS,
  WORK_TYPE_LABELS,
} from "@/src/marketing/domain/marketing-terms";
import { companyPath } from "@/src/queries/marketing-companies";
import {
  useAddVisitNote,
  useDeleteVisit,
  visitErrorMessage,
  visitPath,
  visitQuery,
  type Visit,
} from "@/src/queries/marketing-visits";

import { CancelVisitDialog, RescheduleVisitDialog } from "./visit-dialogs";
import { VisitFiles } from "./visit-files";
import { VisitFollowUps, type VisitFollowUpAccess } from "./visit-follow-ups";
import {
  historyWords,
  InterestBadge,
  monthWords,
  VisitStatusBadge,
  visitWhen,
  wholeRupees,
} from "./visit-parts";

function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = `visit-${title.toLowerCase().replace(/\s+/g, "-")}-heading`;
  return (
    <section
      aria-labelledby={id}
      className="bg-card min-w-0 space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** "Civil · ₹ 25,00,000 · from Mar 2027", or null when nothing is known. */
function requirementWords(visit: Visit): string | null {
  const parts = [
    visit.requirementWorkType == null
      ? null
      : WORK_TYPE_LABELS[visit.requirementWorkType],
    visit.requirementValue == null ? null : wholeRupees(visit.requirementValue),
    visit.requirementStartMonth == null
      ? null
      : `from ${monthWords(visit.requirementStartMonth)}`,
  ].filter((part): part is string => part != null);
  return parts.length === 0 ? null : parts.join(" · ");
}

function Details({ visit }: { visit: Visit }) {
  const requirement = requirementWords(visit);
  return (
    <Card title="Details">
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
        {visit.status === "cancelled" && visit.cancelReason != null && (
          <Fact label="Cancelled because" className="sm:col-span-2">
            {visit.cancelReason}
          </Fact>
        )}
        <Fact label="Purpose">
          {visit.purpose == null ? "—" : VISIT_PURPOSE_LABELS[visit.purpose]}
        </Fact>
        <Fact label="Interest">
          <InterestBadge interest={visit.interest} />
        </Fact>
        <Fact label="Location" className="sm:col-span-2">
          {visit.location ?? "—"}
        </Fact>
        <Fact label="Outcome" className="sm:col-span-2">
          {visit.outcome ?? "—"}
        </Fact>
        <Fact label="Requirement" className="sm:col-span-2">
          {requirement ?? "—"}
        </Fact>
        <Fact label="Visited by">
          {visit.visitors.map((person) => person.name).join(", ") || "—"}
        </Fact>
        <Fact label="Added by">{visit.createdByName}</Fact>
      </dl>
      <div className="min-w-0 space-y-2">
        <h3 className="text-muted-foreground text-xs">Points of contact</h3>
        {visit.contacts.length === 0 ? (
          <p className="text-sm">—</p>
        ) : (
          <ul aria-label="Points of contact" className="space-y-2">
            {visit.contacts.map((contact) => (
              <li key={contact.id} className="flex min-w-0 items-start gap-2">
                <UserRound
                  aria-hidden="true"
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                />
                <p className="min-w-0 text-sm">
                  <span className="font-medium">{contact.name}</span>
                  {contact.jobTitle != null && (
                    <span className="text-muted-foreground">{` · ${contact.jobTitle}`}</span>
                  )}
                  {contact.mobile != null && (
                    <>
                      {" · "}
                      <a
                        href={`tel:${contact.mobile}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {formatMobile(contact.mobile)}
                      </a>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Notes({ visit }: { visit: Visit }) {
  const add = useAddVisitNote(visit.id);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tooLong = note.trim().length > VISIT_LIMITS.note;

  const save = () => {
    if (note.trim() === "") {
      setError("Write the note.");
      return;
    }
    if (tooLong) return;
    setError(null);
    const sent = note;
    add.mutate(
      { text: sent },
      {
        onSuccess: () => {
          // Typing on while it saved starts the next note: keep that.
          setNote((current) => (current === sent ? "" : current));
        },
        onError: (caught) => {
          setError(visitErrorMessage(caught));
        },
      },
    );
  };

  return (
    <Card title="Notes">
      {visit.actions.canAddNote && (
        <div className="space-y-2">
          <Label htmlFor="visit-note">Add note</Label>
          <Textarea
            id="visit-note"
            rows={3}
            placeholder="What happened after the Visit"
            value={note}
            aria-invalid={error != null || tooLong}
            aria-describedby={
              error != null || tooLong ? "visit-note-error" : undefined
            }
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
          <FieldError
            id="visit-note-error"
            message={
              tooLong
                ? `Keep the note to ${String(VISIT_LIMITS.note)} characters.`
                : (error ?? undefined)
            }
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={add.isPending}
              onClick={save}
            >
              {add.isPending ? "Saving…" : "Add note"}
            </Button>
          </div>
        </div>
      )}
      {visit.notes.length === 0 ? (
        <p className="text-muted-foreground text-sm">No notes yet.</p>
      ) : (
        <ol aria-label="Notes" className="divide-y">
          {visit.notes.map((item) => (
            <li key={item.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
              <p className="text-sm break-words whitespace-pre-line">
                {item.text}
              </p>
              <p className="text-muted-foreground text-xs">
                {`${item.byName} · ${visitWhen(item.at, visit.timeZone)}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function History({ visit }: { visit: Visit }) {
  // Logged straight as completed: its first entry says so, not "Planned".
  const plannedAtFirst = !(
    visit.status === "completed" &&
    !visit.history.some((item) => item.action === "completed")
  );
  return (
    <Card title="History">
      {visit.history.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing yet.</p>
      ) : (
        <ol aria-label="History" className="space-y-3">
          {visit.history.map((item) => (
            <li key={item.id} className="flex min-w-0 gap-3">
              <span
                aria-hidden="true"
                className="bg-primary/60 mt-1.5 size-2 shrink-0 rounded-full"
              />
              <p className="min-w-0 text-sm break-words">
                <span className="font-medium">
                  {historyWords(item, visit.timeZone, plannedAtFirst)}
                </span>
                <span className="text-muted-foreground">
                  {` · by ${item.byName} · ${visitWhen(item.at, visit.timeZone)}`}
                </span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

type Open = "reschedule" | "cancel" | "delete" | null;

/**
 * One Visit: its company, people and what was discussed, its photos and
 * files, notes, Follow-ups and history, with Edit, Complete, Reschedule,
 * Cancel and Delete as the server's `actions` allow.
 */
export function VisitDetail({
  id,
  followUps = null,
}: {
  id: string;
  /** Follow-ups read: the Follow-ups card; null hides it. */
  followUps?: VisitFollowUpAccess | null;
}) {
  const router = useRouter();
  const { data: visit } = useSuspenseQuery(visitQuery(id));
  const remove = useDeleteVisit(visit.id);
  const [dialog, setDialog] = useState<Open>(null);
  const [error, setError] = useState<string | null>(null);
  const { actions } = visit;
  const company = visit.prospectCompany;
  const menu =
    actions.canUpdate ||
    actions.canReschedule ||
    actions.canCancel ||
    actions.canDelete;

  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-6xl min-w-0 flex-col gap-6">
        <PageHeader
          back={{ label: "Visits", href: visitPath() }}
          title={visit.number}
          meta={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <VisitStatusBadge status={visit.status} />
              {company.canOpen ? (
                <Link
                  href={companyPath(company.id)}
                  className="text-foreground font-medium hover:underline"
                >
                  {company.name}
                </Link>
              ) : (
                <span className="text-foreground font-medium">
                  {company.name}
                </span>
              )}
              <span>{visitWhen(visit.visitAt, visit.timeZone)}</span>
            </span>
          }
          actions={
            actions.canComplete || menu ? (
              <div className="flex flex-wrap gap-2">
                {actions.canComplete && (
                  <Link
                    href={`${visitPath(visit.id)}/complete`}
                    className={buttonVariants()}
                  >
                    <CalendarCheck aria-hidden="true" />
                    Complete
                  </Link>
                )}
                {menu && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button type="button" variant="outline" />}
                    >
                      <MoreHorizontal aria-hidden="true" />
                      Actions
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {actions.canUpdate && (
                        <DropdownMenuItem
                          render={<Link href={`${visitPath(visit.id)}/edit`} />}
                        >
                          <Pencil aria-hidden="true" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      {actions.canReschedule && (
                        <DropdownMenuItem
                          onClick={() => {
                            setDialog("reschedule");
                          }}
                        >
                          <CalendarClock aria-hidden="true" />
                          Reschedule
                        </DropdownMenuItem>
                      )}
                      {actions.canCancel && (
                        <DropdownMenuItem
                          onClick={() => {
                            setDialog("cancel");
                          }}
                        >
                          <XCircle aria-hidden="true" />
                          Cancel Visit
                        </DropdownMenuItem>
                      )}
                      {actions.canDelete && (
                        <>
                          {(actions.canUpdate ||
                            actions.canReschedule ||
                            actions.canCancel) && <DropdownMenuSeparator />}
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => {
                              setDialog("delete");
                            }}
                          >
                            <Trash2 aria-hidden="true" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ) : undefined
          }
        />

        {actions.locked && (
          <p
            role="note"
            className="bg-muted text-muted-foreground flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Locked: a completed Visit can be changed by the person who logged it
            for 7 days. Notes can still be added.
          </p>
        )}

        <FormAlert message={error ?? undefined} />

        <div className="grid w-full min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-6">
            <Details visit={visit} />
            <Card title="Discussion">
              <p className="text-sm break-words whitespace-pre-line">
                {visit.discussion ?? (
                  <span className="text-muted-foreground">
                    {visit.status === "completed"
                      ? "—"
                      : "Written when the Visit is completed."}
                  </span>
                )}
              </p>
            </Card>
            <VisitFiles visit={visit} />
            <Notes visit={visit} />
          </div>
          <div className="min-w-0 space-y-6">
            {followUps != null && (
              <VisitFollowUps visit={visit} access={followUps} />
            )}
            <History visit={visit} />
          </div>
        </div>
      </div>

      {actions.canReschedule && (
        <RescheduleVisitDialog
          key={visit.updatedAt}
          visit={visit}
          open={dialog === "reschedule"}
          onOpenChange={(open) => {
            setDialog(open ? "reschedule" : null);
          }}
        />
      )}
      {actions.canCancel && (
        <CancelVisitDialog
          visit={visit}
          open={dialog === "cancel"}
          onOpenChange={(open) => {
            setDialog(open ? "cancel" : null);
          }}
        />
      )}
      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete ${visit.number}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              The Visit leaves the list and its company&apos;s history, with its
              notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                setError(null);
                remove.mutate(visit.updatedAt, {
                  onSuccess: () => {
                    router.push(visitPath());
                  },
                  onError: (caught) => {
                    setDialog(null);
                    setError(visitErrorMessage(caught));
                  },
                });
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
