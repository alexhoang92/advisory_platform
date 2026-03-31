-- CreateEnum
CREATE TYPE "KolProfileStatus" AS ENUM ('unclaimed', 'claimed', 'rejected');

-- CreateTable
CREATE TABLE "unclaimed_kol_profiles" (
    "id" TEXT NOT NULL,
    "kol_id" INTEGER NOT NULL,
    "twitter_handle" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "followers_count" INTEGER NOT NULL DEFAULT 0,
    "content_type" TEXT,
    "profile_url" TEXT,
    "status" "KolProfileStatus" NOT NULL DEFAULT 'unclaimed',
    "claimed_user_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unclaimed_kol_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unclaimed_kol_profiles_kol_id_key" ON "unclaimed_kol_profiles"("kol_id");

-- CreateIndex
CREATE UNIQUE INDEX "unclaimed_kol_profiles_twitter_handle_key" ON "unclaimed_kol_profiles"("twitter_handle");

-- CreateIndex
CREATE UNIQUE INDEX "unclaimed_kol_profiles_claimed_user_id_key" ON "unclaimed_kol_profiles"("claimed_user_id");

-- CreateIndex
CREATE INDEX "unclaimed_kol_profiles_twitter_handle_idx" ON "unclaimed_kol_profiles"("twitter_handle");

-- CreateIndex
CREATE INDEX "unclaimed_kol_profiles_status_idx" ON "unclaimed_kol_profiles"("status");

-- AddForeignKey
ALTER TABLE "unclaimed_kol_profiles" ADD CONSTRAINT "unclaimed_kol_profiles_claimed_user_id_fkey" FOREIGN KEY ("claimed_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
