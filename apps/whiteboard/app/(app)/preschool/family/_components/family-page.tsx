"use client";

import { SmileyIcon } from "@phosphor-icons/react/ssr";
import { useUser } from "@repo/auth/react";
import type { ReactNode } from "react";
import { EmptyState } from "@repo/ui/components/empty-state";

import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import type { MeChildView } from "@/src/preschool/application/me";

import { ChildSwitcher } from "./child-switcher";
import { useFamilyChild } from "./use-family-child";

/** What a Parent sees when no Child is linked to their sign-in email. */
export function NoChildLinked() {
  const { user } = useUser();
  return (
    <EmptyState
      className="m-4 w-auto border sm:m-6"
      icon={SmileyIcon}
      tone="neutral"
      orbit={false}
      title="We couldn't find your Child"
      description={`We couldn't find a Child linked to ${user?.email ?? "your email"}. Ask the Centre to check the email on your Child's record.`}
    />
  );
}

/**
 * A family page: its title, the Child switcher when the Parent has more
 * than one Child, and the page's content for the chosen Child.
 */
export function FamilyPage({
  title,
  children,
}: {
  title: (child: MeChildView) => string;
  children: (child: MeChildView, childQuery: string) => ReactNode;
}) {
  const family = useFamilyChild();
  if (family.child == null) return <NoChildLinked />;
  return (
    <PreschoolPage title={title(family.child)} meta={null} watermark="Family">
      <ChildSwitcher
        items={family.children}
        selectedId={family.child.id}
        onSelect={family.setChildId}
      />
      {children(family.child, family.childQuery)}
    </PreschoolPage>
  );
}
