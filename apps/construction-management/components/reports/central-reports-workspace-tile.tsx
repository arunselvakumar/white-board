import { ChevronRight, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/item";

/** The Workspace page's Central Reports tile (CM-903). */
export function CentralReportsWorkspaceTile() {
  return (
    <Item
      variant="outline"
      className="w-full"
      render={<Link href="/app/workspace/central-reports" />}
    >
      <ItemMedia variant="icon">
        <FileSpreadsheet />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Central Reports</ItemTitle>
        <ItemDescription>
          Labour attendance, Purchase Requests and Orders, material received and
          transferred, and the Stock Register across your Projects and the
          Central Stores, as Excel and PDF.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <ChevronRight className="text-muted-foreground size-4" />
      </ItemActions>
    </Item>
  );
}
