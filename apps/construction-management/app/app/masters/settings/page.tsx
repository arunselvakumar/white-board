import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
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

import { PageHeader } from "@/components/app-shell/page-header";
import { SETTINGS_SECTIONS } from "@/lib/settings-nav";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Settings"
          meta="Rules that apply across your Company."
        />
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
      </div>
    </div>
  );
}
