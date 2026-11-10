"use client";

import { Plus } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { cn } from "@repo/ui/lib/utils";

import { FieldError } from "@/components/auth/field-error";
import { MoneyInput } from "@/components/money/money-input";
import {
  DocumentAttachments,
  type HeldFile,
} from "@/components/projects/documents/document-attachments";

import {
  groupRupees,
  PROJECT_PAPERS,
  type ProjectPaperKind,
} from "./project-contract";
import type { ProjectFormValues } from "./project-form-schema";

/**
 * Columns: paper, number, date, files. Rows use `subgrid` on ≥sm so every
 * row lines up under the one header; on phones a row stacks.
 */
const GRID =
  "space-y-3 sm:grid sm:space-y-0 sm:grid-cols-[7.5rem_minmax(0,24rem)_10.5rem_auto] sm:gap-x-3";

/**
 * The Contract card's body (CM-413): Order value (with the Financial flag
 * only), then one row per paper with its number, date and files. Tender /
 * RFQ ref., LOA and Agreement rows appear when they have a value or are
 * asked for.
 */
export function ContractPapersField({
  form,
  financial,
  projectId,
  shown,
  onShow,
  held,
  onHeldChange,
  disabled,
}: {
  form: UseFormReturn<ProjectFormValues>;
  /** The Project menu's Financial flag: the Order value shows. */
  financial: boolean;
  projectId: string | null;
  /** Optional papers on screen. */
  shown: ReadonlySet<ProjectPaperKind>;
  onShow: (kind: ProjectPaperKind) => void;
  held: readonly HeldFile[];
  onHeldChange: (kind: ProjectPaperKind, next: HeldFile[]) => void;
  disabled: boolean;
}) {
  const errors = form.formState.errors;
  const papers = PROJECT_PAPERS.filter(
    (paper) => !paper.optional || shown.has(paper.kind),
  );
  const hidden = PROJECT_PAPERS.filter(
    (paper) => paper.optional && !shown.has(paper.kind),
  );
  const orderValue = form.register("orderValue");

  return (
    <div className="space-y-6">
      <div className={cn("space-y-1.5 sm:max-w-xs", !financial && "hidden")}>
        <Label htmlFor="project-order-value">Order value</Label>
        <MoneyInput
          id="project-order-value"
          className="h-10"
          placeholder="1,84,50,000"
          suffix="excl. GST"
          aria-invalid={errors.orderValue != null}
          {...orderValue}
          onBlur={(event) => {
            void orderValue.onBlur(event);
            const grouped = groupRupees(event.target.value);
            if (grouped !== event.target.value)
              form.setValue("orderValue", grouped);
          }}
        />
        <FieldError message={errors.orderValue?.message} />
      </div>

      <div className="space-y-3">
        <div role="group" aria-label="Contract papers" className={GRID}>
          <div
            aria-hidden="true"
            className="text-muted-foreground hidden pb-1.5 text-xs font-medium sm:col-span-4 sm:grid sm:grid-cols-subgrid"
          >
            <span />
            <span>Number</span>
            <span>Date</span>
            <span />
          </div>
          {papers.map((paper, index) => {
            const numberError = errors[paper.numberField]?.message;
            const dateError =
              paper.dateField == null
                ? undefined
                : errors[paper.dateField]?.message;
            return (
              <div
                key={paper.kind}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2 sm:col-span-4 sm:grid-cols-subgrid sm:items-center sm:gap-y-1 sm:py-1",
                  index > 0 && "border-t pt-3 sm:border-0 sm:pt-1",
                )}
              >
                <span className="self-center text-sm font-medium">
                  {paper.label}
                </span>
                <Input
                  className={cn(
                    "h-10",
                    paper.dateField == null && "col-span-2 sm:col-span-1",
                  )}
                  autoComplete="off"
                  aria-label={
                    paper.dateField == null
                      ? paper.label
                      : `${paper.label} number`
                  }
                  placeholder={
                    paper.kind === "quotation"
                      ? "SBD/Q/2026/114"
                      : paper.kind === "client_order"
                        ? "WO/2026/031"
                        : undefined
                  }
                  aria-invalid={numberError != null}
                  {...form.register(paper.numberField)}
                />
                {paper.dateField == null ? (
                  <span aria-hidden="true" className="hidden sm:block" />
                ) : (
                  <Input
                    type="date"
                    className="h-10"
                    aria-label={`${paper.label} date`}
                    aria-invalid={dateError != null}
                    {...form.register(paper.dateField)}
                  />
                )}
                {/* Phones: the paperclip sits beside the paper's name. On
                    ≥sm it is the last column and the chips wrap under the
                    number and date. */}
                <DocumentAttachments
                  projectId={projectId}
                  kind={paper.kind}
                  label={paper.label}
                  held={held.filter((file) => file.kind === paper.kind)}
                  onHeldChange={(next) => {
                    onHeldChange(paper.kind, next);
                  }}
                  disabled={disabled}
                  buttonClassName="max-sm:col-start-2 max-sm:row-start-1 max-sm:justify-self-end sm:self-center"
                  chipsClassName="sm:col-span-3 sm:col-start-2"
                />
                {numberError == null && dateError == null ? null : (
                  <div className="col-span-2 sm:col-span-3 sm:col-start-2">
                    <FieldError message={numberError ?? dateError} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {hidden.length === 0 ? null : (
          <div className="flex flex-wrap gap-2">
            {hidden.map((paper) => (
              <Button
                key={paper.kind}
                type="button"
                variant="outline"
                size="sm"
                className="text-muted-foreground border-dashed"
                aria-label={`Add ${paper.label}`}
                onClick={() => {
                  onShow(paper.kind);
                }}
              >
                <Plus aria-hidden="true" />
                {paper.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
