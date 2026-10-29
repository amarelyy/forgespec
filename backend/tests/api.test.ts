import { describe, expect, it } from 'vitest';
import { testApp } from './helpers';

describe('ForgeSpec API: user stories end to end', () => {
  it('US-01/02: guests browse the library but cannot touch projects; login/refresh work', async () => {
    const { api, signup, as } = await testApp();

    const search = await api.get('/api/v1/components/search?q=esp32');
    expect(search.status).toBe(200);
    expect(search.body.results[0]).toMatchObject({ mpn: 'ESP32-WROOM-32' });
    expect(search.body.results[0].specs.voltage_max.value).toBe(3.6);

    expect((await api.get('/api/v1/projects')).status).toBe(401);
    expect((await api.post('/api/v1/projects').send({ name: 'x' })).status).toBe(401);

    const bad = await api.post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'whatever1' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe('Invalid email or password');

    const u = await signup('Ana');
    const dup = await api.post('/api/v1/auth/register').send({ email: u.email, name: 'Ana', password: 'password123' });
    expect(dup.status).toBe(409);
    expect((await as(u.token).get('/projects')).body.projects).toEqual([]);

    const r1 = await api.post('/api/v1/auth/refresh').send({ refresh_token: u.refresh });
    expect(r1.status).toBe(200);
    expect((await api.post('/api/v1/auth/refresh').send({ refresh_token: u.refresh })).status).toBe(401); // rotated
    expect((await api.get('/api/v1/projects').set('Authorization', 'Bearer garbage')).status).toBe(401);
  });

  it('US-03: add by MPN, "not found" suggests a custom part', async () => {
    const { signup, as } = await testApp();
    const u = await signup();
    const p = (await as(u.token).post('/projects').send({ name: 'Weather node' })).body.project;
    const ok = await as(u.token).post(`/projects/${p.id}/components`).send({ mpn: 'bme280', quantity: 2 });
    expect(ok.status).toBe(201);
    expect(ok.body.item.component.mpn).toBe('BME280');
    expect(ok.body.item.specs.voltage_max.value).toBe(3.6);

    const miss = await as(u.token).post(`/projects/${p.id}/components`).send({ mpn: 'NOT-A-REAL-PART' });
    expect(miss.status).toBe(404);
    expect(miss.body.error).toMatchObject({ code: 'COMPONENT_NOT_FOUND', details: { suggestion: 'create_custom_part' } });

    const none = await as(u.token).get('/components/search?q=zzzzzz');
    expect(none.body).toMatchObject({ not_found: true, message: 'Component not found' });
  });

  it('US-04/05/06/09: compatibility flags rows live, custom rules apply immediately, overrides re-evaluate', async () => {
    const { signup, as } = await testApp();
    const u = await signup();
    const c = as(u.token);
    const p = (await c.post('/projects').send({ name: 'Mismatch' })).body.project;

    const reg = await c.post(`/projects/${p.id}/components`).send({ mpn: 'L7805CV' }); // 5V output
    expect(reg.body.summary.errors).toBe(0);
    const esp = await c.post(`/projects/${p.id}/components`).send({ mpn: 'ESP32-WROOM-32' }); // 3.0-3.6V
    expect(esp.body.summary.errors).toBe(1);
    expect(esp.body.item.compatibility.status).toBe('error');
    expect(esp.body.item.compatibility.issues[0]).toMatchObject({ rule_name: 'Supply voltage within input range' });

    const list = await c.get(`/projects/${p.id}/components`);
    expect(list.body.items.map((i: any) => i.compatibility.status).sort()).toEqual(['error', 'error']);
    expect(list.body.totals.error_count).toBe(2);

    const report = (await c.get(`/projects/${p.id}/compatibility/report`)).body;
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].attributes).toEqual(expect.arrayContaining(['output_voltage', 'voltage_max']));
    expect(report.errors[0].items.map((i: any) => i.mpn).sort()).toEqual(['ESP32-WROOM-32', 'L7805CV']);

    // US-06: the user says the regulator is actually adjusted to 3.3 V
    const ov = await c.put(`/projects/${p.id}/components/${reg.body.item.id}/specs/output_voltage`).send({ value: 3.3 });
    expect(ov.status).toBe(200);
    expect(ov.body.summary.errors).toBe(0);
    expect(ov.body.item.specs.output_voltage).toMatchObject({ value: 3.3, overridden: true, status: 'manual' });
    expect((await c.delete(`/projects/${p.id}/components/${reg.body.item.id}/specs/output_voltage`)).body.summary.errors).toBe(1);

    // US-05: custom rule, immediately applied to existing parts
    const bad = await c.post(`/projects/${p.id}/rules/custom`).send({ name: 'x', severity: 'error', kind: 'pair', formula: 'a.x +' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('INVALID_FORMULA');
    const rule = await c.post(`/projects/${p.id}/rules/custom`).send({
      name: 'MCU needs 2A headroom', severity: 'warning', kind: 'pair',
      applies_a: 'a.category == "power"', applies_b: 'b.category == "mcu"',
      formula: 'a.output_current_max >= b.current_max * 4',
    });
    expect(rule.status).toBe(201);
    expect(rule.body.report.warnings[0].rule_name).toBe('MCU needs 2A headroom');
  });

  it('US-07: commits, history and diff including the uncommitted working copy', async () => {
    const { signup, as } = await testApp();
    const u = await signup();
    const c = as(u.token);
    const p = (await c.post('/projects').send({ name: 'Versioned' })).body.project;

    expect((await c.post(`/projects/${p.id}/versions`).send({})).status).toBe(422); // empty BOM
    const a = (await c.post(`/projects/${p.id}/components`).send({ mpn: 'HC-SR04' })).body.item;
    const v1 = (await c.post(`/projects/${p.id}/versions`).send({})).body.version;
    expect(v1).toMatchObject({ number: 1 });
    expect((await c.post(`/projects/${p.id}/versions`).send({})).status).toBe(409); // no changes

    await c.patch(`/projects/${p.id}/components/${a.id}`).send({ quantity: 3 });
    await c.post(`/projects/${p.id}/components`).send({ mpn: 'SG90' });
    const v2 = (await c.post(`/projects/${p.id}/versions`).send({ summary: 'More parts' })).body.version;

    const hist = (await c.get(`/projects/${p.id}/versions`)).body.versions;
    expect(hist.map((v: any) => v.number)).toEqual([2, 1]);
    expect(hist[0]).toMatchObject({ summary: 'More parts', author_name: 'User' });

    const diff = (await c.get(`/projects/${p.id}/versions/compare?from=${v1.id}&to=${v2.id}`)).body;
    expect(diff.added).toHaveLength(1);
    expect(diff.modified[0].changes).toEqual([{ field: 'quantity', previous: 1, current: 3 }]);

    await c.delete(`/projects/${p.id}/components/${a.id}`);
    const wd = (await c.get(`/projects/${p.id}/versions/compare?from=${v2.id}&to=working`)).body;
    expect(wd.removed.map((x: any) => x.mpn)).toEqual(['HC-SR04']);
  });

  it('US-08: custom parts behave like API parts and stay private', async () => {
    const { signup, as } = await testApp();
    const u = await signup('Cus');
    const other = await signup('Oth');
    const c = as(u.token);
    const made = await c.post('/components').send({
      name: 'Proprietary 12V Pump', category: 'actuator', package_type: 'Module',
      specs: { voltage_min: '10V', voltage_max: '14V', current_max: '800mA', width_mm: 30, length_mm: 60, height_mm: 25 },
    });
    expect(made.status).toBe(201);
    expect(made.body.component.specs.current_max).toMatchObject({ value: 0.8, unit: 'A', status: 'ok', raw: '800mA' });

    expect((await c.post('/components').send({ name: 'bad', specs: { voltage_max: '100mA' } })).status).toBe(422);

    const p = (await c.post('/projects').send({ name: 'Pump' })).body.project;
    const psu = (await c.post('/components').send({ name: 'Bench 5V', category: 'power', specs: { output_voltage: 5, output_current_max: 3 } })).body.component;
    await c.post(`/projects/${p.id}/components`).send({ component_id: psu.id });
    const added = await c.post(`/projects/${p.id}/components`).send({ component_id: made.body.component.id });
    expect(added.body.summary.errors).toBe(1); // 5V into a 10-14V pump

    // fixing the custom part re-evaluates every project using it
    await c.put(`/components/${made.body.component.id}/specs/voltage_min`).send({ value: 4.5 });
    expect((await c.get(`/projects/${p.id}/compatibility/report`)).body.summary.errors).toBe(0);

    expect((await as(other.token).get(`/components/${made.body.component.id}`)).status).toBe(404);
    expect((await api(other.token, as).search('Pump')).results).toHaveLength(0);
    expect((await api(u.token, as).search('Pump')).results.length).toBe(1);
    expect((await c.put('/components/' + psu.id).send({ name: 'Bench 5V v2' })).status).toBe(200);
    expect((await c.delete(`/components/${psu.id}`)).status).toBe(409); // in use
  });

  it('US-10: roles are enforced, last admin protected, non-members see 404', async () => {
    const { signup, as } = await testApp();
    const admin = await signup('Adm');
    const viewer = await signup('Vie');
    const stranger = await signup('Str');
    const a = as(admin.token);
    const p = (await a.post('/projects').send({ name: 'Team' })).body.project;
    const item = (await a.post(`/projects/${p.id}/components`).send({ mpn: 'SG90' })).body.item;

    expect((await a.post(`/projects/${p.id}/members`).send({ email: 'ghost@example.com', role: 'viewer' })).status).toBe(404);
    expect((await a.post(`/projects/${p.id}/members`).send({ email: viewer.email, role: 'viewer' })).status).toBe(201);

    const v = as(viewer.token);
    expect((await v.get(`/projects/${p.id}/components`)).status).toBe(200);
    expect((await v.get(`/projects/${p.id}/compatibility/report`)).status).toBe(200);
    expect((await v.post(`/projects/${p.id}/components`).send({ mpn: 'HC-SR04' })).status).toBe(403);
    expect((await v.patch(`/projects/${p.id}/components/${item.id}`).send({ quantity: 9 })).status).toBe(403);
    expect((await v.post(`/projects/${p.id}/rules/custom`).send({ name: 'n', severity: 'error', kind: 'single', formula: 'a.x > 1' })).status).toBe(403);
    expect((await v.get(`/projects/${p.id}/audit-log`)).status).toBe(403);
    expect((await as(stranger.token).get(`/projects/${p.id}/components`)).status).toBe(404);

    expect((await a.patch(`/projects/${p.id}/members/${admin.id}`).send({ role: 'editor' })).status).toBe(409);
    expect((await a.patch(`/projects/${p.id}/members/${viewer.id}`).send({ role: 'editor' })).status).toBe(200);
    expect((await v.post(`/projects/${p.id}/components`).send({ mpn: 'HC-SR04' })).status).toBe(201);
    expect((await v.delete(`/projects/${p.id}/members/${admin.id}`)).status).toBe(403);

    const log = (await a.get(`/projects/${p.id}/audit-log`)).body.entries.map((e: any) => e.action);
    expect(log).toEqual(expect.arrayContaining(['project.create', 'bom.add', 'member.invite', 'member.role']));
  });

  it('US-11: CSV and PDF export with deprecated/removed options and formula-injection guard', async () => {
    const { signup, as, storage } = await testApp();
    const u = await signup();
    const c = as(u.token);
    const p = (await c.post('/projects').send({ name: 'Export me' })).body.project;
    await c.post(`/projects/${p.id}/components`).send({ mpn: 'SG90', quantity: 2, unit_price: 2.5 });
    const gone = (await c.post(`/projects/${p.id}/components`).send({ mpn: 'HC-SR04' })).body.item;
    const dep = (await c.post(`/projects/${p.id}/components`).send({ mpn: 'NE555P' })).body.item;
    await c.delete(`/projects/${p.id}/components/${gone.id}`);
    await c.patch(`/projects/${p.id}/components/${dep.id}`).send({ status: 'deprecated' });
    const evil = (await c.post('/components').send({ name: '=HYPERLINK("http://evil")', mpn: 'EVIL1' })).body.component;
    await c.post(`/projects/${p.id}/components`).send({ component_id: evil.id });

    const gen = await c.post(`/projects/${p.id}/exports`).send({ format: 'csv' });
    expect(gen.status).toBe(201);
    const dl = await c.get(gen.body.export.download_url.replace('/api/v1', ''));
    expect(dl.headers['content-type']).toMatch(/text\/csv/);
    const csv = dl.text;
    expect(csv).toContain('SG90');
    expect(csv).not.toContain('HC-SR04');
    expect(csv).not.toContain('NE555P');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toMatch(/TOTAL \(active\),5\b/);

    const all = (await c.post(`/projects/${p.id}/exports`).send({ format: 'csv', include_deprecated: true, include_removed: true })).body.export;
    const full = (await c.get(all.download_url.replace('/api/v1', ''))).text;
    expect(full).toContain('HC-SR04');
    expect(full).toContain('NE555P');

    const pdf = (await c.post(`/projects/${p.id}/exports`).send({ format: 'pdf' })).body.export;
    const pdfRes = await c.get(pdf.download_url.replace('/api/v1', '')).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (d: Buffer) => chunks.push(d));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect((pdfRes.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(storage.files.size).toBe(3);

    const out = await signup('Out');
    expect((await as(out.token).get(gen.body.export.download_url.replace('/api/v1', ''))).status).toBe(404);
  });

  it('US-12: sub-assemblies must be valid, then import into another project and are checked there', async () => {
    const { signup, as } = await testApp();
    const u = await signup();
    const c = as(u.token);
    const p1 = (await c.post('/projects').send({ name: 'Source' })).body.project;
    const reg = (await c.post(`/projects/${p1.id}/components`).send({ mpn: 'AMS1117-3.3' })).body.item;
    const bme = (await c.post(`/projects/${p1.id}/components`).send({ mpn: 'BME280' })).body.item;
    const hc = (await c.post(`/projects/${p1.id}/components`).send({ mpn: 'HC-SR04' })).body.item;

    const invalid = await c.post(`/projects/${p1.id}/sub-assemblies`).send({ name: 'bad', item_ids: [reg.id, hc.id] }); // 3.3V into 5V-only part
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('SUBASSEMBLY_INVALID');

    const ok = await c.post(`/projects/${p1.id}/sub-assemblies`).send({ name: '3V3 sensor supply', item_ids: [reg.id, bme.id] });
    expect(ok.status).toBe(201);

    const p2 = (await c.post('/projects').send({ name: 'Target' })).body.project;
    await c.post(`/projects/${p2.id}/components`).send({ mpn: 'HC-SR04' });
    const imp = await c.post(`/projects/${p2.id}/sub-assemblies/${ok.body.sub_assembly_id}/import`).send({});
    expect(imp.status).toBe(201);
    expect(imp.body.imported).toBe(2);
    expect(imp.body.summary.errors).toBe(1); // new regulator vs the existing 5V-only sensor
    expect((await c.get('/sub-assemblies')).body.sub_assemblies).toHaveLength(1);
  });

  it('US-13/14: dashboard metrics, templates, bulk edit', async () => {
    const { signup, as } = await testApp();
    const u = await signup();
    const c = as(u.token);
    const p = (await c.post('/projects').send({ name: 'Base' })).body.project;
    const i1 = (await c.post(`/projects/${p.id}/components`).send({ mpn: 'SG90', quantity: 2 })).body.item;
    const i2 = (await c.post(`/projects/${p.id}/components`).send({ mpn: 'HC-SR04', quantity: 1 })).body.item;

    const bulk = await c.patch(`/projects/${p.id}/components/bulk`).send({ item_ids: [i1.id, i2.id], patch: { quantity: 4, supplier_url: 'https://example.com/part' } });
    expect(bulk.body.updated).toBe(2);
    expect((await c.patch(`/projects/${p.id}/components/bulk`).send({ item_ids: [i1.id, 'nope'], patch: { quantity: 1 } })).status).toBe(404);

    const dash = (await c.get('/projects')).body.projects[0];
    expect(dash.metrics).toMatchObject({ component_count: 2, estimated_cost: 14 }); // 4*2.0 + 4*1.5
    expect(dash.role).toBe('admin');

    const tpl = await c.post(`/projects/${p.id}/template`).send({ name: 'Robot starter' });
    expect(tpl.status).toBe(201);
    const fromTpl = await c.post('/projects').send({ name: 'Clone', template_id: tpl.body.template_id });
    expect(fromTpl.body.project.metrics.component_count).toBe(2);
    expect((await c.get('/projects/templates')).body.templates[0]).toMatchObject({ name: 'Robot starter', item_count: 2 });
    expect((await c.post('/projects').send({ name: 'x', template_id: 'nope' })).status).toBe(404);
  });

  it('US-15: notifications reach teammates (not the actor) and flag new critical errors', async () => {
    const { signup, as, mailer } = await testApp();
    const a = await signup('Own');
    const b = await signup('Mate');
    const ca = as(a.token);
    const cb = as(b.token);
    const p = (await ca.post('/projects').send({ name: 'Shared' })).body.project;
    await ca.post(`/projects/${p.id}/members`).send({ email: b.email, role: 'editor' });
    expect((await cb.get('/notifications/unread-count')).body.unread).toBe(1); // invited

    await ca.post(`/projects/${p.id}/components`).send({ mpn: 'L7805CV' });
    await ca.post(`/projects/${p.id}/components`).send({ mpn: 'ESP32-WROOM-32' });
    const mine = (await cb.get('/notifications')).body.notifications;
    expect(mine.map((n: any) => n.type)).toEqual(expect.arrayContaining(['member_invited', 'bom_updated', 'critical_error']));
    expect((await ca.get('/notifications')).body.notifications.map((n: any) => n.type)).not.toContain('bom_updated');
    expect(mailer.sent.some((m) => m.to === b.email && /compatibility error/.test(m.subject))).toBe(true);

    // re-evaluating an unchanged failure must not re-notify
    const before = (await cb.get('/notifications')).body.notifications.length;
    await ca.post(`/projects/${p.id}/compatibility/evaluate`).send({});
    expect((await cb.get('/notifications')).body.notifications.length).toBe(before);

    await cb.post('/notifications/read-all').send({});
    expect((await cb.get('/notifications/unread-count')).body.unread).toBe(0);
    expect((await cb.patch(`/notifications/${mine[0].id}/read`).send({})).status).toBe(204);
    expect((await ca.patch(`/notifications/${mine[0].id}/read`).send({})).status).toBe(404); // not theirs
  });

  it('backup & restore: admin only, restores BOM and rules, records a version', async () => {
    const { signup, as } = await testApp();
    const adm = await signup('Adm');
    const ed = await signup('Edi');
    const c = as(adm.token);
    const p = (await c.post('/projects').send({ name: 'Precious' })).body.project;
    await c.post(`/projects/${p.id}/members`).send({ email: ed.email, role: 'editor' });
    expect((await as(ed.token).post(`/projects/${p.id}/backups`).send({})).status).toBe(403);

    await c.post(`/projects/${p.id}/components`).send({ mpn: 'SG90' });
    await c.post(`/projects/${p.id}/components`).send({ mpn: 'HC-SR04' });
    await c.post(`/projects/${p.id}/rules/custom`).send({ name: 'r', severity: 'warning', kind: 'single', formula: 'a.quantity >= 1' });
    const bk = (await c.post(`/projects/${p.id}/backups`).send({})).body.backup;
    expect(bk.item_count).toBe(2);

    const items = (await c.get(`/projects/${p.id}/components`)).body.items;
    for (const i of items) await c.delete(`/projects/${p.id}/components/${i.id}?hard=true`);
    expect((await c.get(`/projects/${p.id}/components`)).body.items).toHaveLength(0);

    const restored = await c.post(`/projects/${p.id}/backups/${bk.id}/restore`).send({});
    expect(restored.status).toBe(200);
    expect((await c.get(`/projects/${p.id}/components`)).body.items).toHaveLength(2);
    expect((await c.get(`/projects/${p.id}/rules/custom`)).body.rules).toHaveLength(1);
    expect((await c.get(`/projects/${p.id}/versions`)).body.versions[0].summary).toMatch(/Restored from backup/);
    expect((await c.get(`/projects/${p.id}/backups`)).body.backups).toHaveLength(1);
  });

  it('input hygiene: validation envelope, bad JSON, unknown routes, health', async () => {
    const { api, signup, as } = await testApp();
    const u = await signup();
    expect((await api.get('/api/v1/health')).body.status).toBe('ok');
    const v = await as(u.token).post('/projects').send({ name: '' });
    expect(v.status).toBe(422);
    expect(v.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await api.post('/api/v1/auth/login').set('content-type', 'application/json').send('{bad')).status).toBe(400);
    expect((await api.get('/api/v1/nope')).status).toBe(404);
    expect((await api.get('/api/v1/components/search?spec=oops')).status).toBe(422);
    const parsed = await api.post('/api/v1/components/parse').send({ raw: '100mA', attribute: 'current_max' });
    expect(parsed.body).toMatchObject({ value: 0.1, unit: 'A', status: 'ok' });
    expect((await as(u.token).get('/rules/attributes')).body.attributes.length).toBeGreaterThan(10);
    expect((await as(u.token).get('/rules/prebuilt')).body.rules.length).toBe(5);
  });
});

// tiny helper to search as a given user
function api(token: string, as: (t: string) => any) {
  return { search: async (q: string) => (await as(token).get(`/components/search?q=${encodeURIComponent(q)}`)).body };
}
