import type { Metadata } from "next";

import { TermsConditionsList } from "@/components/masters/material-master-lists";

export const metadata: Metadata = { title: "Terms & Conditions" };

export default function TermsConditionsPage() {
  return <TermsConditionsList />;
}
