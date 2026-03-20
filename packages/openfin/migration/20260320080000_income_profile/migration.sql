CREATE TABLE IF NOT EXISTS income_profile (
  id       TEXT    PRIMARY KEY,
  amount   REAL    NOT NULL,
  currency TEXT    NOT NULL DEFAULT 'MXN',
  notes    TEXT,
  time_created INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  time_updated INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
