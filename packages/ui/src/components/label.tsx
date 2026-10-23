"use client";

import * as React from "react";
import { cn } from "cn";

function Label({
  className,
  children,
  required = false,
  ...props
}: React.ComponentProps<"label"> & {
  /**
   * Marks the field as required with a red asterisk after the label text.
   * The asterisk is drawn with CSS and hidden from assistive technology, so
   * it stays out of the label's text and accessible name; set
   * `aria-required` on the control so screen readers announce "required".
   */
  required?: boolean;
}) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      {required ? <RequiredIndicator className="-ms-1" /> : null}
    </label>
  );
}

/**
 * The red asterisk on a required field's label or legend. Empty in the DOM:
 * `getByLabelText("Name")` and the accessible name both stay "Name". Use it
 * directly after a `<legend>`'s text for a required radio or checkbox group.
 */
function RequiredIndicator({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      data-slot="required-indicator"
      className={cn(
        "text-destructive ms-0.5 font-medium after:content-['*']",
        className,
      )}
      {...props}
    />
  );
}

export { Label, RequiredIndicator };
