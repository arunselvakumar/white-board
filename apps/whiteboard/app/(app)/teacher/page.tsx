import type { Metadata } from "next";
import { MyBatchesScreen } from "@/app/(app)/teacher/_components/my-batches-screen";
export const metadata: Metadata = { title: "My Batches" };
export default function Page() {
  return <MyBatchesScreen />;
}
