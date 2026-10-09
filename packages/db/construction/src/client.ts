import { PrismaClient } from "../generated/client";

const globalForPrisma = globalThis as typeof globalThis & {
  constructionPrisma?: PrismaClient;
};

export const prisma = globalForPrisma.constructionPrisma ?? new PrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.constructionPrisma = prisma;
}
