import { AppContext } from '../../context';
import { Queryable, json, many, one } from '../../db/pool';
import { notFound, unprocessable } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { audit } from '../audit/service';
import { loadBomRows, unitPrice } from '../bom/rows';
import { Specs } from '../components/specs';
import { RuleRow, evaluateProject } from '../rules/service';

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

/** Dashboard: every project the user belongs to with summary metrics (US-13). */
export async function listProjects(q: Queryable, userId: string) {
  const projects = await many<ProjectRow & { role: string }>(
    q,
    `select p.*, m.role from projects p join project_members m on m.project_id = p.id
      where m.user_id = $1 order by p.updated_at desc, p.id`,
    [userId],
  );
  const out = [];
  for (const p of projects) {
    const [rows, errs] = await Promise.all([
      loadBomRows(q, p.id, ['active']),
      one<{ n: string | number }>(q, `select count(*) as n from evaluation_results where project_id = $1 and status = 'failed' and severity = 'error'`, [p.id]),
    ]);
    const cost = rows.reduce((s, r) => s + (unitPrice(r) ?? 0) * r.quantity, 0);
    out.push({
      ...p,
      metrics: { component_count: rows.length, estimated_cost: Math.round(cost * 100) / 100, error_count: Number(errs?.n ?? 0) },
    });
  }
  return out;
}

export async function getProject(q: Queryable, id: string, role: string) {
  const p = await one<ProjectRow>(q, 'select * from projects where id = $1', [id]);
  if (!p) throw notFound('Project', 'PROJECT_NOT_FOUND');
  const [rows, errs, members] = await Promise.all([
    loadBomRows(q, id, ['active']),
    one<{ n: string | number }>(q, `select count(*) as n from evaluation_results where project_id = $1 and status = 'failed' and severity = 'error'`, [id]),
    one<{ n: string | number }>(q, 'select count(*) as n from project_members where project_id = $1', [id]),
  ]);
  const cost = rows.reduce((s, r) => s + (unitPrice(r) ?? 0) * r.quantity, 0);
  return {
    ...p,
    role,
    metrics: { component_count: rows.length, estimated_cost: Math.round(cost * 100) / 100, error_count: Number(errs?.n ?? 0), member_count: Number(members?.n ?? 0) },
  };
}

interface TemplateItem {
  component_id: string;
  quantity: number;
  unit_price: number | null;
  supplier_url: string;
  designator: string;
  rail: string;
  notes: string;
  spec_overrides: Specs;
}

type TemplateRule = Pick<RuleRow, 'name' | 'description' | 'severity' | 'kind' | 'applies_a' | 'applies_b' | 'formula' | 'enabled'>;

export async function insertItems(q: Queryable, projectId: string, items: TemplateItem[]) {
  for (const i of items) {
    await q.query(
      `insert into bom_items (id, project_id, component_id, quantity, unit_price, supplier_url, designator, rail, notes, spec_overrides)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [newId(), projectId, i.component_id, i.quantity, i.unit_price, i.supplier_url, i.designator, i.rail, i.notes, json(i.spec_overrides ?? {})],
    );
  }
}

export async function createProject(
  ctx: AppContext,
  userId: string,
  input: { name: string; description?: string; template_id?: string },
) {
  return ctx.db.tx(async (q) => {
    let template: { items: TemplateItem[]; rules: TemplateRule[] } | undefined;
    if (input.template_id) {
      template = await one(q, 'select items, rules from project_templates where id = $1 and owner_id = $2', [input.template_id, userId]);
      if (!template) throw notFound('Template', 'TEMPLATE_NOT_FOUND');
    }
    const id = newId();
    await q.query('insert into projects (id, owner_id, name, description) values ($1,$2,$3,$4)', [id, userId, input.name, input.description ?? '']);
    await q.query(`insert into project_members (project_id, user_id, role) values ($1,$2,'admin')`, [id, userId]);
    if (template) {
      await insertItems(q, id, template.items);
      for (const r of template.rules) {
        await q.query(
          `insert into rules (id, project_id, name, description, severity, kind, applies_a, applies_b, formula, enabled, builtin, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11)`,
          [newId(), id, r.name, r.description, r.severity, r.kind, r.applies_a, r.applies_b, r.formula, r.enabled, userId],
        );
      }
      await evaluateProject(q, id);
    }
    await audit(q, { projectId: id, userId, action: 'project.create', entity: 'project', entityId: id, detail: { name: input.name, template_id: input.template_id ?? null } });
    return id;
  });
}

export async function updateProject(q: Queryable, id: string, userId: string, input: { name?: string; description?: string }) {
  const p = await one<ProjectRow>(q, 'select * from projects where id = $1', [id]);
  if (!p) throw notFound('Project', 'PROJECT_NOT_FOUND');
  await q.query('update projects set name = $2, description = $3, updated_at = now() where id = $1', [id, input.name ?? p.name, input.description ?? p.description]);
  await audit(q, { projectId: id, userId, action: 'project.update', entity: 'project', entityId: id, detail: input });
}

export async function deleteProject(q: Queryable, id: string) {
  await q.query('delete from projects where id = $1', [id]);
}

// ---------- templates (Project Template Management) ----------

export async function saveAsTemplate(q: Queryable, projectId: string, userId: string, input: { name: string; description?: string }) {
  const rows = await loadBomRows(q, projectId, ['active']);
  if (!rows.length) throw unprocessable('EMPTY_PROJECT', 'Add at least one component before saving a template');
  const items: TemplateItem[] = rows.map((r) => ({
    component_id: r.component_id, quantity: r.quantity, unit_price: r.unit_price, supplier_url: r.supplier_url,
    designator: r.designator, rail: r.rail, notes: r.notes, spec_overrides: r.spec_overrides,
  }));
  const custom = await many<RuleRow>(q, 'select * from rules where project_id = $1', [projectId]);
  const rules: TemplateRule[] = custom.map((r) => ({ name: r.name, description: r.description ?? '', severity: r.severity, kind: r.kind, applies_a: r.applies_a, applies_b: r.applies_b, formula: r.formula, enabled: r.enabled }));
  const id = newId();
  await q.query('insert into project_templates (id, owner_id, name, description, items, rules) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb)', [id, userId, input.name, input.description ?? '', json(items), json(rules)]);
  await audit(q, { projectId, userId, action: 'template.create', entity: 'template', entityId: id, detail: { name: input.name } });
  return id;
}

export const listTemplates = (q: Queryable, userId: string) =>
  many(q, 'select id, name, description, created_at, jsonb_array_length(items) as item_count from project_templates where owner_id = $1 order by created_at desc', [userId]);

export async function deleteTemplate(q: Queryable, userId: string, id: string) {
  const { rowCount } = await q.query('delete from project_templates where id = $1 and owner_id = $2', [id, userId]);
  if (!rowCount) throw notFound('Template', 'TEMPLATE_NOT_FOUND');
}
