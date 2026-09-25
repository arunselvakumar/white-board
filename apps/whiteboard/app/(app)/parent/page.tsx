import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Parent" };

export default async function ParentPage() {
  const { orgRole } = await auth();
  if (orgRole !== "org:parent") redirect("/");
  return <main className="p-6">Hello world</main>;
}
