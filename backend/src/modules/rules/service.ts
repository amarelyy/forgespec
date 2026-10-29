import { Queryable, json, many, one } from '../../db/pool';
import { notFound, unprocessable } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { loadBomRows, toRuleItem } from '../bom/rows';
import { EvaluationResult, RuleDef, runRules, validateRuleDef } from './engine';
import { PREBUILT_RULES } from './prebuilt';

export interface RuleRow extends RuleDef {
  project_id: string | null;
  enabled: boolean;
  builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface EvaluationSummary {
  errors: number;
  warnings: number;
  passed: number;
  skipped: number;
}

export interface Evaluation {
  results: EvaluationResult[];
  summary: EvaluationSummary;
  /** Failed error-severity checks that were not failing at the previous evaluation. */
  newErrors: EvaluationResult[];
}

/** Keep the global rules table in sync with PREBUILT_RULES (code is the source of truth). */
export async function seedPrebuiltRules(q: Queryable) {
  for (const r of PREBUILT_RULES) {
    const exists = await one(q, 'select id from rules where id = $1', [r.id]);
    if (exists) {
      await q.query(
        'update rules set name=$2, description=$3, severity=$4, kind=$5, applies_a=$6, applies_b=$7, formula=$8, updated_at=now() where id=$1',
        [r.id, r.name, r.description ?? '', r.severity, r.kind, r.applies_a, r.applies_b, r.formula],
      );
    } else {
      await q.query(
        'insert into rules (id, project_id, name, description, severity, kind, applies_a, applies_b, formula, builtin) values ($1,null,$2,$3,$4,$5,$6,$7,$8,true)',
        [r.id, r.name, r.description ?? '', r.severity, r.kind, r.applies_a, r.applies_b, r.formula],
      );
    }
  }
}

export const listPrebuiltRules = (q: Queryable) =>
  many<RuleRow>(q, 'select * from rules where project_id is null order by id');

export const listCustomRules = (q: Queryable, projectId: string) =>
  many<RuleRow>(q, 'select * from rules where project_id = $1 order by created_at, id', [projectId]);

export const listEffectiveRules = (q: Queryable, projectId: string) =>
  many<RuleRow>(q, 'select * from rules where (project_id is null or project_id = $1) and enabled = true order by builtin desc, created_at, id', [projectId]);

export function summarize(results: EvaluationResult[]): EvaluationSummary {
  const s: EvaluationSummary = { errors: 0, warnings: 0, passed: 0, skipped: 0 };
  for (const r of results) {
    if (r.status === 'passed') s.passed++;
    else if (r.status === 'skipped') s.skipped++;
    else if (r.severity === 'error') s.errors++;
    else s.warnings++;
  }
  return s;
}

/**
 * Evaluate every active rule against the project's active BOM lines and replace the stored report.
 * Called synchronously inside each BOM mutation so the response already reflects the new state.
 */
export async function evaluateProject(q: Queryable, projectId: string): Promise<Evaluation> {
  const [rules, rows, previous] = await Promise.all([
    listEffectiveRules(q, projectId),
    loadBomRows(q, projectId, ['active']),
    many<{ fingerprint: string; status: string; severity: string }>(q, 'select fingerprint, status, severity from evaluation_results where project_id = $1', [projectId]),
  ]);
  const results = runRules(rows.map(toRuleItem), rules);

  const hadFailing = new Set(previous.filter((p) => p.status === 'failed' && p.severity === 'error').map((p) => p.fingerprint));
  const newErrors = results.filter((r) => r.status === 'failed' && r.severity === 'error' && !hadFailing.has(r.fingerprint));

  await q.query('delete from evaluation_results where project_id = $1', [projectId]);
  for (const r of results) {
    await q.query(
      `insert into evaluation_results (id, project_id, rule_id, rule_name, severity, status, item_ids, fingerprint, attributes, message)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10)`,
      [newId(), projectId, r.rule_id, r.rule_name, r.severity, r.status, json(r.item_ids), r.fingerprint, json(r.attributes), r.message],
    );
  }
  return { results, summary: summarize(results), newErrors };
}

export interface ReportEntry {
  rule_id: string;
  rule_name: string;
  severity: string;
  status: string;
  message: string;
  attributes: string[];
  items: { id: string; mpn: string; designator: string }[];
}

/** Compatibility Report: stored evaluation grouped by Error / Warning, plus passed and skipped rules. */
export async function getReport(q: Queryable, projectId: string) {
  const [stored, rows] = await Promise.all([
    many<any>(q, 'select * from evaluation_results where project_id = $1 order by created_at, id', [projectId]),
    loadBomRows(q, projectId),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const entries: ReportEntry[] = stored.map((s) => ({
    rule_id: s.rule_id,
    rule_name: s.rule_name,
    severity: s.severity,
    status: s.status,
    message: s.message,
    attributes: s.attributes ?? [],
    items: (s.item_ids ?? []).filter((id: string) => byId.has(id)).map((id: string) => ({ id, mpn: byId.get(id)!.mpn, designator: byId.get(id)!.designator })),
  }));
  const failed = entries.filter((e) => e.status === 'failed');
  const results = stored.map((s) => ({ rule_id: s.rule_id, rule_name: s.rule_name, severity: s.severity, status: s.status, item_ids: s.item_ids, attributes: s.attributes, message: s.message, fingerprint: s.fingerprint })) as EvaluationResult[];
  return {
    summary: summarize(results),
    errors: failed.filter((e) => e.severity === 'error'),
    warnings: failed.filter((e) => e.severity === 'warning'),
    passed: entries.filter((e) => e.status === 'passed'),
    skipped: entries.filter((e) => e.status === 'skipped'),
    evaluated_at: stored[0]?.created_at ?? null,
  };
}

export interface RuleInput {
  name: string;
  description?: string;
  severity: 'error' | 'warning';
  kind: 'single' | 'pair' | 'aggregate';
  applies_a?: string;
  applies_b?: string;
  formula: string;
  enabled?: boolean;
}

function assertValid(input: Pick<RuleInput, 'kind' | 'applies_a' | 'applies_b' | 'formula'>) {
  const errors = validateRuleDef({ kind: input.kind, applies_a: input.applies_a ?? '', applies_b: input.applies_b ?? '', formula: input.formula });
  if (errors.length) throw unprocessable('INVALID_FORMULA', errors[0], errors);
}

export const checkRule = (input: RuleInput) => validateRuleDef({ kind: input.kind, applies_a: input.applies_a ?? '', applies_b: input.applies_b ?? '', formula: input.formula });

export async function createCustomRule(q: Queryable, projectId: string, userId: string, input: RuleInput) {
  assertValid(input);
  const rows = await many<RuleRow>(
    q,
    `insert into rules (id, project_id, name, description, severity, kind, applies_a, applies_b, formula, enabled, builtin, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11) returning *`,
    [newId(), projectId, input.name, input.description ?? '', input.severity, input.kind, input.applies_a ?? '', input.applies_b ?? '', input.formula, input.enabled ?? true, userId],
  );
  return rows[0];
}

export async function updateCustomRule(q: Queryable, projectId: string, ruleId: string, input: Partial<RuleInput>) {
  const current = await one<RuleRow>(q, 'select * from rules where id = $1 and project_id = $2', [ruleId, projectId]);
  if (!current) throw notFound('Custom rule', 'RULE_NOT_FOUND');
  const merged = { ...current, ...input };
  assertValid(merged);
  const rows = await many<RuleRow>(
    q,
    `update rules set name=$3, description=$4, severity=$5, kind=$6, applies_a=$7, applies_b=$8, formula=$9, enabled=$10, updated_at=now()
      where id=$1 and project_id=$2 returning *`,
    [ruleId, projectId, merged.name, merged.description ?? '', merged.severity, merged.kind, merged.applies_a ?? '', merged.applies_b ?? '', merged.formula, merged.enabled],
  );
  return rows[0];
}

export async function deleteCustomRule(q: Queryable, projectId: string, ruleId: string) {
  const { rowCount } = await q.query('delete from rules where id = $1 and project_id = $2', [ruleId, projectId]);
  if (!rowCount) throw notFound('Custom rule', 'RULE_NOT_FOUND');
}
