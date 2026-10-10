import { Boxes, ChevronRight, Warehouse } from "lucide-react";
import Link from "next/link";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/item";

import {
  CENTRAL_INVENTORY_PATH,
  CENTRAL_STORE_PATH,
} from "./central-store-parts";

/** The Workspace page's Central Store tile (CM-508). */
export function CentralStoreWorkspaceTile() {
  return (
    <Item
      variant="outline"
      className="w-full"
      render={<Link href={CENTRAL_STORE_PATH} />}
    >
      <ItemMedia variant="icon">
        <Warehouse />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Central Store</ItemTitle>
        <ItemDescription>
          Stores that serve your Projects: their stock, Material Requests from
          sites and the Delivery Notes that answer them.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <ChevronRight className="text-muted-foreground size-4" />
      </ItemActions>
    </Item>
  );
}

/** The Workspace page's Central Inventory tile (CM-509). */
export function CentralInventoryWorkspaceTile() {
  return (
    <Item
      variant="outline"
      className="w-full"
      render={<Link href={CENTRAL_INVENTORY_PATH} />}
    >
      <ItemMedia variant="icon">
        <Boxes />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Central Inventory</ItemTitle>
        <ItemDescription>
          Stock of every material at every Project and Store, what is in
          transit, and the Stock Ledger as Excel.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <ChevronRight className="text-muted-foreground size-4" />
      </ItemActions>
    </Item>
  );
}
