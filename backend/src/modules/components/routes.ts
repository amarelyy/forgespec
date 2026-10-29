import { Router } from 'express';
import { z } from 'zod';
import { AppContext } from '../../context';
import { parse } from '../../lib/validate';
import { requireAuth, userId } from '../../middleware/auth';
import { reevaluateProjectsUsing } from '../bom/service';
import { ATTRIBUTE_MAP } from './attributes';
import {
  componentDto,
  createCustomPart,
  customPartBody,
  deleteCustomPart,
  getVisibleComponent,
  searchLibrary,
  searchQuery,
  setCustomSpec,
  updateCustomPart,
} from './service';
import { parseDimensions, parseQuantity, parseRange } from './units';

export function componentRoutes(ctx: AppContext) {
  const r = Router();
  const { db } = ctx;

  // ---- public (guest browse-only, US-01) ----
  r.get('/components/search', async (req, res) => {
    const params = parse(searchQuery, req.query);
    res.json(await searchLibrary(ctx, req.user?.id, params));
  });

  /** Unit parser preview so the UI can show raw -> numeric before saving. */
  r.post('/components/parse', (req, res) => {
    const { raw, attribute, mode } = parse(
      z.object({ raw: z.string().min(1).max(100), attribute: z.string().optional(), mode: z.enum(['quantity', 'range', 'dimensions']).default('quantity') }),
      req.body,
    );
    const dimension = attribute ? ATTRIBUTE_MAP.get(attribute)?.dimension : undefined;
    res.json(mode === 'range' ? parseRange(raw, dimension) : mode === 'dimensions' ? { raw, ...parseDimensions(raw) } : parseQuantity(raw, dimension));
  });

  r.get('/components/:cid', async (req, res) => {
    res.json({ component: componentDto(await getVisibleComponent(db, req.params.cid as string, req.user?.id)) });
  });

  // ---- logged-in: Custom Part Creator ----
  r.post('/components', requireAuth, async (req, res) => {
    const input = parse(customPartBody, req.body);
    res.status(201).json({ component: componentDto(await createCustomPart(db, userId(req), input)) });
  });

  r.put('/components/:cid', requireAuth, async (req, res) => {
    const input = parse(customPartBody.partial(), req.body);
    const component = await updateCustomPart(db, req.params.cid as string, userId(req), input);
    await reevaluateProjectsUsing(ctx, component.id);
    res.json({ component: componentDto(component) });
  });

  r.put('/components/:cid/specs/:key', requireAuth, async (req, res) => {
    const { value, unit } = parse(z.object({ value: z.number().finite(), unit: z.string().max(10).nullable().optional() }), req.body);
    const component = await setCustomSpec(db, req.params.cid as string, userId(req), req.params.key as string, value, unit);
    await reevaluateProjectsUsing(ctx, component.id);
    res.json({ component: componentDto(component) });
  });

  r.delete('/components/:cid', requireAuth, async (req, res) => {
    await deleteCustomPart(db, req.params.cid as string, userId(req));
    res.status(204).end();
  });

  return r;
}
