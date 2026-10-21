"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Download, FileDown, FileUp, ListTree, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
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

import {
  boqExportUrl,
  boqQuery,
  boqSampleUrl,
  type Boq,
  type BoqItem,
  type BoqSection,
} from "@/src/queries/contracts-boq";

import { BoqItemDialog } from "./boq-item-dialog";
import { money, signedMoney } from "./boq-format";
import { BoqSections } from "./boq-sections";
import { DeviationPanel } from "./deviation-panel";
import { ImportBoqDialog } from "./import-boq-dialog";
import { SectionDialog } from "./section-dialog";
import { VariationDialog, type VariationPrefill } from "./variation-dialog";
import { VariationsTab } from "./variations-tab";

const TABS = ["boq", "variations", "deviations"] as const;
type Tab = (typeof TABS)[number];

const isTab = (value: string | null): value is Tab =>
  value != null && (TABS as readonly string[]).includes(value);

/** The BOQ total beside the Project's Order Value and the difference. */
export function BoqTotalBar({ boq }: { boq: Boq }) {
  if (!boq.financial)
    return (
      <p className="text-muted-foreground bg-muted/40 rounded-xl border px-4 py-3 text-sm">
        {boq.itemCount} {boq.itemCount === 1 ? "item" : "items"}. Rates, amounts
        and totals need the BOQ’s Financial permission.
      </p>
    );
  const rows = [
    { label: "BOQ total", value: money(boq.total), strong: true },
    { label: "Order Value", value: money(boq.orderValue), strong: false },
    {
      label: "Difference",
      value:
        boq.orderValue == null ? "No Order Value" : signedMoney(boq.difference),
      strong: false,
    },
  ];
  return (
    <dl
      aria-label="BOQ total"
      className="bg-card grid min-w-0 gap-3 rounded-xl border px-4 py-3 sm:grid-cols-3"
    >
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-muted-foreground text-xs">{row.label}</dt>
          <dd
            className={
              row.strong
                ? "text-lg font-semibold tabular-nums"
                : "text-lg tabular-nums"
            }
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type ItemDialog = { item: BoqItem | null; sectionId?: string };

/**
 * A Project's BOQ (CM-1103, ADR CM-0023 §4): its sections and items with
 * subtotals and the total beside the Order Value, its Variations, and the
 * items measured beyond the deviation limit. `?tab=variations` opens the
 * Variations (a notification's link). Actions show by the viewer's BOQ
 * flags; without Financial only quantities show, and the Excel sample,
 * import and export (which carry rates) are hidden.
 */
export function BoqPage({ projectId }: { projectId: string }) {
  const search = useSearchParams();
  const requested = search.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(requested) ? requested : "boq");
  const { data: boq } = useSuspenseQuery(boqQuery(projectId));
  const flags = boq.viewerFlags;
  const [sectionDialog, setSectionDialog] = useState<BoqSection | "new" | null>(
    null,
  );
  const [itemDialog, setItemDialog] = useState<ItemDialog | null>(null);
  const [raising, setRaising] = useState<VariationPrefill | null>(null);
  const [importing, setImporting] = useState(false);
  const items = boq.sections.flatMap((section) => section.items);
  const excel = boq.financial;
  const canCreate = flags.includes("create");

  const addSection = canCreate ? (
    <Button
      type="button"
      size="sm"
      variant={boq.sections.length === 0 ? "default" : "outline"}
      onClick={() => {
        setSectionDialog("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add section
    </Button>
  ) : null;
  const importButton =
    excel && flags.includes("import") ? (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setImporting(true);
        }}
      >
        <FileUp aria-hidden="true" />
        Import
      </Button>
    ) : null;

  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold">BOQ</h2>
          <p className="text-muted-foreground text-sm">
            {boq.role === "contract"
              ? "The client's contract: sections and items as it prints them."
              : "The Project's budget: sections and items, never billed."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {excel && flags.includes("import") ? (
            <a
              href={boqSampleUrl(projectId)}
              download
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <Download aria-hidden="true" />
              Sample
            </a>
          ) : null}
          {importButton}
          {excel && flags.includes("export") && boq.itemCount > 0 ? (
            <a
              href={boqExportUrl(projectId)}
              download
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <FileDown aria-hidden="true" />
              Export
            </a>
          ) : null}
          {boq.sections.length > 0 ? addSection : null}
          {canCreate && boq.sections.length > 0 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setItemDialog({ item: null });
              }}
            >
              <Plus aria-hidden="true" />
              Add item
            </Button>
          ) : null}
        </div>
      </div>
      <BoqTotalBar boq={boq} />
      <Tabs
        value={tab}
        onValueChange={(next) => {
          if (isTab(next as string)) setTab(next as Tab);
        }}
      >
        <TabsList aria-label="BOQ views" className="w-full sm:w-fit">
          <TabsTrigger value="boq" className="min-w-0 flex-1 sm:flex-none">
            Items
          </TabsTrigger>
          <TabsTrigger
            value="variations"
            className="min-w-0 flex-1 sm:flex-none"
          >
            Variations
          </TabsTrigger>
          <TabsTrigger
            value="deviations"
            className="min-w-0 flex-1 sm:flex-none"
          >
            Deviations
          </TabsTrigger>
        </TabsList>
        <TabsContent value="boq" className="pt-3">
          {boq.sections.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListTree />
                </EmptyMedia>
                <EmptyTitle>No BOQ yet</EmptyTitle>
                <EmptyDescription>
                  Add the contract’s sections and items, copy them from your
                  Item Library, or import the whole BOQ from Excel.
                </EmptyDescription>
              </EmptyHeader>
              {addSection != null || importButton != null ? (
                <EmptyContent className="flex-row flex-wrap justify-center">
                  {addSection}
                  {importButton}
                </EmptyContent>
              ) : null}
            </Empty>
          ) : (
            <BoqSections
              boq={boq}
              actions={{
                onAddItem: (sectionId) => {
                  setItemDialog({ item: null, sectionId });
                },
                onRename: (section) => {
                  setSectionDialog(section);
                },
                onEditItem: (item) => {
                  setItemDialog({ item });
                },
                onRaise: (item) => {
                  setRaising({ kind: "quantity", boqItemId: item.id });
                },
              }}
            />
          )}
        </TabsContent>
        <TabsContent value="variations" className="pt-3">
          <VariationsTab
            projectId={projectId}
            flags={flags}
            financial={boq.financial}
            items={items}
          />
        </TabsContent>
        <TabsContent value="deviations" className="pt-3">
          <Suspense
            fallback={
              <p className="text-muted-foreground text-sm">
                Loading deviations…
              </p>
            }
          >
            <DeviationPanel
              projectId={projectId}
              canRaise={canCreate}
              onRaise={setRaising}
            />
          </Suspense>
        </TabsContent>
      </Tabs>
      <Suspense fallback={null}>
        {sectionDialog == null ? null : (
          <SectionDialog
            projectId={projectId}
            section={sectionDialog === "new" ? null : sectionDialog}
            onClose={() => {
              setSectionDialog(null);
            }}
          />
        )}
        {itemDialog == null ? null : (
          <BoqItemDialog
            projectId={projectId}
            financial={boq.financial}
            item={itemDialog.item}
            sectionId={itemDialog.sectionId}
            onClose={() => {
              setItemDialog(null);
            }}
          />
        )}
        {raising == null ? null : (
          <VariationDialog
            projectId={projectId}
            financial={boq.financial}
            items={items}
            variation={null}
            prefill={raising}
            onClose={() => {
              setRaising(null);
            }}
          />
        )}
      </Suspense>
      <ImportBoqDialog
        projectId={projectId}
        open={importing}
        onClose={() => {
          setImporting(false);
        }}
      />
    </div>
  );
}
