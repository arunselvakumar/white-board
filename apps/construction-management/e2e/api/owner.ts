import type { PlaywrightWorkerArgs } from "@playwright/test";

type Playwright = PlaywrightWorkerArgs["playwright"];

import { ApiClient } from "./ApiClient";
import { createCompany } from "./organization";
import {
  PASSWORD,
  newApiSession,
  newEmail,
  signUpByEmail,
  unique,
} from "./session";

export type Owner = {
  name: string;
  email: string;
  password: string;
  userId: string;
  company: { id: string; name: string };
  /** The Owner's API session, for arranging data. */
  api: ApiClient;
};

/** A fresh User, signed up by email, who owns a fresh Company. */
export async function createOwner(
  playwright: Playwright,
  baseURL: string,
): Promise<Owner> {
  const request = await newApiSession(playwright, baseURL);
  const name = "Arun Selva Kumar";
  const email = newEmail("owner");
  const { userId } = await signUpByEmail(request, { name, email });
  const api = new ApiClient(request);
  const company = await createCompany(api, unique("Anugraha Engineers"));
  return { name, email, password: PASSWORD, userId, company, api };
}
