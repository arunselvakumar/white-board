import { SequenceIdsPage } from "../pages/SequenceIdsPage";
import { companyTest } from "./companyTest";

export const sequenceIdsPageTest = companyTest.extend<{
  sequenceIdsPage: SequenceIdsPage;
}>({
  sequenceIdsPage: async ({ page }, use) => {
    await use(new SequenceIdsPage(page));
  },
});
