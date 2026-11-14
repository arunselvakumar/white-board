"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { History, Store } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { PersonActivity } from "@/app/app/_components/activity/person-activity";
import {
  EditVendorDetails,
  FormPage,
} from "@/app/app/staff/vendors/_components/vendor-form";
import { vendorActivityQuery } from "@/src/queries/activity";
import { vendorQuery } from "@/src/queries/vendors";

const TABS = ["details", "activity"] as const;

/**
 * A Vendor's page (ADR CM-0044 §7): Details (Edit Vendor's form) and
 * Activity, the tab kept in the address (`?tab=activity`). Details stays
 * mounted while Activity shows, so typed changes survive a tab switch.
 */
export function VendorPage({
  id,
  now,
}: {
  id: string;
  /** For stories: what "Today" is in the feed. */
  now?: Date;
}) {
  const { data } = useSuspenseQuery(vendorQuery(id));
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS).withDefault("details"),
  );
  return (
    <FormPage title={`Edit ${data.name}`} watermark="Vendors">
      <Tabs
        value={tab}
        onValueChange={(next: (typeof TABS)[number]) => {
          void setTab(next === "details" ? null : next);
        }}
      >
        <TabsList>
          <TabsTrigger value="details">
            <Store aria-hidden="true" />
            Details
          </TabsTrigger>
          <TabsTrigger value="activity">
            <History aria-hidden="true" />
            Activity
          </TabsTrigger>
        </TabsList>
        <TabsContent value="details" keepMounted className="pt-4">
          <EditVendorDetails vendor={data} />
        </TabsContent>
        <TabsContent value="activity" className="pt-4">
          <PersonActivity
            query={(filter) => vendorActivityQuery(id, filter)}
            now={now}
          />
        </TabsContent>
      </Tabs>
    </FormPage>
  );
}
