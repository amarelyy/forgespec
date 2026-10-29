/** DTOs returned by the ForgeSpec API. Mirrors backend/src; keep in sync when the API changes. */

export type Role = 'viewer' | 'editor' | 'admin';
export type Severity = 'error' | 'warning';
export type BomStatus = 'active' | 'deprecated' | 'removed';
export type RuleKind = 'single' | 'pair' | 'aggregate';

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  user: User;
}

// ---------- component library ----------

export interface SpecValue {
  raw: string;
  value: number | null;
  unit: string | null;
  /** ok | ambiguous | failed come from the parser, manual from a user override/entry */
  status: 'ok' | 'ambiguous' | 'failed' | 'manual';
  note?: string;
}
export type BomSpecValue = SpecValue & { overridden: boolean };

export interface SupplyRisk {
  level: 'none' | 'warning' | 'high';
  reasons: string[];
}

export interface Component {
  id: string;
  source: 'api' | 'custom';
  owner_id: string | null;
  mpn: string;
  manufacturer: string;
  name: string;
  category: string;
  description: string;
  package_type: string;
  datasheet_url: string;
  lifecycle_status: string;
  stock: number | null;
  price: number | null;
  specs: Record<string, SpecValue>;
  supply_risk: SupplyRisk;
  created_at: string;
  updated_at: string;
}

export interface SearchParams {
  q?: string;
  category?: string;
  manufacturer?: string;
  /** e.g. "voltage_max:gte:5" (ops: gte, lte, eq) */
  spec?: string | string[];
  source?: 'api' | 'custom';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  results: Component[];
  total: number;
  provider: string;
  warnings: string[];
  /** Present when nothing matched: offer the Custom Part Creator (US-03). */
  not_found?: boolean;
  message?: string;
  suggestion?: 'create_custom_part';
}

export interface CustomPartInput {
  name: string;
  mpn?: string;
  manufacturer?: string;
  category?: string;
  description?: string;
  package_type?: string;
  datasheet_url?: string;
  lifecycle_status?: string;
  stock?: number | null;
  price?: number | null;
  /** number (canonical unit) or string such as "3.3V" / "100mA" */
  specs?: Record<string, number | string>;
}

export interface ParsedQuantity {
  raw: string;
  value: number | null;
  unit: string | null;
  dimension: string | null;
  status: 'ok' | 'ambiguous' | 'failed';
  note?: string;
}

export interface AttributeDef {
  key: string;
  label: string;
  type: 'number' | 'string';
  dimension?: string;
  unit?: string;
  group: 'electrical' | 'physical' | 'general' | 'item';
  description: string;
}

// ---------- projects & BOM ----------

export interface ProjectMetrics {
  component_count: number;
  estimated_cost: number;
  error_count: number;
  member_count?: number;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  role: Role;
  metrics: ProjectMetrics;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  created_at: string;
  item_count: number;
}

export interface ItemIssue {
  rule_id: string;
  rule_name: string;
  severity: Severity;
  message: string;
  /** attribute keys to highlight on the row (US-09) */
  attributes: string[];
  item_ids: string[];
}

export interface BomItem {
  id: string;
  project_id: string;
  component_id: string;
  quantity: number;
  unit_price: number | null;
  unit_price_override: number | null;
  line_total: number | null;
  supplier_url: string;
  designator: string;
  rail: string;
  notes: string;
  status: BomStatus;
  created_at: string;
  updated_at: string;
  component: Pick<Component, 'id' | 'mpn' | 'manufacturer' | 'name' | 'category' | 'package_type' | 'datasheet_url' | 'lifecycle_status' | 'stock' | 'source' | 'supply_risk'>;
  specs: Record<string, BomSpecValue>;
  compatibility: { status: 'ok' | 'warning' | 'error'; issues: ItemIssue[] };
}

export interface BomTotals {
  component_count: number;
  total_quantity: number;
  estimated_cost: number;
  unpriced_items: number;
  error_count: number;
}

export interface AddItemInput {
  /** provide exactly one of component_id or mpn */
  component_id?: string;
  mpn?: string;
  quantity?: number;
  unit_price?: number | null;
  supplier_url?: string;
  designator?: string;
  rail?: string;
  notes?: string;
}

export interface ItemPatch {
  quantity?: number;
  unit_price?: number | null;
  supplier_url?: string;
  designator?: string;
  rail?: string;
  notes?: string;
  status?: BomStatus;
}

export type BulkPatch = Omit<ItemPatch, 'designator'>;

// ---------- rules & compatibility ----------

export interface EvaluationSummary {
  errors: number;
  warnings: number;
  passed: number;
  skipped: number;
}

export interface ReportEntry {
  rule_id: string;
  rule_name: string;
  severity: Severity;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  attributes: string[];
  items: { id: string; mpn: string; designator: string }[];
}

export interface CompatibilityReport {
  summary: EvaluationSummary;
  errors: ReportEntry[];
  warnings: ReportEntry[];
  passed: ReportEntry[];
  skipped: ReportEntry[];
  evaluated_at: string | null;
}

export interface Rule {
  id: string;
  project_id: string | null;
  name: string;
  description: string;
  severity: Severity;
  kind: RuleKind;
  applies_a: string;
  applies_b: string;
  formula: string;
  enabled: boolean;
  builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface RuleInput {
  name: string;
  description?: string;
  severity: Severity;
  kind: RuleKind;
  applies_a?: string;
  applies_b?: string;
  formula: string;
  enabled?: boolean;
}

export interface RuleBuilderMeta {
  attributes: AttributeDef[];
  kinds: { kind: RuleKind; description: string }[];
  functions: string[];
  operators: string[];
}

// ---------- versions ----------

export interface VersionSummary {
  id: string;
  number: number;
  summary: string;
  created_at: string;
  author_id: string;
  author_name: string;
  item_count: number;
}

export interface SnapshotItem {
  item_id: string;
  component_id: string;
  mpn: string;
  name: string;
  manufacturer: string;
  category: string;
  quantity: number;
  unit_price: number | null;
  designator: string;
  rail: string;
  status: string;
  specs: Record<string, number>;
}

export interface FieldChange {
  field: string;
  previous: unknown;
  current: unknown;
}

export interface VersionDiff {
  from: { label: string; version: Omit<VersionSummary, 'id' | 'author_id' | 'item_count'> & { id: string } | null };
  to: { label: string; version: Omit<VersionSummary, 'id' | 'author_id' | 'item_count'> & { id: string } | null };
  summary: string;
  added: SnapshotItem[];
  removed: SnapshotItem[];
  modified: { item_id: string; mpn: string; name: string; changes: FieldChange[]; previous: SnapshotItem; current: SnapshotItem }[];
  unchanged: number;
}

// ---------- team, notifications, misc ----------

export interface Member {
  user_id: string;
  name: string;
  email: string;
  role: Role;
  created_at?: string;
}

export interface Notification {
  id: string;
  project_id: string | null;
  type: 'bom_updated' | 'critical_error' | 'member_invited' | 'role_changed' | 'backup_restored';
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export interface ExportInfo {
  id: string;
  filename: string;
  format: 'csv' | 'pdf';
  expires_at: string;
  item_count: number;
  download_url: string;
}

export interface ExportOptions {
  format: 'csv' | 'pdf';
  include_deprecated?: boolean;
  include_removed?: boolean;
}

export interface Backup {
  id: string;
  size_bytes: number;
  created_at: string;
  created_by_name?: string;
  item_count?: number;
}

export interface SubAssembly {
  id: string;
  name: string;
  description: string;
  created_at: string;
  source_project_id: string | null;
  item_count: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
}
