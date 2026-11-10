import type { Metadata } from "next";

import { PaymentCategoriesList } from "@/app/app/masters/payment-categories/_components/payment-categories-list";

export const metadata: Metadata = { title: "Payment Categories" };

export default function PaymentCategoriesPage() {
  return <PaymentCategoriesList />;
}
