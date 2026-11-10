import type { Metadata } from "next";

import { TermsConditionsList } from "@/app/app/masters/_components/material-master-lists";

export const metadata: Metadata = { title: "Terms & Conditions" };

export default function TermsConditionsPage() {
  return <TermsConditionsList />;
}
