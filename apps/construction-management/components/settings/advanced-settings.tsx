import { ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/item";

import { SETTINGS_SECTIONS } from "@/lib/settings-nav";

/** Settings → Advanced Settings: a card per Company rule, below the profile. */
export function AdvancedSettings() {
  return (
    <section aria-labelledby="advanced-settings-heading" className="space-y-3">
      <div>
        <h2 id="advanced-settings-heading" className="text-base font-semibold">
          Advanced Settings
        </h2>
        <p className="text-muted-foreground text-sm">
          Rules that apply across your Company.
        </p>
      </div>
      <ItemGroup className="grid gap-3 sm:grid-cols-2">
        {SETTINGS_SECTIONS.map((section) => (
          <div key={section.href} role="listitem" className="flex">
            <Item
              variant="outline"
              className="w-full"
              render={<Link href={section.href} />}
            >
              <ItemMedia variant="icon">
                <section.icon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{section.title}</ItemTitle>
                <ItemDescription>{section.description}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ChevronRight className="text-muted-foreground size-4" />
              </ItemActions>
            </Item>
          </div>
        ))}
      </ItemGroup>
    </section>
  );
}
