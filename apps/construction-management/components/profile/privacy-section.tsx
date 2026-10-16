"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { UserX } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/item";

import { DeleteAccountDialog } from "@/components/account/delete-account-dialog";
import { accountQueries } from "@/src/queries/account";

/** One action in My Profile → Privacy. */
export function PrivacyAction({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <Item variant="outline" role="listitem" className="flex-wrap">
      <ItemMedia variant="icon">{icon}</ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>{action}</ItemActions>
    </Item>
  );
}

/** Delete My Account (CM-907). */
function DeleteAccountAction() {
  const { data } = useSuspenseQuery(accountQueries.account());
  const [open, setOpen] = useState(false);
  return (
    <>
      <PrivacyAction
        icon={<UserX />}
        title="Delete my account"
        description="Leave every Company and erase your sign-in. Your Team Member records stay with each Company, marked Left."
        action={
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setOpen(true);
            }}
          >
            Delete account…
          </Button>
        }
      />
      {open && (
        <DeleteAccountDialog
          ownedCompanies={data.ownedCompanies}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

/**
 * My Profile → Privacy: a list of actions on the User's own data. Delete
 * My Account is here (CM-907); Download My Data (CM-906) is added as
 * another `PrivacyAction` in this list.
 */
export function PrivacySection() {
  return (
    <section aria-labelledby="privacy-heading" className="min-w-0 space-y-4">
      <div className="space-y-1">
        <h2 id="privacy-heading" className="text-lg font-semibold">
          Privacy
        </h2>
        <p className="text-muted-foreground text-sm">
          Your own data and your account.
        </p>
      </div>
      <ItemGroup className="gap-2">
        <DeleteAccountAction />
      </ItemGroup>
    </section>
  );
}
