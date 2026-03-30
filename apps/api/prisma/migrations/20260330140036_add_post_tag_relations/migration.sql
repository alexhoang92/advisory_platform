-- CreateTable
CREATE TABLE "_PostUserMentions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_PostTickerTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_PostUserMentions_AB_unique" ON "_PostUserMentions"("A", "B");

-- CreateIndex
CREATE INDEX "_PostUserMentions_B_index" ON "_PostUserMentions"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_PostTickerTags_AB_unique" ON "_PostTickerTags"("A", "B");

-- CreateIndex
CREATE INDEX "_PostTickerTags_B_index" ON "_PostTickerTags"("B");

-- AddForeignKey
ALTER TABLE "_PostUserMentions" ADD CONSTRAINT "_PostUserMentions_A_fkey" FOREIGN KEY ("A") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PostUserMentions" ADD CONSTRAINT "_PostUserMentions_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PostTickerTags" ADD CONSTRAINT "_PostTickerTags_A_fkey" FOREIGN KEY ("A") REFERENCES "asset_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PostTickerTags" ADD CONSTRAINT "_PostTickerTags_B_fkey" FOREIGN KEY ("B") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
