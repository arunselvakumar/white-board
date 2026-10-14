import { cn } from "cn";

/**
 * The first focusable element on a page: hidden until a keyboard user tabs to
 * it, then jumps past the navigation to the page's `<main>`.
 */
function SkipLink({
  className,
  href = "#main-content",
  children = "Skip to content",
  ...props
}: React.ComponentProps<"a">) {
  return (
    <a
      data-slot="skip-link"
      href={href}
      className={cn(
        "bg-primary text-primary-foreground focus-visible:ring-ring/50 sr-only rounded-md text-sm font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-[60] focus:px-4 focus:py-2 focus-visible:ring-3 focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}

export { SkipLink };
