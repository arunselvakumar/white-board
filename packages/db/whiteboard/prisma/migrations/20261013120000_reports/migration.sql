-- Reports for Training Institutes (issue #71, ADR-0043): Report settings,
-- remarks on the monthly student report, and joins to hosted Classes.
-- Touches only the training_institute schema (ADR-0030).
-- CreateTable
CREATE TABLE "training_institute"."class_joins" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "training_institute"."submitter_role" NOT NULL,
    "first_joined_at" TIMESTAMP(3) NOT NULL,
    "last_joined_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_joins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_institute"."report_settings" (
    "workspace_id" TEXT NOT NULL,
    "threshold_percent" INTEGER NOT NULL,
    "absent_in_a_row" INTEGER NOT NULL,
    "minimum_classes" INTEGER NOT NULL,
    "academic_year_start_month" INTEGER NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_settings_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "training_institute"."monthly_report_remarks" (
    "id" UUID NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "student_id" UUID NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "author_role" "training_institute"."poster_role" NOT NULL,
    "author_name" VARCHAR(200) NOT NULL,
    "text" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_report_remarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_joins_workspace_id_occurrence_id_idx" ON "training_institute"."class_joins"("workspace_id", "occurrence_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_joins_occurrence_id_enrollment_id_key" ON "training_institute"."class_joins"("occurrence_id", "enrollment_id");

-- CreateIndex
CREATE INDEX "monthly_report_remarks_workspace_id_month_idx" ON "training_institute"."monthly_report_remarks"("workspace_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_report_remarks_workspace_id_student_id_month_author_key" ON "training_institute"."monthly_report_remarks"("workspace_id", "student_id", "month", "author_user_id");

-- AddForeignKey
ALTER TABLE "training_institute"."class_joins" ADD CONSTRAINT "class_joins_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "training_institute"."class_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_institute"."monthly_report_remarks" ADD CONSTRAINT "monthly_report_remarks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "training_institute"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

