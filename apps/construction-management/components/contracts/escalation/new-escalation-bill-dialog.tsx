"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FormAlert } from "@/components/auth/form-alert";
import { formatPaise } from "@/components/money/money-input";
import {
  escalationBillPath,
  escalationFormOptionsQuery,
  escalationPreviewQuery,
  useCreateEscalationBill,
  type EscalationSide,
} from "@/src/queries/contracts-escalation";

import {
  billNumber,
  dateText,
  monthText,
  periodText,
  signedMoney,
} from "./escalation-format";

/**
 * New escalation bill (CM-1109): the Work Order (contractor side) or the
 * client contract, the months and the bill date. Before drafting, it
 * shows R — the approved running bills dated in the period — and what the
 * working comes to, or why it cannot be worked out (a missing index, no
 * bills, no clause).
 */
export function NewEscalationBillDialog({
  projectId,
  side,
  open,
  onOpenChange,
  workOrderId: fixedWorkOrderId,
}: {
  projectId: string;
  side: EscalationSide;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderId?: string;
}) {
  const router = useRouter();
  const options = useQuery({
    ...escalationFormOptionsQuery(projectId, side),
    enabled: open,
  }).data;
  const create = useCreateEscalationBill();
  const [picked, setPicked] = useState(fixedWorkOrderId ?? "");
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [billDate, setBillDate] = useState("");
  const today = options?.today ?? "";
  const date = billDate === "" ? today : billDate;
  const withClause =
    options?.workOrders.filter((row) => row.baseMonth != null) ?? [];
  const workOrderId = side === "contractor" ? picked : null;
  const baseMonth =
    side === "client"
      ? (options?.clientClause?.baseMonth ?? null)
      : (withClause.find((row) => row.id === picked)?.baseMonth ?? null);
  const ready =
    open &&
    date !== "" &&
    fromMonth !== "" &&
    toMonth !== "" &&
    (side === "client" || picked !== "");
  const preview = useQuery({
    ...escalationPreviewQuery({
      projectId,
      workOrderId,
      billDate: date,
      fromMonth,
      toMonth,
    }),
    enabled: ready,
  });
  const noClause =
    options != null &&
    (side === "client"
      ? options.clientClause == null
      : withClause.length === 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-1 sm:max-w-lg">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(
              { projectId, workOrderId, billDate: date, fromMonth, toMonth },
              {
                onSuccess: (bill) => {
                  onOpenChange(false);
                  router.push(escalationBillPath(projectId, side, bill.id));
                },
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>New escalation bill</DialogTitle>
            <DialogDescription>
              CPWD 10CC on the value of work billed in whole months: the
              approved running bills dated in the period, escalated by the
              clause&apos;s indices against its base month.
            </DialogDescription>
          </DialogHeader>
          {noClause ? (
            <p className="text-sm">
              {side === "client"
                ? "The client contract has no escalation clause. Add one under the client contract terms first."
                : "No issued Work Order of this Project has an escalation clause. Add one on the Work Order first."}
            </p>
          ) : (
            <div className="grid min-w-0 gap-4">
              {side === "contractor" && fixedWorkOrderId == null ? (
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="escalation-work-order" required>
                    Work Order
                  </Label>
                  <Select
                    items={withClause.map((row) => ({
                      value: row.id,
                      label: `${billNumber(row.number)} · ${row.contractorName}`,
                    }))}
                    value={picked === "" ? null : picked}
                    onValueChange={(value) => {
                      setPicked(value ?? "");
                    }}
                  >
                    <SelectTrigger
                      id="escalation-work-order"
                      aria-required
                      className="w-full"
                    >
                      <SelectValue placeholder="Pick a Work Order" />
                    </SelectTrigger>
                    <SelectContent>
                      {withClause.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {billNumber(row.number)} · {row.contractorName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {baseMonth != null ? (
                <p className="text-muted-foreground text-xs">
                  Base month {monthText(baseMonth)}: the period starts after it.
                </p>
              ) : null}
              <div className="grid min-w-0 gap-4 sm:grid-cols-3">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="escalation-from" required>
                    From month
                  </Label>
                  <Input
                    id="escalation-from"
                    aria-required
                    type="month"
                    value={fromMonth}
                    onChange={(event) => {
                      setFromMonth(event.currentTarget.value);
                    }}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="escalation-to" required>
                    To month
                  </Label>
                  <Input
                    id="escalation-to"
                    aria-required
                    type="month"
                    value={toMonth}
                    onChange={(event) => {
                      setToMonth(event.currentTarget.value);
                    }}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="escalation-bill-date" required>
                    Bill date
                  </Label>
                  <Input
                    id="escalation-bill-date"
                    aria-required
                    type="date"
                    max={today === "" ? undefined : today}
                    value={date}
                    onChange={(event) => {
                      setBillDate(event.currentTarget.value);
                    }}
                  />
                </div>
              </div>
              {ready ? (
                <div
                  aria-live="polite"
                  className="min-w-0 space-y-2 rounded-md border p-3"
                >
                  {preview.isPending ? (
                    <p className="text-muted-foreground text-sm">
                      Working it out…
                    </p>
                  ) : preview.error != null ? (
                    <p className="text-destructive text-sm">
                      {preview.error.message}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm font-medium">
                        {periodText(
                          preview.data.periodFrom,
                          preview.data.periodTo,
                        )}
                        : R ={" "}
                        {signedMoney(
                          preview.data.working.valueOfWork,
                          formatPaise,
                        )}
                      </p>
                      <ul
                        aria-label="Running bills taken"
                        className="space-y-1 text-sm"
                      >
                        {preview.data.working.bills.map((row) => (
                          <li
                            key={row.id}
                            className="flex justify-between gap-2"
                          >
                            <span className="min-w-0 truncate">
                              {billNumber(row.number)} ·{" "}
                              {dateText(row.billDate)}
                            </span>
                            <span className="tabular-nums">
                              {signedMoney(row.gross, formatPaise)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-sm">
                        Escalation:{" "}
                        <span className="font-semibold tabular-nums">
                          {signedMoney(preview.data.working.gross, formatPaise)}
                        </span>
                      </p>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          )}
          <FormAlert message={create.error?.message} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!ready || preview.data == null || create.isPending}
            >
              {create.isPending ? "Drafting…" : "Draft escalation bill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
