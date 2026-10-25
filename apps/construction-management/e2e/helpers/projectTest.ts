import { createProject } from "../api/projects";
import { companyTest } from "./companyTest";

/** A signed-in Owner with one Residential Project, made through the API. */
export const projectTest = companyTest.extend<{
  project: { id: string; name: string };
}>({
  project: async ({ owner }, use) => {
    await use(await createProject(owner.api));
  },
});
