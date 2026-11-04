import type { StaticImageData } from "next/image";

import axelTowers from "./photos/axel-towers.webp";
import blueprintReview from "./photos/blueprint-review.webp";
import crewAtWork from "./photos/crew-at-work.webp";
import hammerCrew from "./photos/hammer-crew.webp";
import redHardHat from "./photos/red-hard-hat.webp";

/** A photo for the brand panel, with the credit Unsplash asks for. */
export type AuthPhoto = {
  image: StaticImageData;
  photographer: string;
  /** The photographer's Unsplash handle, without the `@`. */
  username: string;
};

/**
 * Site photos from Unsplash (Unsplash License: free to use, no permission
 * needed). Stored in the repo at 1600 px wide so sign-in never waits on a third
 * party; `next/image` serves the size each screen needs.
 */
export const AUTH_PHOTOS = [
  {
    image: hammerCrew,
    photographer: "Arron Choi",
    username: "arronchoi",
  },
  {
    image: axelTowers,
    photographer: "Joakim Nådell",
    username: "joakimnadell",
  },
  {
    image: blueprintReview,
    photographer: "Pedro Miranda",
    username: "mirandanef",
  },
  {
    image: redHardHat,
    photographer: "Mina Rad",
    username: "miinrad",
  },
  {
    image: crewAtWork,
    photographer: "Nate Johnston",
    username: "natejohnston",
  },
] as const satisfies readonly AuthPhoto[];

/** One photo per visit; the server picks so the first paint has it. */
export function pickAuthPhoto(random: () => number = Math.random): AuthPhoto {
  const index = Math.floor(random() * AUTH_PHOTOS.length);
  return AUTH_PHOTOS[index] ?? AUTH_PHOTOS[0];
}

/** Unsplash asks referral links to carry these UTM parameters. */
export function unsplashUrl(path: string): string {
  return `https://unsplash.com/${path}?utm_source=construction_management&utm_medium=referral`;
}
