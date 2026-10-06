"use client";

import dynamic from "next/dynamic";

/** Loads the WebGL dot field in the browser only, so the server never imports three. */
export const HeroDotField = dynamic(
  () => import("@/components/dot-field").then((mod) => mod.DotField),
  { ssr: false },
);
