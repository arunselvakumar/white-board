"use client";

import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
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
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

import { FormAlert } from "@/components/auth/form-alert";
import { ReasonDialog } from "@/components/contracts/work-orders/work-order-dialogs";
import { formatPaise } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  ADVANCE_KIND_LABELS,
  GUARANTEE_PURPOSE_LABELS,
  RETENTION_STAGE_LABELS,
} from "@/src/contracts/domain/contract-terms";
import {
  advancesRetentionQuery,
  useAdvancesCommand,
  type AdvancesCommand,
  type AdvancesRetention,
  type ContractAdvance,
  type ContractGuarantee,
  type ContractScope,
  type RetentionRelease,
} from "@/src/queries/contracts-advances";
import { QueryHttpError } from "@/src/queries/http";

import {
  DateDialog,
  EditRecoveryDialog,
  GuaranteeDialog,
  RecordAdvanceDialog,
  ReleaseRetentionDialog,
} from "./advance-dialogs";

const money = (paise: number | null | undefined) =>
  paise == null ? "—" : formatPaise(paise);

function dateText(value: string | null | undefined): string {
  if (value == null) return "—";
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const percent = (value: string | null) =>
  value == null ? "—" : `${value.replace(/\.?0+$/, "")}%`;

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words tabular-nums">{children}</dd>
    </div>
  );
}

function Panel({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="min-w-0 space-y-3 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={id} className="font-semibold">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** "Live · expires in 12 days", "Expired", "Released 3 Oct 2026". */
export function GuaranteeStatusBadge({
  guarantee,
}: {
  guarantee: Pick<ContractGuarantee, "status" | "daysToExpiry" | "releasedOn">;
}) {
  if (guarantee.status === "released")
    return (
      <Badge variant="outline">Released {dateText(guarantee.releasedOn)}</Badge>
    );
  if (guarantee.status === "expired")
    return <Badge variant="destructive">Expired</Badge>;
  const soon = guarantee.daysToExpiry <= 30;
  return (
    <Badge variant={soon ? "secondary" : "default"}>
      {soon
        ? `Expires in ${String(guarantee.daysToExpiry)} ${guarantee.daysToExpiry === 1 ? "day" : "days"}`
        : "Live"}
    </Badge>
  );
}

type Dialog =
  | { kind: "record" }
  | { kind: "recovery"; advance: ContractAdvance }
  | { kind: "delete-advance"; advance: ContractAdvance }
  | { kind: "guarantee"; guarantee: ContractGuarantee | null }
  | { kind: "release-guarantee"; guarantee: ContractGuarantee }
  | { kind: "delete-guarantee"; guarantee: ContractGuarantee }
  | { kind: "release" }
  | { kind: "delete-release"; release: RetentionRelease }
  | { kind: "completion" }
  | null;

function errorText(failure: unknown): string {
  if (failure instanceof QueryHttpError) return failure.message;
  return fieldForCode(failure, {}).message;
}

/** The panels while they load: four cards shaped like the panels. */
export function AdvancesRetentionSkeleton() {
  return (
    <SkeletonGroup
      label="Loading advances and retention"
      className="grid min-w-0 gap-4 lg:grid-cols-2"
    >
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="min-w-0 space-y-3 rounded-xl border p-4">
          <SkeletonText size="base" width="10rem" />
          <SkeletonText width="80%" />
          <SkeletonText width="60%" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/**
 * Advances, retention, bank guarantees and DLP of one contract (CM-1108):
 * a Work Order (advances given, retention held) or the Project's client
 * contract (advances received, retention receivable). Actions show by
 * what the viewer may do; money needs Financial. Hidden for a viewer who
 * may not read the side's menu.
 */
export function AdvancesRetentionPanels({
  scope,
  today,
}: {
  scope: ContractScope;
  today: string;
}) {
  const query = useQuery({ ...advancesRetentionQuery(scope), retry: false });
  if (query.isPending) return <AdvancesRetentionSkeleton />;
  if (query.data == null) return null;
  return <Panels scope={scope} view={query.data} today={today} />;
}

export function Panels({
  scope,
  view,
  today,
}: {
  scope: ContractScope;
  view: AdvancesRetention;
  today: string;
}) {
  const command = useAdvancesCommand(scope);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | undefined>();
  const contractor = view.side === "contractor";
  const { allowed, financial } = view;
  const record = allowed.update && financial;
  const run = (next: AdvancesCommand) => {
    setError(undefined);
    command.mutate(next, {
      onSuccess: () => {
        setDialog(null);
      },
      onError: (failure) => {
        setError(errorText(failure));
      },
    });
  };
  const close = () => {
    setDialog(null);
    setError(undefined);
  };
  const open = (next: Dialog) => {
    setError(undefined);
    setDialog(next);
  };
  const retentionWord = contractor ? "held" : "receivable";
  const advanceById = new Map(view.advances.map((row) => [row.id, row]));

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Panel
        id={`advances-${scope.workOrderId ?? "client"}`}
        title={contractor ? "Advances given" : "Advances received"}
        action={
          allowed.recordAdvance ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                open({ kind: "record" });
              }}
            >
              <Plus aria-hidden="true" />
              Record advance
            </Button>
          ) : null
        }
      >
        {view.warnings.map((warning) => (
          <Alert key={warning.code}>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>More than agreed</AlertTitle>
            <AlertDescription>{warning.message}</AlertDescription>
          </Alert>
        ))}
        {financial ? (
          <dl className="grid min-w-0 grid-cols-3 gap-3">
            <Fact label={contractor ? "Given" : "Received"}>
              {money(view.advanceTotals.amount)}
            </Fact>
            <Fact label="Recovered">{money(view.advanceTotals.recovered)}</Fact>
            <Fact label="Balance">{money(view.advanceTotals.balance)}</Fact>
          </dl>
        ) : null}
        {view.advances.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {contractor
              ? "No advance given yet. A mobilisation or secured advance is paid on account and recovered from later bills."
              : "No advance received yet. The Client's advance is received on account and recovered from later Client Bills."}
          </p>
        ) : (
          <ul className="space-y-2">
            {view.advances.map((advance) => (
              <li
                key={advance.id}
                className="flex min-w-0 items-start justify-between gap-2 rounded-lg border p-3"
              >
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="font-medium break-words">
                    {ADVANCE_KIND_LABELS[advance.kind]} ·{" "}
                    {dateText(advance.advanceOn)}
                  </p>
                  <p className="text-muted-foreground text-xs break-words">
                    {money(advance.amount)}
                    {advance.payment?.number == null
                      ? ""
                      : ` · ${advance.payment.number}`}{" "}
                    · recovered{" "}
                    {advance.recoveryMode === "percent"
                      ? `${percent(advance.recoveryPercent)} of each bill`
                      : `${money(advance.recoveryAmount)} per bill`}
                  </p>
                  {financial ? (
                    <p className="text-xs tabular-nums">
                      Recovered {money(advance.recovered)} · Balance{" "}
                      {money(advance.balance)}
                    </p>
                  ) : null}
                  {advance.guaranteeIds.length > 0 ? (
                    <p className="text-muted-foreground text-xs">
                      Bank guarantee{" "}
                      {view.guarantees
                        .filter((row) => advance.guaranteeIds.includes(row.id))
                        .map((row) => row.number)
                        .join(", ")}
                    </p>
                  ) : null}
                  {advance.remarks == null ? null : (
                    <p className="text-muted-foreground text-xs break-words">
                      {advance.remarks}
                    </p>
                  )}
                </div>
                {record || allowed.delete ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Advance actions"
                        />
                      }
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {record ? (
                        <DropdownMenuItem
                          onClick={() => {
                            open({ kind: "recovery", advance });
                          }}
                        >
                          Change recovery
                        </DropdownMenuItem>
                      ) : null}
                      {allowed.delete ? (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            open({ kind: "delete-advance", advance });
                          }}
                        >
                          Delete advance
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        id={`retention-${scope.workOrderId ?? "client"}`}
        title={contractor ? "Retention held" : "Retention receivable"}
        action={
          record && (view.retention.releasable ?? 0) > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                open({ kind: "release" });
              }}
            >
              Release retention
            </Button>
          ) : null
        }
      >
        <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label="Per bill">{percent(view.retention.percent)}</Fact>
          {financial ? (
            <>
              <Fact label="Deducted">{money(view.retention.deducted)}</Fact>
              <Fact label="Released">{money(view.retention.released)}</Fact>
              <Fact label={contractor ? "Held now" : "Receivable now"}>
                {money(view.retention.releasable)}
              </Fact>
            </>
          ) : null}
        </dl>
        <p className="text-muted-foreground text-xs">
          {percent(view.retention.completionPercent)} is released on completion,
          the rest at the end of the DLP
          {financial
            ? ` (suggested now: ${money(view.retention.completionSuggestion)} on completion, ${money(view.retention.dlpEndSuggestion)} at the DLP end)`
            : ""}
          . Retention {retentionWord} can also be released early against a
          retention bank guarantee.
        </p>
        {view.releases.length === 0 ? (
          <p className="text-muted-foreground text-sm">No releases yet.</p>
        ) : (
          <ul className="space-y-2">
            {view.releases.map((release) => (
              <li
                key={release.id}
                className="flex min-w-0 items-start justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium break-words">
                    {RETENTION_STAGE_LABELS[release.stage]} ·{" "}
                    {dateText(release.releasedOn)}
                    {release.settled ? (
                      <Badge variant="outline" className="ml-2">
                        {contractor ? "Paid" : "Received"}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground text-xs break-words">
                    {money(release.amount)}
                    {release.invoice?.number == null
                      ? ""
                      : ` · Invoice ${release.invoice.number}`}
                    {release.bankGuarantee?.number == null
                      ? ""
                      : ` · against ${release.bankGuarantee.number}`}
                  </p>
                  {release.reason == null ? null : (
                    <p className="text-muted-foreground text-xs break-words">
                      {release.reason}
                    </p>
                  )}
                </div>
                {allowed.delete && !release.settled ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      open({ kind: "delete-release", release });
                    }}
                  >
                    Delete
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        id={`guarantees-${scope.workOrderId ?? "client"}`}
        title="Bank guarantees"
        action={
          record ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                open({ kind: "guarantee", guarantee: null });
              }}
            >
              <Plus aria-hidden="true" />
              Add guarantee
            </Button>
          ) : null
        }
      >
        {view.guarantees.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No bank guarantee yet. The daily notice warns 30 days before one
            expires.
          </p>
        ) : (
          <ul className="space-y-2">
            {view.guarantees.map((guarantee) => {
              const advance =
                guarantee.advanceId == null
                  ? undefined
                  : advanceById.get(guarantee.advanceId);
              const editable = record && guarantee.status !== "released";
              return (
                <li
                  key={guarantee.id}
                  className="flex min-w-0 items-start justify-between gap-2 rounded-lg border p-3 text-sm"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium break-words">
                      {guarantee.number}
                      <GuaranteeStatusBadge guarantee={guarantee} />
                    </p>
                    <p className="text-muted-foreground text-xs break-words">
                      {guarantee.bank} · {money(guarantee.amount)} ·{" "}
                      {GUARANTEE_PURPOSE_LABELS[guarantee.purpose]}
                      {advance == null
                        ? ""
                        : ` (${ADVANCE_KIND_LABELS[advance.kind].toLowerCase()} of ${dateText(advance.advanceOn)})`}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Issued {dateText(guarantee.issuedOn)} · expires{" "}
                      {dateText(guarantee.expiresOn)}
                    </p>
                  </div>
                  {editable || allowed.delete ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Guarantee ${guarantee.number} actions`}
                          />
                        }
                      >
                        <MoreHorizontal aria-hidden="true" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {editable ? (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                open({ kind: "guarantee", guarantee });
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                open({ kind: "release-guarantee", guarantee });
                              }}
                            >
                              Mark released
                            </DropdownMenuItem>
                          </>
                        ) : null}
                        {allowed.delete ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => {
                              open({ kind: "delete-guarantee", guarantee });
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        id={`dlp-${scope.workOrderId ?? "client"}`}
        title="Defects liability period (DLP)"
        action={
          allowed.setCompletion ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                open({ kind: "completion" });
              }}
            >
              {view.dlp.startsOn == null
                ? "Record completion"
                : "Change completion"}
            </Button>
          ) : null
        }
      >
        <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label={contractor ? "Completed on" : "Handed over on"}>
            {dateText(view.dlp.startsOn)}
          </Fact>
          <Fact label="DLP">
            {view.dlp.months == null
              ? "—"
              : `${String(view.dlp.months)} months`}
          </Fact>
          <Fact label="Ends on">{dateText(view.dlp.endsOn)}</Fact>
          <Fact label="Days left">
            {view.dlp.daysLeft == null
              ? "—"
              : view.dlp.ended
                ? "Ended"
                : String(view.dlp.daysLeft)}
          </Fact>
        </dl>
        {view.dlp.startsOn == null ? (
          <p className="text-muted-foreground text-xs">
            {contractor
              ? "The DLP starts on the Work Order's completion date: closing it or approving its Final bill records one, or record it here."
              : "The DLP starts on the handover date in the client contract's terms."}
          </p>
        ) : null}
        {!view.dlp.ended &&
        view.dlp.daysLeft != null &&
        view.dlp.daysLeft <= 30 ? (
          <Badge variant="secondary">DLP ends within 30 days</Badge>
        ) : null}
      </Panel>

      {dialog?.kind === "record" ? (
        <RecordAdvanceDialog
          view={view}
          today={today}
          pending={command.isPending}
          error={error}
          onClose={close}
          onConfirm={(input) => {
            run({
              kind: "record-advance",
              input: { ...input, projectId: scope.projectId },
            });
          }}
        />
      ) : null}
      {dialog?.kind === "recovery" ? (
        <EditRecoveryDialog
          advance={dialog.advance}
          pending={command.isPending}
          error={error}
          onClose={close}
          onConfirm={(input) => {
            run({ kind: "update-advance", id: dialog.advance.id, input });
          }}
        />
      ) : null}
      {dialog?.kind === "guarantee" ? (
        <GuaranteeDialog
          view={view}
          guarantee={dialog.guarantee}
          today={today}
          pending={command.isPending}
          error={error}
          onClose={close}
          onConfirm={(input) => {
            if (dialog.guarantee == null)
              run({
                kind: "add-guarantee",
                input: { ...input, projectId: scope.projectId },
              });
            else
              run({
                kind: "update-guarantee",
                id: dialog.guarantee.id,
                input: {
                  ...input,
                  expectedUpdatedAt: dialog.guarantee.updatedAt,
                },
              });
          }}
        />
      ) : null}
      {dialog?.kind === "release-guarantee" ? (
        <DateDialog
          title={`Mark ${dialog.guarantee.number} released?`}
          description="The guarantee is returned to the bank. It can no longer be changed, and the daily notice stops."
          label="Released on"
          initial={today}
          min={dialog.guarantee.issuedOn ?? undefined}
          max={today}
          confirm="Mark released"
          pending={command.isPending}
          error={error}
          onClose={close}
          onConfirm={(releasedOn) => {
            run({
              kind: "release-guarantee",
              id: dialog.guarantee.id,
              releasedOn,
              expectedUpdatedAt: dialog.guarantee.updatedAt,
            });
          }}
        />
      ) : null}
      {dialog?.kind === "completion" ? (
        <DateDialog
          title="Completion date"
          description="The DLP starts here and runs for the Work Order's DLP months."
          label="Completed on"
          initial={view.dlp.startsOn ?? today}
          max={today}
          confirm="Save"
          pending={command.isPending}
          error={error}
          onClose={close}
          onConfirm={(completedOn) => {
            run({ kind: "completion", completedOn });
          }}
        />
      ) : null}
      {dialog?.kind === "release" ? (
        <ReleaseRetentionDialog
          view={view}
          today={today}
          pending={command.isPending}
          error={error}
          onClose={close}
          onConfirm={(input) => {
            run({
              kind: "release",
              input: { ...input, projectId: scope.projectId },
            });
          }}
        />
      ) : null}
      {dialog?.kind === "delete-release" ? (
        <ReasonDialog
          title="Delete this release?"
          description={`Its invoice ${dialog.release.invoice?.number ?? ""} is removed from Payments and the ${money(dialog.release.amount)} is ${retentionWord} again.`}
          empty="Write why it is deleted."
          confirm="Delete release"
          busyLabel="Deleting…"
          destructive
          pending={command.isPending}
          error={error}
          onClose={close}
          onConfirm={(reason) => {
            run({ kind: "delete-release", id: dialog.release.id, reason });
          }}
        />
      ) : null}
      {dialog?.kind === "delete-advance" ||
      dialog?.kind === "delete-guarantee" ? (
        <AlertDialog
          open
          onOpenChange={(next) => {
            if (!next) close();
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {dialog.kind === "delete-advance"
                  ? "Delete this advance?"
                  : `Delete guarantee ${dialog.guarantee.number}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {dialog.kind === "delete-advance"
                  ? `Its ${contractor ? "payment" : "receipt"} ${dialog.advance.payment?.number ?? ""} is cancelled in Payments. An advance a bill recovers, or a guarantee secures, stays.`
                  : "A guarantee retention was released against stays."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <FormAlert message={error} />
            <AlertDialogFooter>
              <AlertDialogCancel>Back</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={command.isPending}
                onClick={() => {
                  if (dialog.kind === "delete-advance")
                    run({
                      kind: "delete-advance",
                      id: dialog.advance.id,
                      expectedUpdatedAt: dialog.advance.updatedAt,
                    });
                  else
                    run({
                      kind: "delete-guarantee",
                      id: dialog.guarantee.id,
                      expectedUpdatedAt: dialog.guarantee.updatedAt,
                    });
                }}
              >
                {command.isPending ? "Deleting…" : "Delete"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
