-- Add TriviaQuestion table
CREATE TABLE "TriviaQuestion" (
  "id" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "optionsJson" JSONB NOT NULL,
  "correctIndex" INTEGER NOT NULL,
  "difficulty" TEXT NOT NULL,
  "tagsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TriviaQuestion_pkey" PRIMARY KEY ("id")
);

-- Suggested index if tagging searches become common (optional for now)
-- CREATE INDEX "TriviaQuestion_difficulty_idx" ON "TriviaQuestion"("difficulty");
