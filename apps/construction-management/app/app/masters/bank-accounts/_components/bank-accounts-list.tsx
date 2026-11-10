"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Landmark, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import {
  ConfirmDeleteDialog,
  MasterEmpty,
} from "@/components/masters/master-list-parts";
import { formatPaise } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import {
  companyAccountsQuery,
  useAccountCommand,
  type CompanyAccount,
} from "@/src/queries/finance-accounts";

import { AccountDialog } from "./account-dialog";
import {
  ACCOUNT_KIND_LABELS,
  bankAccountsPath,
  maskAccountNumber,
  SignedAmount,
} from "./account-format";

const MENU = "masters.bank_accounts";

function bankLine(account: CompanyAccount): string | null {
  const parts = [
    account.bankName,
    maskAccountNumber(account.accountNumber),
    account.ifsc,
    account.branch,
  ].filter((part): part is string => part != null && part !== "");
  return parts.length === 0 ? null : parts.join(" · ");
}

function pendingLine(account: CompanyAccount): string | null {
  const { count, total } = account.pending;
  if (count === 0) return null;
  const sign = total > 0 ? "+" : total < 0 ? "−" : "";
  return `${String(count)} pending (${sign}${formatPaise(Math.abs(total))})`;
}

/**
 * Masters → Company's Bank A/C (CM-701): the Company's Cash and Bank
 * accounts with today's balance (red below zero) and what pending
 * documents would move. Add, edit, Set As Primary, delete (refused while
 * in use), and each account's Ledger.
 */
export function BankAccountsList() {
  const router = useRouter();
  const { data } = useSuspenseQuery(companyAccountsQuery());
  const access = useQuery(financeAccessQuery(null)).data;
  const may = (flag: "create" | "update" | "delete") =>
    access != null && canInFinance(access, MENU, flag);
  const command = useAccountCommand();
  const [editing, setEditing] = useState<CompanyAccount | "new" | null>(null);
  const [deleting, setDeleting] = useState<CompanyAccount | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();

  const addButton = may("create") ? (
    <Button
      type="button"
      onClick={() => {
        setEditing("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add account
    </Button>
  ) : null;

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Company's Bank A/C"
          meta="Cash and bank accounts money is paid from and received into. Balances count approved entries only."
          actions={addButton}
        />
        <FormAlert message={listError} />
        {data.items.length === 0 ? (
          <MasterEmpty
            icon={Landmark}
            title="No accounts yet"
            description="Add the Company's cash box and bank accounts, with what they held when you started."
            action={addButton}
          />
        ) : (
          <ul
            aria-label="Company accounts"
            className="bg-card divide-y rounded-xl border"
          >
            {data.items.map((account) => {
              const bank = bankLine(account);
              const pending = pendingLine(account);
              return (
                <li
                  key={account.id}
                  className="flex items-start gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={bankAccountsPath(`/${account.id}`)}
                        className="truncate font-medium hover:underline"
                      >
                        {account.name}
                      </Link>
                      <Badge variant="outline">
                        {ACCOUNT_KIND_LABELS[account.kind]}
                      </Badge>
                      {account.isPrimary ? (
                        <Badge variant="secondary">Primary</Badge>
                      ) : null}
                    </div>
                    {bank != null ? (
                      <p className="text-muted-foreground truncate text-sm">
                        {bank}
                      </p>
                    ) : null}
                    {pending != null ? (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        {pending}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-muted-foreground text-xs">Balance</p>
                    <SignedAmount
                      paise={account.balance}
                      className="font-medium"
                    />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${account.name}`}
                          disabled={command.isPending}
                        />
                      }
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onClick={() => {
                          router.push(bankAccountsPath(`/${account.id}`));
                        }}
                      >
                        View Ledger
                      </DropdownMenuItem>
                      {may("update") ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(account);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                      ) : null}
                      {may("update") && !account.isPrimary ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setListError(undefined);
                            command.mutate(
                              { kind: "setPrimary", id: account.id },
                              {
                                onError: (error) => {
                                  setListError(fieldForCode(error, {}).message);
                                },
                              },
                            );
                          }}
                        >
                          Set As Primary
                        </DropdownMenuItem>
                      ) : null}
                      {may("delete") && !account.isPrimary ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => {
                              setDeleteError(undefined);
                              setDeleting(account);
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {editing != null ? (
        <AccountDialog
          account={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDeleteDialog
        name={deleting?.name ?? null}
        description="An account money has moved through, or that a Transaction or payment names, cannot be deleted."
        error={deleteError}
        pending={command.isPending}
        onClose={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (deleting == null) return;
          command.mutate(
            {
              kind: "delete",
              id: deleting.id,
              expectedUpdatedAt: deleting.updatedAt,
            },
            {
              onSuccess: () => {
                setDeleting(null);
              },
              onError: (error) => {
                setDeleteError(fieldForCode(error, {}).message);
              },
            },
          );
        }}
      />
    </div>
  );
}
