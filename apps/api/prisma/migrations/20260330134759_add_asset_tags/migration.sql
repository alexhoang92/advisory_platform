-- CreateEnum
CREATE TYPE "Market" AS ENUM ('us_stock', 'crypto', 'id_stock', 'vn_stock');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('stock', 'etf', 'crypto', 'index');

-- CreateTable
CREATE TABLE "asset_tags" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "asset_type" "AssetType" NOT NULL,
    "currency" TEXT,
    "exchange" TEXT,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_tags_ticker_key" ON "asset_tags"("ticker");

-- CreateIndex
CREATE INDEX "asset_tags_ticker_idx" ON "asset_tags"("ticker");

-- CreateIndex
CREATE INDEX "asset_tags_name_idx" ON "asset_tags"("name");
