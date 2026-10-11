import { ChevronRight, HandCoins } from "lucide-react";
import Link from "next/link";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/item";

/** The Workspace page's Central Payment tile (CM-709). */
export function CentralPaymentWorkspaceTile() {
  return (
    <Item
      variant="outline"
      className="w-full"
      render={<Link href="/app/workspace/central-payment" />}
    >
      <ItemMedia variant="icon">
        <HandCoins />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Central Payment</ItemTitle>
        <ItemDescription>
          What each Contractor, Supplier and Other Party is due across your
          Projects, account balances, petty cash and the Ledger, TDS 194C and
          Due Payments reports.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <ChevronRight className="text-muted-foreground size-4" />
      </ItemActions>
    </Item>
  );
}
