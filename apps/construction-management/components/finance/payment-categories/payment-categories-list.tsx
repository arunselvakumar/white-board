"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Tags } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import {
  ConfirmDeleteDialog,
  MasterEmpty,
  MasterRow,
  MasterSearch,
  byName,
} from "@/components/masters/master-list-parts";
import { fieldForCode } from "@/lib/server-errors";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import {
  paymentCategoriesQuery,
  usePaymentCategoryCommand,
  type PaymentCategoryItem,
} from "@/src/queries/finance-payment-categories";

import { PaymentCategoryDialog } from "./payment-category-dialog";

function errorMessage(error: unknown): string {
  return fieldForCode(error, {}).message;
}

/**
 * Masters → Payment Categories (CM-704, ADR CM-0017 §1): search, Add, and
 * per row Rename / Disable / Enable / Delete by the viewer's rights on
 * `masters.payment_categories`. Seeds ("Default") are renamed and
 * disabled, never deleted; a category in use cannot be deleted either, so
 * its row offers Disable only. Disabled rows stay listed, muted.
 */
export function PaymentCategoriesList() {
  const { data } = useSuspenseQuery(paymentCategoriesQuery());
  const { data: access } = useSuspenseQuery(financeAccessQuery(null));
  const can = (flag: "create" | "update" | "delete") =>
    canInFinance(access, "masters.payment_categories", flag);
  const command = usePaymentCategoryCommand();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<PaymentCategoryItem | "new" | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] =
    useState<PaymentCategoryItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.items
      .filter((item) => item.name.toLowerCase().includes(needle))
      .sort((a, b) => byName.compare(a.name, b.name));
  }, [data.items, query]);

  const addButton = can("create") ? (
    <Button
      type="button"
      onClick={() => {
        setEditing("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add Payment Category
    </Button>
  ) : null;

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Payment Categories"
          meta="What money is spent or received for, on Transactions, petty-cash vouchers, Other Expenses and payments."
          actions={addButton}
        />
        {data.items.length === 0 ? (
          <MasterEmpty
            icon={Tags}
            title="No Payment Categories yet"
            description="Add the heads your money goes to, like Fuel or Site Expenses."
            action={addButton}
          />
        ) : (
          <div className="space-y-3">
            <MasterSearch
              label="Search Payment Categories"
              value={query}
              onChange={setQuery}
            />
            <FormAlert message={listError} />
            {items.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
                No Payment Category matches “{query.trim()}”.
              </p>
            ) : (
              <ul
                aria-label="Payment Categories"
                className="bg-card divide-y rounded-xl border"
              >
                {items.map((item) =>
                  can("update") || can("delete") ? (
                    <MasterRow
                      key={item.id}
                      name={item.name}
                      details={
                        item.inUse ? (
                          <p className="text-muted-foreground truncate text-sm">
                            In use
                          </p>
                        ) : null
                      }
                      isSeed={item.isSeed}
                      disabled={item.disabled}
                      busy={
                        command.isPending &&
                        "id" in command.variables &&
                        command.variables.id === item.id
                      }
                      editLabel="Rename"
                      {...(can("update")
                        ? {
                            onEdit: () => {
                              setEditing(item);
                            },
                          }
                        : {})}
                      onToggle={() => {
                        setListError(undefined);
                        command.mutate(
                          {
                            kind: item.disabled ? "enable" : "disable",
                            id: item.id,
                          },
                          {
                            onError: (error) => {
                              setListError(errorMessage(error));
                            },
                          },
                        );
                      }}
                      {...(item.isSeed || item.inUse || !can("delete")
                        ? {}
                        : {
                            onDelete: () => {
                              setDeleteError(undefined);
                              setPendingDelete(item);
                            },
                          })}
                    />
                  ) : (
                    <li
                      key={item.id}
                      className="flex min-w-0 flex-wrap items-center gap-2 px-4 py-3"
                    >
                      <span
                        className={cn(
                          "min-w-0 truncate font-medium",
                          item.disabled && "text-muted-foreground",
                        )}
                      >
                        {item.name}
                      </span>
                      {item.isSeed ? (
                        <Badge variant="secondary">Default</Badge>
                      ) : null}
                      {item.disabled ? (
                        <Badge variant="outline">Disabled</Badge>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        )}
      </div>
      {editing != null ? (
        <PaymentCategoryDialog
          item={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDeleteDialog
        name={pendingDelete?.name ?? null}
        description="It will no longer be offered on money forms. A category that payments, vouchers or expenses use cannot be deleted; disable it instead."
        error={deleteError}
        pending={command.isPending}
        onClose={() => {
          setPendingDelete(null);
        }}
        onConfirm={() => {
          if (pendingDelete == null) return;
          command.mutate(
            { kind: "delete", id: pendingDelete.id },
            {
              onSuccess: () => {
                setPendingDelete(null);
              },
              onError: (error) => {
                setDeleteError(errorMessage(error));
              },
            },
          );
        }}
      />
    </div>
  );
}
