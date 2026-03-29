-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('expert', 'retail', 'admin');

-- CreateEnum
CREATE TYPE "PostVisibility" AS ENUM ('public', 'preview', 'subscribers_only');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('discussion', 'trade_call', 'research', 'update');

-- CreateEnum
CREATE TYPE "TradeDirection" AS ENUM ('long', 'short');

-- CreateEnum
CREATE TYPE "TradeTimeframe" AS ENUM ('intraday', 'swing', 'position', 'long_term');

-- CreateEnum
CREATE TYPE "TradeConviction" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('open', 'closed', 'stopped_out');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'cancelled', 'past_due');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'retail',
    "bio" TEXT,
    "location" TEXT,
    "website" TEXT,
    "stripe_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expert_profiles" (
    "user_id" TEXT NOT NULL,
    "specializations" TEXT[],
    "subscription_price_monthly" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credibility_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "total_followers" INTEGER NOT NULL DEFAULT 0,
    "win_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "avg_return" DECIMAL(10,4) NOT NULL DEFAULT 0,

    CONSTRAINT "expert_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body_public" TEXT NOT NULL,
    "body_locked" TEXT,
    "visibility" "PostVisibility" NOT NULL DEFAULT 'public',
    "unlock_price" DECIMAL(12,2),
    "tickers" TEXT[],
    "post_type" "PostType" NOT NULL DEFAULT 'discussion',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_calls" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "expert_id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "direction" "TradeDirection" NOT NULL,
    "entry_price" DECIMAL(12,2),
    "target_price" DECIMAL(12,2) NOT NULL,
    "stop_loss" DECIMAL(12,2) NOT NULL,
    "timeframe" "TradeTimeframe" NOT NULL,
    "conviction" "TradeConviction" NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'open',
    "outcome_return" DECIMAL(10,4),
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "portfolio_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "id" TEXT NOT NULL,
    "follower_id" TEXT NOT NULL,
    "following_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "subscriber_id" TEXT NOT NULL,
    "expert_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_unlocks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL,
    "stripe_payment_intent_id" TEXT NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tips" (
    "id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "stripe_payment_intent_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credibility_scores" (
    "expert_id" TEXT NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "win_rate" DECIMAL(5,4) NOT NULL,
    "avg_return_per_call" DECIMAL(10,4) NOT NULL,
    "total_calls" INTEGER NOT NULL,
    "calls_closed" INTEGER NOT NULL,
    "follower_growth_30d" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credibility_scores_pkey" PRIMARY KEY ("expert_id")
);

-- CreateTable
CREATE TABLE "tickers" (
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "last_price" DECIMAL(12,2),
    "change_pct" DECIMAL(8,4),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickers_pkey" PRIMARY KEY ("symbol")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_key" ON "posts"("slug");

-- CreateIndex
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

-- CreateIndex
CREATE INDEX "posts_created_at_idx" ON "posts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "portfolio_calls_expert_id_idx" ON "portfolio_calls"("expert_id");

-- CreateIndex
CREATE INDEX "portfolio_calls_ticker_idx" ON "portfolio_calls"("ticker");

-- CreateIndex
CREATE INDEX "follows_following_id_idx" ON "follows"("following_id");

-- CreateIndex
CREATE UNIQUE INDEX "follows_follower_id_following_id_key" ON "follows"("follower_id", "following_id");

-- CreateIndex
CREATE INDEX "subscriptions_subscriber_id_idx" ON "subscriptions"("subscriber_id");

-- CreateIndex
CREATE INDEX "subscriptions_expert_id_idx" ON "subscriptions"("expert_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_unlocks_user_id_post_id_key" ON "post_unlocks"("user_id", "post_id");

-- CreateIndex
CREATE INDEX "tips_post_id_idx" ON "tips"("post_id");

-- AddForeignKey
ALTER TABLE "expert_profiles" ADD CONSTRAINT "expert_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_calls" ADD CONSTRAINT "portfolio_calls_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_calls" ADD CONSTRAINT "portfolio_calls_expert_id_fkey" FOREIGN KEY ("expert_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_expert_id_fkey" FOREIGN KEY ("expert_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_unlocks" ADD CONSTRAINT "post_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_unlocks" ADD CONSTRAINT "post_unlocks_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credibility_scores" ADD CONSTRAINT "credibility_scores_expert_id_fkey" FOREIGN KEY ("expert_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
