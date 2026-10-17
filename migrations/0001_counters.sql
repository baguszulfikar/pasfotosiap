-- One row per (day, event, preset, detail); requests only increment `n`.
CREATE TABLE IF NOT EXISTS counters (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  preset TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, preset, detail)
);
