import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context';
import { parse } from '../../lib/validate';
import { projectAccess, userId } from '../../middleware/auth';
import {
  addItem,
  addItemBody,
  bulkBody,
  clearOverride,
  listItems,
  patchItemBody,
  removeItem,
  setOverride,
  updateItems,
} from './service';

export function bomRoutes(ctx: AppContext) {
  const r = Router();
  const { db } = ctx;
  const viewer = projectAccess(db, 'viewer');
  const editor = projectAccess(db, 'editor');

  // Component List (BOM): every line carries its own compatibility status (US-04).
  r.get('/projects/:id/components', viewer, async (req, res) => {
    const includeRemoved = req.query.include_removed === 'true';
    const items = await listItems(db, req.params.id as string, { includeRemoved });
    const active = items.filter((i) => i.status === 'active');
    res.json({
      items,
      totals: {
        component_count: active.length,
        total_quantity: active.reduce((s, i) => s + i.quantity, 0),
        estimated_cost: Math.round(active.reduce((s, i) => s + (i.line_total ?? 0), 0) * 100) / 100,
        unpriced_items: active.filter((i) => i.line_total === null).length,
        error_count: active.filter((i) => i.compatibility.status === 'error').length,
      },
    });
  });

  // Add a part by library id or by MPN (distributor lookup). 404 COMPONENT_NOT_FOUND suggests a custom part.
  r.post('/projects/:id/components', editor, async (req, res) => {
    const input = parse(addItemBody, req.body);
    const projectId = req.params.id as string;
    const { id, evaluation } = await addItem(ctx, userId(req), projectId, input);
    const item = (await listItems(db, projectId)).find((i) => i.id === id);
    res.status(201).json({ item, summary: evaluation.summary });
  });

  // Registered before /:itemId so "bulk" is not read as an id.
  r.patch('/projects/:id/components/bulk', editor, async (req, res) => {
    const { item_ids, patch } = parse(bulkBody, req.body);
    const evaluation = await updateItems(ctx, userId(req), req.params.id as string, item_ids, patch, 'bom.bulk_edit');
    res.json({ updated: item_ids.length, summary: evaluation.summary });
  });

  r.patch('/projects/:id/components/:itemId', editor, async (req, res) => {
    const patch = parse(patchItemBody, req.body);
    const projectId = req.params.id as string;
    const evaluation = await updateItems(ctx, userId(req), projectId, [req.params.itemId as string], patch, 'bom.edit');
    const item = (await listItems(db, projectId, { includeRemoved: true })).find((i) => i.id === req.params.itemId);
    res.json({ item, summary: evaluation.summary });
  });

  r.delete('/projects/:id/components/:itemId', editor, async (req, res) => {
    const evaluation = await removeItem(ctx, userId(req), req.params.id as string, req.params.itemId as string, req.query.hard === 'true');
    res.json({ summary: evaluation.summary });
  });

  // Unit parser manual override (US-06)
  r.put('/projects/:id/components/:itemId/specs/:key', editor, async (req, res) => {
    const { value, unit } = parse(z.object({ value: z.number().finite(), unit: z.string().max(10).nullable().optional() }), req.body);
    const projectId = req.params.id as string;
    const evaluation = await setOverride(ctx, userId(req), projectId, req.params.itemId as string, req.params.key as string, value, unit);
    const item = (await listItems(db, projectId)).find((i) => i.id === req.params.itemId);
    res.json({ item, summary: evaluation.summary });
  });

  r.delete('/projects/:id/components/:itemId/specs/:key', editor, async (req, res) => {
    const projectId = req.params.id as string;
    const evaluation = await clearOverride(ctx, userId(req), projectId, req.params.itemId as string, req.params.key as string);
    const item = (await listItems(db, projectId)).find((i) => i.id === req.params.itemId);
    res.json({ item, summary: evaluation.summary });
  });

  return r;
}
