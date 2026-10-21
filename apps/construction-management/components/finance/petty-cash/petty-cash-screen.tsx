"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { FileDown, Plus, ScrollText, Wallet } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { cn } from "@repo/ui/lib/utils";

import { formatDate } from "@/components/payments/payment-format";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import {
  pettyCashAccountsQuery,
  type PettyCashAccount,
} from "@/src/queries/finance-petty-cash";

import { CloseAccountButton } from "./close-account-button";
import { ExportReceiptsDialog } from "./export-receipts-dialog";
import { OpenAccountDialog } from "./open-account-dialog";
import { Amount, pettyCashPath } from "./petty-cash-parts";
import { PettyCashVouchers } from "./petty-cash-vouchers";
import { PettyCashVouchersSkeleton } from "./petty-cash-skeletons";

function AccountCard({
  account,
  selected,
  onSelect,
}: {
  account: PettyCashAccount;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li className="min-w-0">
      <Button
        type="button"
        variant="outline"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "bg-card h-auto w-full min-w-0 flex-col items-stretch justify-start gap-1 p-3 text-left font-normal whitespace-normal",
          selected && "border-primary ring-primary/30 ring-2",
        )}
      >
        <span className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate font-medium">{account.holderName}</span>
          {account.isOwn ? <Badge variant="secondary">You</Badge> : null}
        </span>
        <Amount paise={account.balance} className="text-lg font-semibold" />
        <span className="text-muted-foreground text-xs">
          {account.pendingCount === 0 ? (
            "Nothing pending"
          ) : (
            <>
              Pending <Amount paise={account.pendingTotal} signed /> (
              {account.pendingCount})
            </>
          )}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {account.lastVoucherDate == null
            ? "No vouchers yet"
            : `Last voucher ${formatDate(account.lastVoucherDate)}`}
        </span>
      </Button>
    </li>
  );
}

function AccountPanel({
  projectId,
  account,
  canCreate,
  canDownload,
  canDelete,
}: {
  projectId: string;
  account: PettyCashAccount;
  canCreate: boolean;
  canDownload: boolean;
  canDelete: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  return (
    <section
      aria-labelledby="petty-cash-account-name"
      className="space-y-4 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3
            id="petty-cash-account-name"
            className="font-semibold break-words"
          >
            {account.name}
          </h3>
          <p className="text-muted-foreground text-sm">
            Balance <Amount paise={account.balance} /> · approved vouchers only
            {account.pendingCount > 0 ? (
              <>
                {" "}
                · pending <Amount paise={account.pendingTotal} signed />
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={pettyCashPath(projectId, `/statement/${account.id}`)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ScrollText aria-hidden="true" />
            Statement
          </Link>
          {canDownload ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setExporting(true);
              }}
            >
              <FileDown aria-hidden="true" />
              Export Receipts
            </Button>
          ) : null}
          {canDelete && account.canClose ? (
            <CloseAccountButton account={account} />
          ) : null}
          {canCreate ? (
            <Link
              href={pettyCashPath(
                projectId,
                `/new?account=${encodeURIComponent(account.id)}`,
              )}
              className={buttonVariants({ size: "sm" })}
            >
              <Plus aria-hidden="true" />
              New voucher
            </Link>
          ) : null}
        </div>
      </div>
      <Suspense fallback={<PettyCashVouchersSkeleton />}>
        <PettyCashVouchers
          key={account.id}
          projectId={projectId}
          account={account}
          canCreate={canCreate}
        />
      </Suspense>
      <ExportReceiptsDialog
        account={account}
        open={exporting}
        onOpenChange={setExporting}
      />
    </section>
  );
}

/**
 * A Project's Petty Cash tab (CM-703, ADR CM-0017 §2, §9): the petty-cash
 * accounts the viewer sees as cards (holder, balance of approved vouchers,
 * pending total, last voucher), and the chosen account's vouchers with
 * filters, bulk approval, its statement and Export Receipts. Without
 * Petty Cash View all a member sees only the account they hold.
 */
export function PettyCashScreen({ projectId }: { projectId: string }) {
  const { data: access } = useSuspenseQuery(financeAccessQuery(projectId));
  const { data } = useSuspenseQuery(pettyCashAccountsQuery());
  const params = useSearchParams();
  const [chosen, setChosen] = useState<string | null>(params.get("account"));
  const [opening, setOpening] = useState(false);
  const can = (flag: "create" | "delete" | "print") =>
    canInFinance(access, "finance.petty_cash", flag);
  const selected =
    data.items.find((account) => account.id === chosen) ??
    data.items.find((account) => account.isOwn) ??
    data.items[0] ??
    null;

  const openButton = can("create") ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        setOpening(true);
      }}
    >
      <Wallet aria-hidden="true" />
      Open account
    </Button>
  ) : null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Petty Cash</h2>
          <p className="text-muted-foreground text-sm">
            {data.viewAll
              ? "Every Team Member's petty cash. Balances count approved vouchers only."
              : "Your petty cash. Balances count approved vouchers only."}
          </p>
        </div>
        {openButton}
      </div>
      {data.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Wallet />
            </EmptyMedia>
            <EmptyTitle>
              {data.viewAll
                ? "No petty-cash accounts yet"
                : "You hold no petty-cash account"}
            </EmptyTitle>
            <EmptyDescription>
              {data.viewAll
                ? "Open one for each Team Member who spends cash on site."
                : "Ask your accountant to open one for you."}
            </EmptyDescription>
          </EmptyHeader>
          {openButton == null ? null : (
            <EmptyContent>{openButton}</EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <ul
            aria-label="Petty-cash accounts"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
          >
            {data.items.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                selected={account.id === selected?.id}
                onSelect={() => {
                  setChosen(account.id);
                }}
              />
            ))}
          </ul>
          {selected == null ? null : (
            <AccountPanel
              projectId={projectId}
              account={selected}
              canCreate={can("create")}
              canDownload={can("print")}
              canDelete={can("delete")}
            />
          )}
        </>
      )}
      <OpenAccountDialog
        open={opening}
        onOpenChange={setOpening}
        onOpened={(account) => {
          setChosen(account.id);
        }}
      />
    </div>
  );
}
