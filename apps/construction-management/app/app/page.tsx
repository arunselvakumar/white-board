import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { HomeMenu } from "@/app/app/_components/app-shell/home-menu";
import { APP_HOME } from "@/lib/safe-redirect";

import { mainMenuAccess } from "./_lib/main-menu-access";
import { viewerHomePath } from "./_lib/viewer-home";

export const metadata: Metadata = { title: "Main menu" };

/**
 * Home (ADR CM-0039): the main menu on one page. An HRMS Team Member's
 * home is HRMS, so they go there.
 */
export default async function AppHome() {
  const home = await viewerHomePath();
  if (home !== APP_HOME) redirect(home);
  const access = await mainMenuAccess();
  return <HomeMenu {...access} />;
}
