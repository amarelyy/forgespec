import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context';
import { audit } from '../audit/service';
import { projectAccess, requireAuth, userId } from '../../middleware/auth';
import { parse } from '../../lib/validate';
import { ATTRIBUTES } from '../components/attributes';
import { notifyAfterEvaluation } from '../bom/service';
import {
  checkRule,
  createCustomRule,
  deleteCustomRule,
  evaluateProject,
  getReport,
  listCustomRules,
  listPrebuiltRules,
  updateCustomRule,
} from './service';

const ruleBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  severity: z.enum(['error', 'warning']),
  kind: z.enum(['single', 'pair', 'aggregate']),
  applies_a: z.string().max(500).optional(),
  applies_b: z.string().max(500).optional(),
  formula: z.string().min(1).max(500),
  enabled: z.boolean().optional(),
});

export function rulesRoutes(ctx: AppContext) {
  const r = Router();
  const { db } = ctx;
  const viewer = projectAccess(db, 'viewer');
  const editor = projectAccess(db, 'editor');

  // ---- global (Rule Engine > Pre-built Rules, Custom Rule Builder helpers) ----
  r.get('/rules/prebuilt', requireAuth, async (_req, res) => {
    res.json({ rules: await listPrebuiltRules(db) });
  });

  r.get('/rules/attributes', requireAuth, (_req, res) => {
    res.json({
      attributes: ATTRIBUTES,
      kinds: [
        { kind: 'single', description: 'Checks one component on its own (uses a.*)' },
        { kind: 'pair', description: 'Checks every matching pair of components (a.* vs b.*)' },
        { kind: 'aggregate', description: 'Checks one component against a total over many (sum(b.*), count(), maxof(), minof())' },
      ],
      functions: ['abs(x)', 'min(x, y, ...)', 'max(x, y, ...)', 'between(x, lo, hi)', 'sum(expr)', 'count([cond])', 'maxof(expr)', 'minof(expr)'],
      operators: ['+', '-', '*', '/', '<', '<=', '>', '>=', '==', '!=', 'and', 'or', 'not'],
    });
  });

  // ---- per project ----
  r.get('/projects/:id/rules', viewer, async (req, res) => {
    const [prebuilt, custom] = await Promise.all([listPrebuiltRules(db), listCustomRules(db, req.params.id as string)]);
    res.json({ prebuilt, custom });
  });

  r.post('/projects/:id/rules/custom/validate', editor, (req, res) => {
    const errors = checkRule(parse(ruleBody, req.body));
    res.json({ valid: errors.length === 0, errors });
  });

  r.post('/projects/:id/rules/custom', editor, async (req, res) => {
    const input = parse(ruleBody, req.body);
    const projectId = req.params.id as string;
    // US-05: a saved rule is applied to the existing BOM immediately.
    const out = await db.tx(async (q) => {
      const rule = await createCustomRule(q, projectId, userId(req), input);
      await audit(q, { projectId, userId: userId(req), action: 'rule.create', entity: 'rule', entityId: rule.id, detail: { name: rule.name } });
      const evaluation = await evaluateProject(q, projectId);
      return { rule, evaluation };
    });
    await notifyAfterEvaluation(ctx, projectId, userId(req), out.evaluation, `Custom rule "${out.rule.name}" added`);
    res.status(201).json({ rule: out.rule, summary: out.evaluation.summary, report: await getReport(db, projectId) });
  });

  r.get('/projects/:id/rules/custom', viewer, async (req, res) => {
    res.json({ rules: await listCustomRules(db, req.params.id as string) });
  });

  r.put('/projects/:id/rules/custom/:ruleId', editor, async (req, res) => {
    const input = parse(ruleBody.partial(), req.body);
    const projectId = req.params.id as string;
    const out = await db.tx(async (q) => {
      const rule = await updateCustomRule(q, projectId, req.params.ruleId as string, input);
      await audit(q, { projectId, userId: userId(req), action: 'rule.update', entity: 'rule', entityId: rule.id, detail: { name: rule.name } });
      return { rule, evaluation: await evaluateProject(q, projectId) };
    });
    await notifyAfterEvaluation(ctx, projectId, userId(req), out.evaluation, `Custom rule "${out.rule.name}" updated`);
    res.json({ rule: out.rule, summary: out.evaluation.summary });
  });

  r.delete('/projects/:id/rules/custom/:ruleId', editor, async (req, res) => {
    const projectId = req.params.id as string;
    const evaluation = await db.tx(async (q) => {
      await deleteCustomRule(q, projectId, req.params.ruleId as string);
      await audit(q, { projectId, userId: userId(req), action: 'rule.delete', entity: 'rule', entityId: req.params.ruleId as string });
      return evaluateProject(q, projectId);
    });
    res.json({ summary: evaluation.summary });
  });

  // ---- evaluation & report ----
  r.post('/projects/:id/compatibility/evaluate', editor, async (req, res) => {
    const projectId = req.params.id as string;
    const evaluation = await db.tx((q) => evaluateProject(q, projectId));
    await notifyAfterEvaluation(ctx, projectId, userId(req), evaluation, 'Compatibility re-checked', false);
    res.json({ summary: evaluation.summary, report: await getReport(db, projectId) });
  });

  r.get('/projects/:id/compatibility/report', viewer, async (req, res) => {
    res.json(await getReport(db, req.params.id as string));
  });

  return r;
}
