import { PagePlaceholder } from "@/app/app/_components/app-shell/page-placeholder";
import { mainMenuAccess } from "@/app/app/_lib/main-menu-access";
import { marketingSection, type MarketingSection } from "@/lib/marketing-nav";

import { MarketingNoAccess } from "./marketing-no-access";

/**
 * A Marketing page before its screens are built: its title and what it
 * will hold, or the no-access message when the Role leaves it out.
 */
export async function MarketingSectionPage({
  section: key,
}: {
  section: MarketingSection["key"];
}) {
  const section = marketingSection(key);
  const { marketing } = await mainMenuAccess();
  if (!marketing[key]) return <MarketingNoAccess what={section.title} />;
  return (
    <PagePlaceholder
      title={section.title}
      description={section.description}
      icon={section.icon}
    />
  );
}
