import type { Metadata } from "next";
import { TeachersScreen } from "@/app/(app)/teachers/_components/teachers-screen";
export const metadata: Metadata = { title: "Teachers" };
export default function Page() {
  return <TeachersScreen />;
}
