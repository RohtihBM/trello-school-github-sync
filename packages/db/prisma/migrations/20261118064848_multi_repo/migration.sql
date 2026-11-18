-- A repository a board can plan against.
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "cloneUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Repository_fullName_key" ON "Repository"("fullName");

-- Until now every board planned against this single repository, so existing
-- boards and every stored vector belong to it.
INSERT INTO "Repository" ("id", "fullName", "cloneUrl")
VALUES ('repo_trello_school', 'RohtihBM/trello-school-github-sync',
        'https://github.com/RohtihBM/trello-school-github-sync.git');

-- Boards: link to a repository.
ALTER TABLE "Board" ADD COLUMN "repositoryId" TEXT;
UPDATE "Board" SET "repositoryId" = 'repo_trello_school';
CREATE INDEX "Board_repositoryId_idx" ON "Board"("repositoryId");
ALTER TABLE "Board" ADD CONSTRAINT "Board_repositoryId_fkey"
    FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vectors: scoped per repository, so the key becomes (repository, hash).
ALTER TABLE "CodeChunkEmbedding" ADD COLUMN "repositoryId" TEXT;
UPDATE "CodeChunkEmbedding" SET "repositoryId" = 'repo_trello_school';
ALTER TABLE "CodeChunkEmbedding" ALTER COLUMN "repositoryId" SET NOT NULL;
ALTER TABLE "CodeChunkEmbedding" DROP CONSTRAINT "CodeChunkEmbedding_pkey";
ALTER TABLE "CodeChunkEmbedding" ADD CONSTRAINT "CodeChunkEmbedding_pkey" PRIMARY KEY ("repositoryId", "hash");
ALTER TABLE "CodeChunkEmbedding" ADD CONSTRAINT "CodeChunkEmbedding_repositoryId_fkey"
    FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
