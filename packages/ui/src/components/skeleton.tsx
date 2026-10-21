import { cn } from "cn";

/** The bar's look, for a bar that must be a `<span>` (inside text). */
const skeletonClassName =
  "bg-skeleton animate-skeleton rounded-md bg-[linear-gradient(100deg,transparent_40%,var(--skeleton-highlight)_50%,transparent_60%)] bg-size-[200vw_100%] bg-fixed bg-no-repeat motion-reduce:animate-none motion-reduce:bg-none";

/**
 * A placeholder bar in the primary tint (ADR-0047). It fades in after 150 ms
 * and shimmers; under reduced motion it shows at once and stays still.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(skeletonClassName, className)}
      {...props}
    />
  );
}

export { Skeleton, skeletonClassName };
