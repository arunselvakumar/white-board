"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

/** Media query for the `gsap.matchMedia()` branch that is allowed to move. */
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";

export { gsap, useGSAP, ScrollTrigger, SplitText };
