-- v0.3 starting schema for Postgres / Supabase / Drizzle

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  name text not null,
  voice_profile_json jsonb not null default '{}'::jsonb,
  default_platforms text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  core text not null,
  direction text not null,
  tone text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table packs (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id),
  generation integer not null default 1,
  pack_json jsonb not null,
  llm_meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table drafts (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references packs(id),
  platform text not null,
  copy_json jsonb not null,
  asset_urls text[] not null default '{}',
  status text not null default 'prepared',
  draft_url text,
  trace_url text,
  created_at timestamptz not null default now()
);

create table publishes (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references drafts(id),
  post_url text,
  posted_at timestamptz,
  posted_by text not null check (posted_by in ('auto', 'human')),
  created_at timestamptz not null default now()
);

create table metrics (
  id uuid primary key default gen_random_uuid(),
  publish_id uuid not null references publishes(id),
  snapshot_at timestamptz not null default now(),
  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  saves integer not null default 0,
  raw_json jsonb not null default '{}'::jsonb
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  publish_id uuid not null references publishes(id),
  author text,
  text text not null,
  sentiment text,
  intent text,
  captured_at timestamptz not null default now()
);

create table source_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  source_url text,
  source_platform text not null default 'web',
  source_type text not null default 'agent_collected',
  title text,
  raw_text text,
  clean_markdown text,
  summary text,
  evidence_json jsonb not null default '{}'::jsonb,
  credibility_score integer not null default 0,
  relevance_score integer not null default 0,
  captured_at timestamptz not null default now()
);

create table research_briefs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  topic text not null,
  source_item_ids uuid[] not null default '{}',
  brief_json jsonb not null,
  risk_flags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table topic_candidates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  research_brief_id uuid references research_briefs(id),
  title text not null,
  angle text not null,
  target_platforms text[] not null default '{}',
  score_json jsonb not null default '{}'::jsonb,
  status text not null default 'candidate',
  created_at timestamptz not null default now()
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  run_type text not null,
  status text not null default 'pending',
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  cost_json jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table browser_tasks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  agent_run_id uuid references agent_runs(id),
  platform text,
  account_label text,
  mode text not null default 'draft',
  runbook_json jsonb not null,
  status text not null default 'pending',
  trace_url text,
  screenshot_urls text[] not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table brand_learnings (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  source_publish_id uuid references publishes(id),
  learning_json jsonb not null,
  created_at timestamptz not null default now()
);
