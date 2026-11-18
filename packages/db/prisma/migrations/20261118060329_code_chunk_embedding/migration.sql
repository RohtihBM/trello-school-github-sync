-- pgvector adds the "vector" column type and the <=> distance operator.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "CodeChunkEmbedding" (
    "hash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "embedding" vector(384) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeChunkEmbedding_pkey" PRIMARY KEY ("hash")
);

-- CreateIndex
CREATE INDEX "CodeChunkEmbedding_model_idx" ON "CodeChunkEmbedding"("model");
