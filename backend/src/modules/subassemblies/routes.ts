import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context';
import { json, many, one } from '../../db/pool';
import { notFound, unprocessable } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { parse } from '../../lib/validate';
import { projectAccess, requireAuth, userId } from '../../middleware/auth';
import { audit } from '../audit/service';
import { loadBomRows, toRuleItem } from '../bom/rows';
import { notifyAfterEvaluation } from '../bom/service';
import { insertItems } from '../projects/service';
import { runRules } from '../rules/engine';
import { evaluateProject, getReport, listEffectiveRules, summarize } from '../rules/service';

/** Cross-Project Component Reusability (US-12). Sub-assemblies are private to their creator. */
export function subAssemblyRoutes(ctx: AppContext) {
  const r = Router();
  const { db } = ctx;
  const editor = projectAccess(db, 'editor');

  r.get('/sub-assemblies', requireAuth, async (req, res) => {
    res.json({
      sub_assemblies: await many(db, 'select id, name, description, created_at, source_project_id, jsonb_array_length(items) as item_count from sub_assemblies where owner_id = $1 order by created_at desc', [userId(req)]),
    });
  });

  r.get('/sub-assemblies/:sid', requireAuth, async (req, res) => {
    const s = await one(db, 'select * from sub_assemblies where id = $1 and owner_id = $2', [req.params.sid as string, userId(req)]);
    if (!s) throw notFound('Sub-assembly', 'SUBASSEMBLY_NOT_FOUND');
    res.json({ sub_assembly: s });
  });

  r.delete('/sub-assemblies/:sid', requireAuth, async (req, res) => {
    const { rowCount } = await db.query('delete from sub_assemblies where id = $1 and owner_id = $2', [req.params.sid as string, userId(req)]);
    if (!rowCount) throw notFound('Sub-assembly', 'SUBASSEMBLY_NOT_FOUND');
    res.status(204).end();
  });

  // Save selected BOM lines. Only a *validated* group is accepted: no error-level failures within the selection.
  r.post('/projects/:id/sub-assemblies', editor, async (req, res) => {
    const { name, description, item_ids } = parse(
      z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(500).optional(), item_ids: z.array(z.string()).min(1).max(500) }),
      req.body,
    );
    const projectId = req.params.id as string;
    const rows = (await loadBomRows(db, projectId, ['active'])).filter((x) => item_ids.includes(x.id));
    if (rows.length !== new Set(item_ids).size) throw notFound('One or more active BOM items', 'ITEM_NOT_FOUND');

    const results = runRules(rows.map(toRuleItem), await listEffectiveRules(db, projectId));
    const failures = results.filter((x) => x.status === 'failed' && x.severity === 'error');
    if (failures.length) {
      throw unprocessable('SUBASSEMBLY_INVALID', 'The selection has compatibility errors and cannot be saved as a validated sub-assembly', { summary: summarize(results), errors: failures.map((f) => f.message) });
    }

    const items = rows.map((x) => ({ component_id: x.component_id, quantity: x.quantity, unit_price: x.unit_price, supplier_url: x.supplier_url, designator: x.designator, rail: x.rail, notes: x.notes, spec_overrides: x.spec_overrides }));
    const id = newId();
    await db.tx(async (q) => {
      await q.query('insert into sub_assemblies (id, owner_id, name, description, items, source_project_id) values ($1,$2,$3,$4,$5::jsonb,$6)', [id, userId(req), name, description ?? '', json(items), projectId]);
      await audit(q, { projectId, userId: userId(req), action: 'subassembly.create', entity: 'sub_assembly', entityId: id, detail: { name, items: items.length } });
    });
    res.status(201).json({ sub_assembly_id: id, item_count: items.length });
  });

  // Import into another project; it is evaluated against that project's existing parts.
  r.post('/projects/:id/sub-assemblies/:sid/import', editor, async (req, res) => {
    const projectId = req.params.id as string;
    const sub = await one<{ name: string; items: any[] }>(db, 'select name, items from sub_assemblies where id = $1 and owner_id = $2', [req.params.sid as string, userId(req)]);
    if (!sub) throw notFound('Sub-assembly', 'SUBASSEMBLY_NOT_FOUND');
    const evaluation = await db.tx(async (q) => {
      await insertItems(q, projectId, sub.items);
      await audit(q, { projectId, userId: userId(req), action: 'subassembly.import', entity: 'sub_assembly', entityId: req.params.sid as string, detail: { name: sub.name, items: sub.items.length } });
      return evaluateProject(q, projectId);
    });
    await notifyAfterEvaluation(ctx, projectId, userId(req), evaluation, `Imported sub-assembly "${sub.name}"`);
    res.status(201).json({ imported: sub.items.length, summary: evaluation.summary, report: await getReport(db, projectId) });
  });

  return r;
}
