import { Button } from "@repo/ui/components/button";
import {
  WHITEBOARD_SIGN_IN_URL,
  WHITEBOARD_SIGN_UP_URL,
} from "@/lib/whiteboard-url";

export function ClosingCta() {
  return (
    <section
      aria-labelledby="closing-cta-heading"
      className="bg-primary text-primary-foreground py-24 md:py-32"
    >
      <div className="container-site">
        <div className="max-w-3xl">
          <h2 id="closing-cta-heading" className="text-section">
            The register goes in the drawer today.
          </h2>
          <p className="text-primary-foreground/90 mt-6 max-w-[52ch] text-xl leading-[1.5]">
            Create a Workspace, add the first Student, and take the first Fee
            Payment before the evening batch.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Button
              render={<a href={WHITEBOARD_SIGN_UP_URL} />}
              nativeButton={false}
              variant="secondary"
              size="lg"
              className="focus-visible:border-primary-foreground focus-visible:ring-primary-foreground/60 h-12 px-6 text-base font-semibold"
            >
              Create your Workspace
            </Button>
            <a
              href={WHITEBOARD_SIGN_IN_URL}
              className="text-primary-foreground decoration-primary-foreground/40 hover:decoration-primary-foreground focus-visible:ring-primary-foreground/60 rounded-md text-base font-semibold underline underline-offset-4 transition-colors focus-visible:ring-3 focus-visible:outline-none"
            >
              Sign in
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
