import { ClosingCta } from "@/components/closing-cta";
import { FeesSection } from "@/components/fees-section";
import { Hero } from "@/components/hero";
import { MorningSection } from "@/components/morning-section";
import { RegisterLoop } from "@/components/register-loop";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WhoSection } from "@/components/who-section";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero />
        <RegisterLoop />
        <FeesSection />
        <MorningSection />
        <WhoSection />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}
