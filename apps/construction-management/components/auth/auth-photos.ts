import type { StaticImageData } from "next/image";

import apartmentBlocks from "./photos/apartment-blocks.webp";
import concreteFrame from "./photos/concrete-frame.webp";
import craneTwilight from "./photos/crane-twilight.webp";
import cranesPurpleSky from "./photos/cranes-purple-sky.webp";
import pouringConcrete from "./photos/pouring-concrete.webp";
import rebarSunset from "./photos/rebar-sunset.webp";
import scaffoldClimber from "./photos/scaffold-climber.webp";
import siteCrew from "./photos/site-crew.webp";
import towerAndCrane from "./photos/tower-and-crane.webp";
import towerCraneDusk from "./photos/tower-crane-dusk.webp";

/** A photo for the brand panel, with the credit Unsplash asks for. */
export type AuthPhoto = {
  image: StaticImageData;
  photographer: string;
  /** The photographer's Unsplash handle, without the `@`. */
  username: string;
};

/**
 * Site photos from Unsplash (Unsplash License: free to use, no permission
 * needed). Stored in the repo at 1600 px so sign-in never waits on a third
 * party; `next/image` serves the size each screen needs.
 */
export const AUTH_PHOTOS = [
  {
    image: pouringConcrete,
    photographer: "Hammilton Ojijo",
    username: "ojijohammilton",
  },
  {
    image: towerCraneDusk,
    photographer: "James Sullivan",
    username: "iamjsullivan",
  },
  {
    image: siteCrew,
    photographer: "Adhitya Sibikumar",
    username: "adhitya_2505",
  },
  {
    image: towerAndCrane,
    photographer: "Ryunosuke Kikuno",
    username: "ryunosuke_kikuno",
  },
  {
    image: apartmentBlocks,
    photographer: "Parth Savani",
    username: "iparthsavani",
  },
  {
    image: rebarSunset,
    photographer: "Abhishek Kirloskar",
    username: "nuvolephotos",
  },
  {
    image: concreteFrame,
    photographer: "Parth Savani",
    username: "iparthsavani",
  },
  {
    image: craneTwilight,
    photographer: "Hansjörg Keller",
    username: "kel_foto",
  },
  { image: cranesPurpleSky, photographer: "krzhck", username: "krzhck" },
  { image: scaffoldClimber, photographer: "Jay Ee", username: "da_b_da" },
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
