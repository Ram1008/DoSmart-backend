CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Title should not be just whitespace या empty string
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),

  description TEXT,

  -- Start timestamp (जब से टास्क का टाइमलाइन शुरू होता है)
  start_time TIMESTAMPTZ,

  -- Deadline timestamp हमेशा start_time के बाद या उसके बराबर होनी चाहिए
  deadline TIMESTAMPTZ NOT NULL,

  -- Status ENUM type; default 'Upcoming Task' (लेकिन परेशा ना हो, CHECK यहाँ enum खुद संभालेगा)
  status task_status NOT NULL DEFAULT 'Upcoming Task',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);