-- A Project's folder colour on the Projects home (ADR CM-0026). Every
-- existing Project becomes Lavender, the default. Touches no other schema
-- (ADR-0030).

-- CreateEnum
CREATE TYPE "construction_projects"."project_color" AS ENUM ('lavender', 'peach', 'sky', 'mint', 'lemon', 'rose', 'sand', 'slate');

-- AlterTable
ALTER TABLE "construction_projects"."projects" ADD COLUMN     "color" "construction_projects"."project_color" NOT NULL DEFAULT 'lavender';
