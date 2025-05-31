CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),

  description TEXT,

  start_time TIMESTAMPTZ,

  deadline TIMESTAMPTZ NOT NULL,
  CONSTRAINT deadline_after_start_time CHECK (
    start_time IS NULL OR deadline > start_time
  ),

  status task_status NOT NULL DEFAULT 'Upcoming Task',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);