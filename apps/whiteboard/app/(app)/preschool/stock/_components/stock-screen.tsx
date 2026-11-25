"use client";

import { PackageIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  PackagePlus,
  Send,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useDeferredValue, useMemo, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Label } from "@repo/ui/components/label";
import { MetricCard } from "@repo/ui/components/metric-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Switch } from "@repo/ui/components/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import {
  RoleGate,
  useActiveCentre,
} from "@/app/(app)/preschool/_components/active-centre-provider";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import {
  STOCK_CATEGORY_LABELS,
  stockOnHandQueryOptions,
  type PreschoolStockCategory,
} from "@/src/queries/preschool/stock";

import { StockLedger } from "./stock-ledger";
import {
  StockMovementDialogs,
  type StockDialog,
} from "./stock-movement-dialogs";
import { StockTable } from "./stock-table";

const ALL = "all";
const CATEGORY_ITEMS = [
  { value: ALL, label: "Every category" },
  ...(
    Object.entries(STOCK_CATEGORY_LABELS) as [PreschoolStockCategory, string][]
  ).map(([value, label]) => ({ value, label })),
];

function NoItems({ isOwner }: { isOwner: boolean }) {
  return (
    <EmptyState
      className="border"
      icon={PackageIcon}
      tone="orange"
      title="No Stock Items yet"
      description={
        isOwner
          ? "Add the books, uniforms, kits and supplies your Centres keep. Every Centre then counts its own."
          : "Head Office has not added Stock Items yet."
      }
      actions={
        isOwner ? (
          <Button render={<Link href="/preschool/stock/items" />}>
            Open Stock Items
          </Button>
        ) : undefined
      }
    />
  );
}

function StockDesk() {
  const { me, centre, centres } = useActiveCentre();
  const isOwner = me.role === "owner";
  const [category, setCategory] = useState(ALL);
  const [lowOnly, setLowOnly] = useState(false);
  const [dialog, setDialog] = useState<StockDialog | null>(null);
  const [tab, setTab] = useState("stock");
  const { data: all } = useSuspenseQuery(
    stockOnHandQueryOptions({ centreId: centre.id }),
  );
  const filters = useDeferredValue(
    useMemo(
      () => ({
        centreId: centre.id,
        ...(category === ALL
          ? {}
          : { category: category as PreschoolStockCategory }),
        ...(lowOnly ? { lowOnly: true } : {}),
      }),
      [centre.id, category, lowOnly],
    ),
  );
  const { data: shown } = useSuspenseQuery(stockOnHandQueryOptions(filters));
  const canTransfer =
    isOwner && centres.filter((other) => other.status === "active").length > 1;
  const hasItems = all.items.length > 0;
  return (
    <PreschoolPage
      title="Stock"
      actions={
        hasItems ? (
          <>
            {canTransfer ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialog({ kind: "transfer" });
                }}
              >
                <ArrowRightLeft aria-hidden="true" />
                Transfer to another Centre
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDialog({ kind: "issue" });
              }}
            >
              <Send aria-hidden="true" />
              Issue
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDialog({ kind: "receive" });
              }}
            >
              <PackagePlus aria-hidden="true" />
              Receive stock
            </Button>
          </>
        ) : undefined
      }
    >
      {hasItems ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:max-w-xl">
            <MetricCard
              label="Items in stock"
              icon={Boxes}
              value={all.itemsInStock}
              caption={`of ${all.items.length} Stock Items`}
            />
            <MetricCard
              label="Low stock"
              icon={AlertTriangle}
              value={all.lowItems}
              {...(all.lowItems > 0
                ? { badge: "Reorder", badgeTone: "warning" as const }
                : {})}
              active={lowOnly}
              onClick={() => {
                setLowOnly((value) => !value);
                setTab("stock");
              }}
            />
          </div>
          <Tabs
            value={tab}
            onValueChange={(value: string) => {
              setTab(value);
            }}
          >
            <TabsList aria-label="Stock">
              <TabsTrigger value="stock">On hand</TabsTrigger>
              <TabsTrigger value="movements">Movements</TabsTrigger>
            </TabsList>
            <TabsContent value="stock" className="flex flex-col gap-4 pt-2">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="stock-category">Category</Label>
                  <Select
                    items={CATEGORY_ITEMS}
                    value={category}
                    onValueChange={(value) => {
                      if (value != null) setCategory(value);
                    }}
                  >
                    <SelectTrigger id="stock-category" className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex h-8 items-center gap-2">
                  <Switch
                    id="stock-low-only"
                    checked={lowOnly}
                    onCheckedChange={(checked) => {
                      setLowOnly(checked);
                    }}
                  />
                  <Label htmlFor="stock-low-only">Low stock only</Label>
                </div>
              </div>
              <StockTable
                rows={shown.items}
                filtered={category !== ALL || lowOnly}
                onAction={setDialog}
              />
            </TabsContent>
            <TabsContent value="movements" className="pt-2">
              <Suspense
                fallback={<Skeleton className="h-48 w-full rounded-xl" />}
              >
                <StockLedger
                  key={centre.id}
                  centreId={centre.id}
                  items={all.items}
                />
              </Suspense>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <NoItems isOwner={isOwner} />
      )}
      <StockMovementDialogs
        dialog={dialog}
        stock={all.items}
        onClose={() => {
          setDialog(null);
        }}
      />
    </PreschoolPage>
  );
}

/** The active Centre's stock: on hand, movements, and every stock action. */
export function StockScreen() {
  return (
    <RoleGate roles={["owner", "centre_head"]}>
      <StockDesk />
    </RoleGate>
  );
}
