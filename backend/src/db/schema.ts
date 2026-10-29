/**
 * PostgreSQL schema (Data Layer of the component diagram).
 * Ids are app-generated UUID strings. Spec values live in jsonb because
 * component attributes are open-ended (custom parts, distributor extras).
 */
export const SCHEMA_SQL = `
create table if not exists users (
  id text primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists refresh_tokens (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id text primary key,
  owner_id text not null references users(id),
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_members (
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists components (
  id text primary key,
  source text not null,
  owner_id text references users(id),
  mpn text not null,
  manufacturer text not null default '',
  name text not null,
  category text not null default 'other',
  description text not null default '',
  package_type text not null default '',
  datasheet_url text not null default '',
  lifecycle_status text not null default 'unknown',
  stock integer,
  price double precision,
  specs jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists components_mpn_idx on components (mpn);

create table if not exists bom_items (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  component_id text not null references components(id),
  quantity integer not null default 1,
  unit_price double precision,
  supplier_url text not null default '',
  designator text not null default '',
  rail text not null default '',
  notes text not null default '',
  status text not null default 'active',
  spec_overrides jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bom_items_project_idx on bom_items (project_id);

create table if not exists versions (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  number integer not null,
  author_id text not null references users(id),
  summary text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (project_id, number)
);

create table if not exists rules (
  id text primary key,
  project_id text references projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  severity text not null,
  kind text not null,
  applies_a text not null default '',
  applies_b text not null default '',
  formula text not null,
  enabled boolean not null default true,
  builtin boolean not null default false,
  created_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists evaluation_results (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  rule_id text not null,
  rule_name text not null,
  severity text not null,
  status text not null,
  item_ids jsonb not null default '[]',
  fingerprint text not null default '',
  attributes jsonb not null default '[]',
  message text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists evaluation_results_project_idx on evaluation_results (project_id);

create table if not exists sub_assemblies (
  id text primary key,
  owner_id text not null references users(id) on delete cascade,
  name text not null,
  description text not null default '',
  items jsonb not null,
  source_project_id text,
  created_at timestamptz not null default now()
);

create table if not exists project_templates (
  id text primary key,
  owner_id text not null references users(id) on delete cascade,
  name text not null,
  description text not null default '',
  items jsonb not null,
  rules jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  project_id text,
  type text not null,
  title text not null,
  body text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id);

create table if not exists audit_log (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  user_id text references users(id),
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_log_project_idx on audit_log (project_id);

create table if not exists backups (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  created_by text not null references users(id),
  storage_key text not null,
  size_bytes integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists exports (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  created_by text not null references users(id),
  format text not null,
  filename text not null,
  storage_key text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
`;
