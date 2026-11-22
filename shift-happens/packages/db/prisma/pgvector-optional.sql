-- Optional pgvector upgrade for the knowledge-base RAG store.
-- The application works without this: it stores deterministic 128-dim
-- embeddings as JSON and scores them with cosine similarity in-process.
--
-- Apply after `prisma db push` on a Postgres instance that has pgvector:
--   psql "$DATABASE_URL" -f packages/db/prisma/pgvector-optional.sql
--
-- Then set GEMINI_EMBED_MODEL / point your embedding job at the new column.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);

-- Keep the JSON fallback column intact; backfill this column from an embedding
-- provider when one is configured:
--   UPDATE knowledge_base SET embedding_vector = :embedding WHERE id = :id;

CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
  ON knowledge_base USING ivfflat (embedding_vector vector_cosine_ops)
  WITH (lists = 100);
