"use client";

import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

/**
 * Classes that size or place the text box in its parent. With the glow on,
 * they go on the wrapper so `w-40`, `flex-1`, `col-span-2` or `mt-2` keep
 * working; everything else styles the `<input>`.
 */
const LAYOUT_CLASS =
  /^-?(?:w|min-w|max-w|basis|grow|shrink|order|self|justify-self|place-self|m[trblxyse]?|col|col-span|col-start|col-end|row|row-span|row-start|row-end)-|^(?:hidden|grow|shrink|flex-(?:1|auto|initial|none|\[.*\]))$/;

/** Splits off variant prefixes (`sm:`, `hover:`, `[&>x]:`) and `!`. */
function baseUtility(token: string) {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    if (char === "[" || char === "(") depth++;
    else if (char === "]" || char === ")") depth--;
    else if (char === ":" && depth === 0) start = i + 1;
  }
  return token.slice(start).replace(/^!|!$/g, "");
}

function splitLayoutClasses(className: string | undefined) {
  const layout: string[] = [];
  const control: string[] = [];
  for (const token of (className ?? "").split(/\s+/)) {
    if (token === "") continue;
    (LAYOUT_CLASS.test(baseUtility(token)) ? layout : control).push(token);
  }
  return { layout: layout.join(" "), control: control.join(" ") };
}

const NO_GLOW_TYPES = new Set([
  "hidden",
  "file",
  "checkbox",
  "radio",
  "range",
  "color",
  "image",
  "submit",
  "reset",
  "button",
]);

const inputClassName =
  "border-input file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm";

/**
 * A text box. On hover a soft ring in the theme colour follows the cursor
 * around its border (Aceternity's Signup Form input). The cursor position is
 * written to CSS variables, so moving the mouse does not re-render.
 *
 * Pass `glow={false}` when the input sits inside a box that draws its own
 * border (`InputGroupInput`). Hidden, file and other non-text inputs, and
 * `sr-only` inputs, never get the wrapper.
 */
function Input({
  className,
  type,
  glow = true,
  ...props
}: React.ComponentProps<"input"> & { glow?: boolean }) {
  const control = (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(inputClassName, className)}
      {...props}
    />
  );
  if (
    !glow ||
    props.hidden ||
    (type != null && NO_GLOW_TYPES.has(type)) ||
    /(?:^|\s)sr-only(?:\s|$)/.test(className ?? "")
  ) {
    return control;
  }

  const classes = splitLayoutClasses(className);
  return (
    <div
      data-slot="input-glow"
      onMouseMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty(
          "--input-glow-x",
          `${event.clientX - box.left}px`,
        );
        event.currentTarget.style.setProperty(
          "--input-glow-y",
          `${event.clientY - box.top}px`,
        );
      }}
      className={cn(
        "group/input-glow grid w-full min-w-0 grid-cols-[minmax(0,1fr)] [--input-glow-color:var(--ring)] has-[[aria-invalid=true]]:[--input-glow-color:var(--destructive)]",
        classes.layout,
      )}
    >
      <InputPrimitive
        type={type}
        data-slot="input"
        className={cn(
          inputClassName,
          "peer/input col-start-1 row-start-1",
          classes.control,
        )}
        {...props}
      />
      {/* A ring over the border and 2px past it, painted after the input so
          it shows on top; not positioned, so it never covers a caller's
          icon. */}
      <span
        aria-hidden="true"
        className="pointer-events-none col-start-1 row-start-1 -m-0.5 rounded-[calc(var(--radius-lg)+2px)] bg-[radial-gradient(100px_circle_at_var(--input-glow-x,50%)_var(--input-glow-y,50%),var(--input-glow-color),transparent_80%)] p-[3px] opacity-0 transition-opacity duration-300 [mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)] group-hover/input-glow:opacity-100 peer-read-only/input:hidden peer-disabled/input:hidden motion-reduce:hidden"
      />
    </div>
  );
}

export { Input };
