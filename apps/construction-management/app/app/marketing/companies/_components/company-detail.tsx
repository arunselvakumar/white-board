"use client";

import { formatMobile } from "@repo/auth/construction/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
  UserRound,
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
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";

import { activityRecordedLabel } from "@/app/app/_components/activity/activity-feed";
import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { COMPANY_SOURCE_LABELS } from "@/src/marketing/domain/marketing-terms";
import {
  companyErrorMessage,
  companyPath,
  companyQuery,
  useContactCommand,
  useDeleteCompany,
  type ProspectCompany,
  type ProspectCompanyContact,
  type ProspectCompanyTimelineItem,
} from "@/src/queries/marketing-companies";
import { visitPath } from "@/src/queries/marketing-visits";
import { gstStateName } from "@/src/shared-kernel/gst-states";

import { VisitButtons } from "../../_components/visit-buttons";
import {
  lostReasonWords,
  StageBadge,
  stageEntryByline,
  stageEntryWords,
  visitEntryWords,
} from "./company-parts";
import { ContactDialog } from "./contact-dialog";
import { MoveStageDialog } from "./move-stage-dialog";

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

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = `company-${title.toLowerCase()}-heading`;
  return (
    <section
      aria-labelledby={id}
      className="bg-card min-w-0 space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function website(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/** "Chennai, Tamil Nadu 600032" from what is known. */
function place(company: ProspectCompany): string | null {
  const state =
    company.stateCode == null ? null : gstStateName(company.stateCode);
  const parts = [company.city, state].filter(
    (part): part is string => part != null,
  );
  const line = parts.join(", ");
  if (company.pin == null) return line === "" ? null : line;
  return line === "" ? company.pin : `${line} ${company.pin}`;
}

function Details({ company }: { company: ProspectCompany }) {
  const where = place(company);
  const lost = lostReasonWords(company.lostReason, company.lostReasonText);
  return (
    <Card title="Details">
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {company.stage === "lost" && lost != null && (
          <Fact label="Lost Reason" className="sm:col-span-2 lg:col-span-3">
            {lost}
          </Fact>
        )}
        <Fact label="Industry">{company.industry ?? "—"}</Fact>
        <Fact label="Source">
          {company.source == null ? "—" : COMPANY_SOURCE_LABELS[company.source]}
        </Fact>
        <Fact label="Marketing Person">{company.assignedTo?.name ?? "—"}</Fact>
        <Fact label="Phone">
          {company.phone == null ? (
            "—"
          ) : (
            <a
              href={`tel:${company.phone}`}
              className="underline-offset-4 hover:underline"
            >
              {company.phone}
            </a>
          )}
        </Fact>
        <Fact label="Email">
          {company.email == null ? (
            "—"
          ) : (
            <a
              href={`mailto:${company.email}`}
              className="underline-offset-4 hover:underline"
            >
              {company.email}
            </a>
          )}
        </Fact>
        <Fact label="Website">
          {company.website == null ? (
            "—"
          ) : (
            <a
              href={website(company.website)}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {company.website}
            </a>
          )}
        </Fact>
        <Fact label="GSTIN">
          <span className="font-mono">{company.gstin ?? "—"}</span>
        </Fact>
        <Fact label="City, State and PIN">{where ?? "—"}</Fact>
        <Fact label="Added by">{company.createdByName}</Fact>
        {company.address != null && (
          <Fact label="Address" className="sm:col-span-2 lg:col-span-3">
            {company.address}
          </Fact>
        )}
        {company.remarks != null && (
          <Fact label="Remarks" className="sm:col-span-2 lg:col-span-3">
            {company.remarks}
          </Fact>
        )}
      </dl>
    </Card>
  );
}

function Contacts({
  company,
  onError,
}: {
  company: ProspectCompany;
  onError: (message: string | null) => void;
}) {
  const command = useContactCommand(company.id);
  const canUpdate = company.actions.canUpdate;
  const [editing, setEditing] = useState<{
    contact: ProspectCompanyContact | null;
  } | null>(null);
  const [removing, setRemoving] = useState<ProspectCompanyContact | null>(null);

  const makePrimary = (contact: ProspectCompanyContact) => {
    onError(null);
    command.mutate(
      {
        kind: "update",
        contactId: contact.id,
        input: {
          name: contact.name,
          jobTitle: contact.jobTitle,
          mobile: contact.mobile,
          email: contact.email,
          remarks: contact.remarks,
          isPrimary: true,
          expectedUpdatedAt: contact.updatedAt,
        },
      },
      {
        onError: (caught) => {
          onError(companyErrorMessage(caught));
        },
      },
    );
  };

  return (
    <Card
      title="Contacts"
      action={
        canUpdate ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing({ contact: null });
            }}
          >
            <Plus aria-hidden="true" />
            Add Contact
          </Button>
        ) : undefined
      }
    >
      {company.contacts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No Contacts yet.
          {canUpdate ? " Add the people you meet there." : ""}
        </p>
      ) : (
        <ul aria-label="Contacts" className="divide-y">
          {company.contacts.map((contact) => (
            <li
              key={contact.id}
              className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              <UserRound
                aria-hidden="true"
                className="text-muted-foreground mt-0.5 size-4 shrink-0"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium break-words">
                    {contact.name}
                  </span>
                  {contact.isPrimary && (
                    <Badge variant="secondary">Primary</Badge>
                  )}
                </p>
                {contact.jobTitle != null && (
                  <p className="text-muted-foreground text-sm">
                    {contact.jobTitle}
                  </p>
                )}
                <p className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
                  {contact.mobile != null && (
                    <a
                      href={`tel:${contact.mobile}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {formatMobile(contact.mobile)}
                    </a>
                  )}
                  {contact.email != null && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="break-all underline-offset-4 hover:underline"
                    >
                      {contact.email}
                    </a>
                  )}
                </p>
                {contact.remarks != null && (
                  <p className="text-sm whitespace-pre-line">
                    {contact.remarks}
                  </p>
                )}
              </div>
              {canUpdate && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Actions for ${contact.name}`}
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing({ contact });
                      }}
                    >
                      <Pencil aria-hidden="true" />
                      Edit
                    </DropdownMenuItem>
                    {!contact.isPrimary && (
                      <DropdownMenuItem
                        onClick={() => {
                          makePrimary(contact);
                        }}
                      >
                        <Star aria-hidden="true" />
                        Make primary
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setRemoving(contact);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}
      {canUpdate && (
        <ContactDialog
          company={company}
          contact={editing?.contact ?? null}
          open={editing != null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
      <AlertDialog
        open={removing != null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove ${removing?.name ?? "this Contact"}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.isPrimary === true && company.contacts.length > 1
                ? "They are the primary Contact; the earliest other Contact becomes primary."
                : "They leave this company's Contacts."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={command.isPending}
              onClick={() => {
                if (removing == null) return;
                onError(null);
                command.mutate(
                  {
                    kind: "delete",
                    contactId: removing.id,
                    expectedUpdatedAt: removing.updatedAt,
                  },
                  {
                    onSuccess: () => {
                      setRemoving(null);
                    },
                    onError: (caught) => {
                      setRemoving(null);
                      onError(companyErrorMessage(caught));
                    },
                  },
                );
              }}
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function TimelineText({
  item,
  timeZone,
}: {
  item: ProspectCompanyTimelineItem;
  timeZone: string;
}) {
  switch (item.kind) {
    case "stage": {
      const lost =
        item.toStage === "lost"
          ? lostReasonWords(item.lostReason, item.lostReasonText)
          : null;
      return (
        <>
          <p>
            <span className="font-medium">{stageEntryWords(item)}</span>
            <span className="text-muted-foreground">
              {` · ${stageEntryByline(item, timeZone)}`}
            </span>
          </p>
          {lost != null && (
            <p className="text-muted-foreground break-words">
              {`Lost Reason: ${lost}`}
            </p>
          )}
        </>
      );
    }
    case "visit": {
      const [number, ...rest] = visitEntryWords(item).split(" · ");
      return (
        <>
          <p className="break-words">
            <Link
              href={visitPath(item.id)}
              className="font-medium underline-offset-4 hover:underline"
            >
              {number}
            </Link>
            <span className="font-medium">
              {rest.length === 0 ? "" : ` · ${rest.join(" · ")}`}
            </span>
          </p>
          <p className="text-muted-foreground break-words">
            {activityRecordedLabel(item.at, timeZone)}
            {item.outcome == null ? "" : ` · ${item.outcome}`}
          </p>
        </>
      );
    }
    case "note":
      return (
        <>
          <p className="break-words whitespace-pre-line">
            <span className="font-medium">
              {"Note on "}
              <Link
                href={visitPath(item.visitId)}
                className="underline-offset-4 hover:underline"
              >
                {item.visitNumber}
              </Link>
              {": "}
            </span>
            {item.text}
          </p>
          <p className="text-muted-foreground">
            {stageEntryByline(item, timeZone)}
          </p>
        </>
      );
  }
}

const DOT_CLASSES: Record<ProspectCompanyTimelineItem["kind"], string> = {
  stage: "bg-primary/60",
  visit: "bg-emerald-500/70",
  note: "bg-muted-foreground/50",
};

/** Stage changes, Visits and their notes, newest first. */
function History({
  company,
  timeZone,
}: {
  company: ProspectCompany;
  timeZone: string;
}) {
  return (
    <Card title="History">
      <ol aria-label="History" className="space-y-3">
        {company.timeline.map((item) => (
          <li key={`${item.kind}-${item.id}`} className="flex min-w-0 gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                DOT_CLASSES[item.kind],
              )}
            />
            <div className="min-w-0 text-sm">
              <TimelineText item={item} timeZone={timeZone} />
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * One Prospect Company: its details, Contacts and the history of its
 * Stage, with Edit, Move Stage and Delete as the server's `actions` allow.
 */
export function CompanyDetail({
  id,
  canPlanVisit = false,
}: {
  id: string;
  /** Visits create: Plan Visit and Log Visit for this company. */
  canPlanVisit?: boolean;
}) {
  const router = useRouter();
  const { data: company } = useSuspenseQuery(companyQuery(id));
  const remove = useDeleteCompany(company.id);
  const [dialog, setDialog] = useState<"stage" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { canUpdate, canDelete } = company.actions;
  const meta = [company.assignedTo?.name, company.city]
    .filter((part): part is string => part != null)
    .join(" · ");

  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-6xl min-w-0 flex-col gap-6">
        <PageHeader
          back={{ label: "Prospect Companies", href: companyPath() }}
          title={company.name}
          meta={
            <span className="flex flex-wrap items-center gap-2">
              <StageBadge stage={company.stage} />
              {meta === "" ? null : <span>{meta}</span>}
            </span>
          }
          actions={
            canUpdate || canDelete || canPlanVisit ? (
              <div className="flex flex-wrap gap-2">
                {canPlanVisit && (
                  <VisitButtons prospectCompanyId={company.id} />
                )}
                {(canUpdate || canDelete) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button type="button" variant="outline" />}
                    >
                      <MoreHorizontal aria-hidden="true" />
                      Actions
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {canUpdate && (
                        <DropdownMenuItem
                          render={
                            <Link href={`${companyPath(company.id)}/edit`} />
                          }
                        >
                          <Pencil aria-hidden="true" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      {canUpdate && (
                        <DropdownMenuItem
                          onClick={() => {
                            setDialog("stage");
                          }}
                        >
                          <ArrowRightLeft aria-hidden="true" />
                          Move Stage
                        </DropdownMenuItem>
                      )}
                      {canDelete && canUpdate && <DropdownMenuSeparator />}
                      {canDelete && (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            setDialog("delete");
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ) : undefined
          }
        />

        <FormAlert message={error ?? undefined} />

        <div className="grid w-full min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-6">
            <Details company={company} />
            <Contacts company={company} onError={setError} />
          </div>
          <History company={company} timeZone={company.timeZone} />
        </div>
      </div>

      {canUpdate && (
        <MoveStageDialog
          company={company}
          open={dialog === "stage"}
          onOpenChange={(open) => {
            setDialog(open ? "stage" : null);
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
            <AlertDialogTitle>{`Delete ${company.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              The company leaves the list with its Contacts. A company with
              Visits cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                setError(null);
                remove.mutate(company.updatedAt, {
                  onSuccess: () => {
                    router.push(companyPath());
                  },
                  onError: (caught) => {
                    setDialog(null);
                    setError(companyErrorMessage(caught));
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
