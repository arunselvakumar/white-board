import type { Metadata } from "next";

import { CheckoutWizard } from "@/components/subscription/checkout-wizard";

export const metadata: Metadata = { title: "Choose a plan" };

/** `?kind=new|extend|upgrade|add_ons`; the wizard falls back to what the plan allows. */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { kind } = await searchParams;
  return <CheckoutWizard kind={typeof kind === "string" ? kind : null} />;
}
