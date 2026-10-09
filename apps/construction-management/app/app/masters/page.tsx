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
import { MASTERS_GROUPS } from "@/lib/masters-nav";

export const metadata: Metadata = { title: "Masters" };

export default function MastersPage() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader title="Masters" meta="Your Company's lists and settings." />
        {MASTERS_GROUPS.map((group) => (
          <section
            key={group.label}
            aria-label={group.label}
            className="space-y-3"
          >
            <h2 className="text-muted-foreground text-sm font-semibold">
              {group.label}
            </h2>
            <ItemGroup className="grid gap-3 sm:grid-cols-2">
              {group.sections.map((section) => (
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
        ))}
      </div>
    </div>
  );
}
