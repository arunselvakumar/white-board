"use client";

import type { ReactNode } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

/** Mobile first, email second (ADR CM-0002). */
export function AuthTabs({
  mobile,
  email,
}: {
  mobile: ReactNode;
  email: ReactNode;
}) {
  return (
    <Tabs defaultValue="mobile" className="gap-6">
      <TabsList className="w-full">
        <TabsTrigger value="mobile">Mobile</TabsTrigger>
        <TabsTrigger value="email">Email</TabsTrigger>
      </TabsList>
      <TabsContent value="mobile">{mobile}</TabsContent>
      <TabsContent value="email">{email}</TabsContent>
    </Tabs>
  );
}
