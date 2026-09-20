DROP TABLE IF EXISTS "Url";

CREATE TABLE "Url" (
    "id"           INTEGER PRIMARY KEY AUTOINCREMENT,
    "original_url" TEXT NOT NULL,
    "short_code"   TEXT NOT NULL,
    "created_at"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Url_short_code_key" ON "Url"("short_code");

-- Example of a NEW composite index, if that's what you're changing
CREATE INDEX "Url_short_code_created_at_idx" ON "Url"("short_code", "created_at");