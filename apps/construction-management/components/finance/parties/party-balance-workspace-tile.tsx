import { ChevronRight, Scale } from "lucide-react";
import Link from "next/link";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/item";

/**
 * The Workspace page's Party Balance tile (CM-708), for members who may
 * read Parties: the Workspace submenu lists Party Balance, so the page
 * does too.
 */
export function PartyBalanceWorkspaceTile() {
  return (
    <Item
      variant="outline"
      className="bg-card w-full"
      render={<Link href="/app/workspace/party-balance" />}
    >
      <ItemMedia variant="icon">
        <Scale />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Party Balance</ItemTitle>
        <ItemDescription>
          What each Other Party owes or is owed across your Projects, with a
          statement per Project.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <ChevronRight className="text-muted-foreground size-4" />
      </ItemActions>
    </Item>
  );
}
