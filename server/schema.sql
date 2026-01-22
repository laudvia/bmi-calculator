-- Run this once in your Postgres database (or let docker-compose init do it).
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bmi_history (
  id         TEXT PRIMARY KEY, -- uuid as text
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at         TIMESTAMPTZ NOT NULL,
  weight_kg  NUMERIC(6,2) NOT NULL,
  height_cm  NUMERIC(6,2) NOT NULL,
  bmi        NUMERIC(6,2) NOT NULL,
  category   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bmi_history_user_at ON bmi_history(user_id, at DESC);
