import type { Metadata } from "next";

import { PaymentCategoriesList } from "@/components/finance/payment-categories/payment-categories-list";

export const metadata: Metadata = { title: "Payment Categories" };

/** Masters → Payment Categories (CM-704). */
export default function PaymentCategoriesPage() {
  return <PaymentCategoriesList />;
}
