import type { Metadata } from "next";
import { MyBatchesScreen } from "@/components/teachers/my-batches-screen";
export const metadata: Metadata = { title: "My Batches" };
export default function Page() {
  return <MyBatchesScreen />;
}
