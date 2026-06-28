-- SQLite Schema for Agent Studio Content OS

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Insert default workspace
INSERT OR IGNORE INTO workspaces (id, name, created_at) VALUES ('default', 'Default Workspace', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS codex_tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'default',
    type TEXT,
    platform TEXT,
    mode TEXT,
    status TEXT,
    engagement BOOLEAN,
    runbook_json TEXT,
    result_json TEXT,
    screenshots TEXT,
    trace TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'default',
    run_type TEXT,
    status TEXT,
    input_json TEXT,
    output_json TEXT,
    failure_reason TEXT,
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS traces (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'default',
    type TEXT,
    task_id TEXT,
    run_id TEXT,
    summary TEXT,
    detail TEXT,
    created_at TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS engagement_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'default',
    task_id TEXT,
    status TEXT,
    reason TEXT,
    platform TEXT,
    account_label TEXT,
    summary TEXT,
    items_count INTEGER,
    replied_count INTEGER,
    high_risk_count INTEGER,
    screenshots TEXT,
    failure_reason TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS engagement_items (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'default',
    task_id TEXT,
    platform TEXT,
    channel TEXT,
    author TEXT,
    text TEXT,
    source_url TEXT,
    post_title TEXT,
    received_at TEXT,
    risk TEXT,
    intent TEXT,
    sentiment TEXT,
    reply_draft TEXT,
    replied BOOLEAN,
    reply_text TEXT,
    requires_human BOOLEAN,
    last_seen_at TEXT,
    updated_at TEXT,
    created_at TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS autopilot_topics (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'default',
    title TEXT,
    source TEXT,
    status TEXT,
    core TEXT,
    completed_at TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS autopilot_daily_plans (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'default',
    date TEXT,
    status TEXT,
    plan_json TEXT,
    run_id TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS series_profiles (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'default',
    title TEXT,
    description TEXT,
    platform TEXT,
    format TEXT,
    schedule TEXT,
    prompt TEXT,
    is_active BOOLEAN,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS settings (
    workspace_id TEXT NOT NULL DEFAULT 'default',
    key TEXT NOT NULL,
    value_json TEXT,
    updated_at TEXT,
    PRIMARY KEY (workspace_id, key)
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL DEFAULT 'default',
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT NOT NULL,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS credit_accounts (
    workspace_id TEXT PRIMARY KEY,
    plan TEXT NOT NULL DEFAULT 'free',
    balance INTEGER NOT NULL DEFAULT 1000,
    included_monthly_credits INTEGER NOT NULL DEFAULT 1000,
    purchased_credits INTEGER NOT NULL DEFAULT 0,
    reserved_credits INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS credit_ledger (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL DEFAULT 'default',
    user_id TEXT NOT NULL DEFAULT 'local-user',
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT,
    job_id TEXT,
    usage_event_id TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS usage_events (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL DEFAULT 'default',
    user_id TEXT NOT NULL DEFAULT 'local-user',
    job_id TEXT,
    provider TEXT,
    model TEXT,
    modality TEXT,
    task TEXT,
    input_units INTEGER DEFAULT 0,
    output_units INTEGER DEFAULT 0,
    credits_estimated INTEGER DEFAULT 0,
    credits_charged INTEGER DEFAULT 0,
    provider_cost_json TEXT,
    status TEXT,
    error_message TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS factory_jobs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL DEFAULT 'default',
    user_id TEXT NOT NULL DEFAULT 'local-user',
    asset_type TEXT,
    platform TEXT,
    intent TEXT,
    prompt TEXT,
    style TEXT,
    model_preset TEXT,
    status TEXT,
    input_json TEXT,
    output_json TEXT,
    credits_estimated INTEGER DEFAULT 0,
    credits_charged INTEGER DEFAULT 0,
    failure_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

INSERT OR IGNORE INTO credit_accounts (workspace_id, plan, balance, included_monthly_credits, purchased_credits, reserved_credits, updated_at)
VALUES ('default', 'free', 1000, 1000, 0, 0, CURRENT_TIMESTAMP);
