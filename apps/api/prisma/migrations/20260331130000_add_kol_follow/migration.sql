-- CreateTable
CREATE TABLE "kol_follows" (
    "id" TEXT NOT NULL,
    "follower_id" TEXT NOT NULL,
    "kol_profile_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kol_follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kol_follows_follower_id_kol_profile_id_key" ON "kol_follows"("follower_id", "kol_profile_id");

-- CreateIndex
CREATE INDEX "kol_follows_follower_id_idx" ON "kol_follows"("follower_id");

-- AddForeignKey
ALTER TABLE "kol_follows" ADD CONSTRAINT "kol_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kol_follows" ADD CONSTRAINT "kol_follows_kol_profile_id_fkey" FOREIGN KEY ("kol_profile_id") REFERENCES "unclaimed_kol_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
