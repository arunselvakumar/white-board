import { ChevronRight, Users } from "lucide-react";
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
import { HRMS_PATH } from "@/lib/hrms-nav";

export const metadata: Metadata = { title: "Workspace" };

/**
 * Work across all Projects (`docs/00-overview.md`). HRMS is the first
 * module; Central Store, Central Payment and Central Reports follow.
 */
const MODULES = [
  {
    href: HRMS_PATH,
    title: "HRMS",
    description:
      "Your staff's attendance with geo-fenced check-in, leave, shifts, holidays and monthly salary.",
    icon: Users,
  },
] as const;

export default function WorkspacePage() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader title="Workspace" meta="Work across all your Projects." />
        <ItemGroup className="grid gap-3 sm:grid-cols-2">
          {MODULES.map((module) => (
            <div key={module.href} role="listitem" className="flex">
              <Item
                variant="outline"
                className="w-full"
                render={<Link href={module.href} />}
              >
                <ItemMedia variant="icon">
                  <module.icon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{module.title}</ItemTitle>
                  <ItemDescription>{module.description}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ChevronRight className="text-muted-foreground size-4" />
                </ItemActions>
              </Item>
            </div>
          ))}
        </ItemGroup>
        <p className="text-muted-foreground text-sm">
          Central Store, Central Payment and Central Reports will show here as
          they are built.
        </p>
      </div>
    </div>
  );
}
