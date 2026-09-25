import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Student" };

export default async function StudentPage() {
  const { orgRole } = await auth();
  if (orgRole !== "org:student") redirect("/");
  return <main className="p-6">Hello world</main>;
}
