import type { Metadata } from "next";
import { TeachersScreen } from "@/components/teachers/teachers-screen";
export const metadata: Metadata = { title: "Teachers" };
export default function Page() { return <TeachersScreen />; }
