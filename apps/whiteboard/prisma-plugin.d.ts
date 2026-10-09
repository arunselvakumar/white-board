// The Prisma workaround plugin ships without types (next.config.ts).
declare module "@prisma/nextjs-monorepo-workaround-plugin" {
  export class PrismaPlugin {
    apply(compiler: unknown): void;
  }
}
