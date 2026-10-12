import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { addTransactionRow } from "../documents/document-test-rows";
import { POST as deleteCategory } from "./[id]/delete/route";
import { POST as disableCategory } from "./[id]/disable/route";
import { POST as enableCategory } from "./[id]/enable/route";
import { GET as getCategory } from "./[id]/route";
import { POST as renameCategory } from "./[id]/update/route";
import { GET as listOptions } from "./options/route";
import { GET as listCategories, POST as createCategory } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/finance/payment-categories`;

type Category = {
  id: string;
  name: string;
  isSeed: boolean;
  disabled: boolean;
  inUse: boolean;
  updatedAt: string;
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

async function list(cookie: string, status = "") {
  const response = await listCategories(
    jsonRequest(`${BASE}${status === "" ? "" : `?status=${status}`}`, cookie),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<{ items: Category[]; total: number }>(response);
}

async function create(cookie: string, name: string) {
  return createCategory(jsonRequest(BASE, cookie, { name }));
}

function command(
  route: (request: Request, context: ReturnType<typeof params>) => unknown,
  cookie: string,
  id: string,
  verb: string,
  body: unknown = {},
) {
  return route(
    jsonRequest(`${BASE}/${id}/${verb}`, cookie, body),
    params(id),
  ) as Promise<Response>;
}

describe("Payment Categories (CM-704)", () => {
  it("lists the seeds and adds a name unique in any case", async () => {
    const owner = await ownerWithCompany();
    const seeded = await list(owner.cookie);
    expect(seeded.total).toBe(25);
    expect(seeded.items[0]).toMatchObject({
      name: "Bonus",
      isSeed: true,
      disabled: false,
      inUse: false,
    });

    const added = await create(owner.cookie, "  Cement   testing ");
    expect(added.status).toBe(StatusCodes.CREATED);
    expect(await json<Category>(added)).toMatchObject({
      name: "Cement testing",
      isSeed: false,
    });
    const again = await create(owner.cookie, "CEMENT TESTING");
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(again)).toBe("PAYMENT_CATEGORY_NAME_TAKEN");
    const seedName = await create(owner.cookie, "fuel");
    expect(await codeOf(seedName)).toBe("PAYMENT_CATEGORY_NAME_TAKEN");
    const empty = await create(owner.cookie, "   ");
    expect(empty.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(empty)).toBe("PAYMENT_CATEGORY_NAME_REQUIRED");

    // Another Company may use the same name.
    const other = await ownerWithCompany("Other Builders");
    expect((await create(other.cookie, "Cement testing")).status).toBe(
      StatusCodes.CREATED,
    );
  });

  it("renames with the loaded updatedAt, a seed too", async () => {
    const owner = await ownerWithCompany();
    const fuel = (await list(owner.cookie)).items.find(
      (item) => item.name === "Fuel",
    );
    if (fuel == null) throw new Error("No Fuel seed");
    const renamed = await command(
      renameCategory,
      owner.cookie,
      fuel.id,
      "update",
      { name: "Fuel & diesel", expectedUpdatedAt: fuel.updatedAt },
    );
    expect(renamed.status).toBe(StatusCodes.OK);
    expect(await json<Category>(renamed)).toMatchObject({
      name: "Fuel & diesel",
      isSeed: true,
    });
    const stale = await command(
      renameCategory,
      owner.cookie,
      fuel.id,
      "update",
      { name: "Diesel", expectedUpdatedAt: fuel.updatedAt },
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(stale)).toBe("PAYMENT_CATEGORY_CHANGED");
    const current = await json<Category>(
      await getCategory(
        jsonRequest(`${BASE}/${fuel.id}`, owner.cookie),
        params(fuel.id),
      ),
    );
    const clash = await command(
      renameCategory,
      owner.cookie,
      fuel.id,
      "update",
      { name: "rent", expectedUpdatedAt: current.updatedAt },
    );
    expect(await codeOf(clash)).toBe("PAYMENT_CATEGORY_NAME_TAKEN");
  });

  it("disables any category off the pickers and enables it back", async () => {
    const owner = await ownerWithCompany();
    const rent = (await list(owner.cookie)).items.find(
      (item) => item.name === "Rent",
    );
    if (rent == null) throw new Error("No Rent seed");
    const disabled = await command(
      disableCategory,
      owner.cookie,
      rent.id,
      "disable",
    );
    expect(await json<Category>(disabled)).toMatchObject({ disabled: true });
    expect((await list(owner.cookie, "disabled")).items).toEqual([
      expect.objectContaining({ id: rent.id }),
    ]);
    expect(
      (await list(owner.cookie, "enabled")).items.map((item) => item.id),
    ).not.toContain(rent.id);
    const options = await json<{ items: { id: string }[] }>(
      await listOptions(jsonRequest(`${BASE}/options`, owner.cookie)),
    );
    expect(options.items.map((item) => item.id)).not.toContain(rent.id);
    const enabled = await command(
      enableCategory,
      owner.cookie,
      rent.id,
      "enable",
    );
    expect(await json<Category>(enabled)).toMatchObject({ disabled: false });
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: {
          workspaceId: owner.workspaceId,
          action: {
            in: ["payment_category.disabled", "payment_category.enabled"],
          },
        },
      }),
    ).toBe(2);
  });

  it("deletes an unused category, never a seed or one in use", async () => {
    const owner = await ownerWithCompany();
    const seeds = (await list(owner.cookie)).items;
    const seed = seeds[0];
    if (seed == null) throw new Error("No seeds");
    const refusedSeed = await command(
      deleteCategory,
      owner.cookie,
      seed.id,
      "delete",
    );
    expect(refusedSeed.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refusedSeed)).toBe("PAYMENT_CATEGORY_SEED");

    const used = await json<Category>(await create(owner.cookie, "Testing"));
    const txn = await addTransactionRow(owner.workspaceId, owner.userId, null);
    await prisma.constructionFinanceTransaction.update({
      where: { id: txn.id },
      data: { paymentCategoryId: used.id },
    });
    expect(
      (await list(owner.cookie)).items.find((item) => item.id === used.id),
    ).toMatchObject({ inUse: true });
    const refusedUsed = await command(
      deleteCategory,
      owner.cookie,
      used.id,
      "delete",
    );
    expect(refusedUsed.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refusedUsed)).toBe("PAYMENT_CATEGORY_IN_USE");

    const spare = await json<Category>(await create(owner.cookie, "Spare"));
    expect(
      (await command(deleteCategory, owner.cookie, spare.id, "delete")).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(
      (await list(owner.cookie)).items.map((item) => item.id),
    ).not.toContain(spare.id);
    // Its name is free again.
    expect((await create(owner.cookie, "Spare")).status).toBe(
      StatusCodes.CREATED,
    );
    const gone = await getCategory(
      jsonRequest(`${BASE}/${spare.id}`, owner.cookie),
      params(spare.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(gone)).toBe("PAYMENT_CATEGORY_NOT_FOUND");
  });

  it("checks the Payment Categories menu", async () => {
    const owner = await ownerWithCompany();
    const reader = await memberWith(owner, {
      "masters.payment_categories": ["read"],
    });
    expect((await list(reader.cookie)).total).toBe(25);
    const refused = await create(reader.cookie, "Anything");
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(refused)).toBe("PERMISSION_DENIED");
    const outsider = await memberWith(owner, {
      "finance.petty_cash": ["read", "create"],
    });
    expect(
      (await listCategories(jsonRequest(BASE, outsider.cookie))).status,
    ).toBe(StatusCodes.FORBIDDEN);
    // The pickers' options stay open to every member.
    expect(
      (await listOptions(jsonRequest(`${BASE}/options`, outsider.cookie)))
        .status,
    ).toBe(StatusCodes.OK);
    const deleter = await memberWith(owner, {
      "masters.payment_categories": ["read", "create", "delete"],
    });
    const mine = await json<Category>(await create(deleter.cookie, "Mine"));
    expect(
      (await command(disableCategory, deleter.cookie, mine.id, "disable"))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await command(deleteCategory, deleter.cookie, mine.id, "delete")).status,
    ).toBe(StatusCodes.NO_CONTENT);
  });

  it("is on /api/docs", async () => {
    const document = (await getOpenApi().json()) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const path = "/api/construction/finance/payment-categories";
    expect(Object.keys(document.paths[path] ?? {})).toEqual(["get", "post"]);
    for (const verb of ["update", "disable", "enable", "delete"])
      expect(document.paths[`${path}/{id}/${verb}`]?.["post"]).toBeDefined();
    expect(document.paths[`${path}/options`]?.["get"]).toBeDefined();
  });
});
