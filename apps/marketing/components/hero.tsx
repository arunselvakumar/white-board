import { Button } from "@repo/ui/components/button";
import { RegisterScene } from "@/components/register-scene";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="bg-background relative overflow-x-clip"
    >
      <div className="container-site grid min-h-[calc(100svh-4rem)] items-center gap-y-12 pt-28 pb-16 lg:grid-cols-12 lg:gap-x-6 lg:pt-32 lg:pb-24">
        <div className="relative z-10 lg:col-span-5">
          <h1 id="hero-heading" className="text-display text-foreground">
            Throw away the register.
          </h1>
          <p className="text-foreground mt-8 max-w-[48ch] text-[1.25rem] leading-[1.5]">
            Whiteboard puts a Training Institute&rsquo;s register on a screen.
            Students, Courses, Batches, Fee Payments, and Receipts, in one
            Workspace.
          </p>
          <p className="text-muted-foreground mt-4 max-w-[48ch] text-[1.0625rem] leading-[1.6]">
            Built for computer centres, home tuition, and skill centres.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Button
              render={<a href="/app/signup" />}
              nativeButton={false}
              size="lg"
              className="h-12 px-6 text-base font-semibold"
            >
              Create your Workspace
            </Button>
            <a
              href="/app/login"
              className="text-foreground decoration-foreground/30 hover:decoration-foreground focus-visible:ring-ring/50 -mx-1 rounded-md px-1 text-base font-semibold underline underline-offset-4 transition-colors focus-visible:ring-3 focus-visible:outline-none"
            >
              Sign in
            </a>
          </div>
        </div>
        <div className="min-[1400px]:-mr-24 lg:col-span-7 lg:col-start-6 lg:-mr-10">
          <RegisterScene />
        </div>
      </div>
    </section>
  );
}
