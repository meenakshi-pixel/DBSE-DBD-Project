-- Smart Expense Splitter: relational schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS expense_groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  budget      NUMERIC(12,2) NOT NULL CHECK (budget > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS members (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id  TEXT NOT NULL REFERENCES expense_groups(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  UNIQUE (group_id, name)
);

CREATE TABLE IF NOT EXISTS expenses (
  id            TEXT PRIMARY KEY,
  group_id      TEXT NOT NULL REFERENCES expense_groups(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category      TEXT NOT NULL CHECK (category IN ('Food','Stay','Travel','Fun','Shopping','Other')),
  paid_by       INTEGER NOT NULL REFERENCES members(id),
  expense_date  DATE NOT NULL,
  split_type    TEXT NOT NULL CHECK (split_type IN ('equal','percent','exact')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Who the expense is split between. value = 1 for equal splits,
-- the percentage for 'percent', the rupee amount for 'exact'.
CREATE TABLE IF NOT EXISTS expense_splits (
  expense_id  TEXT    NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  value       NUMERIC(12,2) NOT NULL,
  PRIMARY KEY (expense_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_group_date ON expenses (group_id, expense_date);
