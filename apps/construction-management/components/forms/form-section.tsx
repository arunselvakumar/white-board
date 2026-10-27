import { useId, type ReactNode } from "react";
import { RequiredIndicator } from "@repo/ui/components/label";

/**
 * One card of a one-page form (Add Labour, Add Staff): a title, an
 * optional hint, then its fields. The section is named by its title.
 */
export function FormSection({
  title,
  hint,
  required = false,
  children,
}: {
  title: string;
  hint?: ReactNode;
  /** The card is one required choice: a red asterisk on its title. */
  required?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="bg-card space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="space-y-1">
        <h2 id={id} className="font-semibold">
          {title}
          {required ? <RequiredIndicator /> : null}
        </h2>
        {hint != null && (
          <p className="text-muted-foreground text-sm">{hint}</p>
        )}
      </div>
      {children}
    </section>
  );
}
