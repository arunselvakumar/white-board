-- Identity on Better Auth (ADR-0034). Users, Sessions, Workspaces, members,
-- and invitations live in their own Postgres schema.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateTable
CREATE TABLE "identity"."users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "username" TEXT,
    "display_username" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "active_workspace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "metadata" TEXT,
    "institution_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."workspace_members" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."workspace_invitations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "inviter_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "identity"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "identity"."users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "identity"."sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "identity"."sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "identity"."accounts"("user_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "identity"."verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "identity"."workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspace_members_user_id_idx" ON "identity"."workspace_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "identity"."workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "workspace_invitations_workspace_id_idx" ON "identity"."workspace_invitations"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_invitations_email_idx" ON "identity"."workspace_invitations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "identity"."rate_limits"("key");

-- AddForeignKey
ALTER TABLE "identity"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "identity"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "identity"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one pending invitation per email per Workspace. Prisma cannot model
-- a partial unique index, so it lives only in this hand-written migration.
CREATE UNIQUE INDEX "workspace_invitations_one_pending_key" ON "identity"."workspace_invitations"("workspace_id", "email") WHERE "status" = 'pending';
