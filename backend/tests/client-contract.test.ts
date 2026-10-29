import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError, MemoryTokenStore, createForgeSpecApi } from '../../frontend/src/index';
import { createApp } from '../src/app';
import { testApp } from './helpers';

/**
 * Drives the real HTTP server through the frontend API client, so a route or DTO
 * change that breaks the client fails here instead of in the browser.
 */
describe('frontend client <-> backend contract', () => {
  let baseUrl = '';
  let close: () => Promise<void>;

  beforeAll(async () => {
    const { ctx } = await testApp();
    const server = createApp(ctx).listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    close = () => new Promise((r) => server.close(() => r()));
  });
  afterAll(() => close());

  it('guest browse, register, build a BOM, see an error, fix it, commit, diff, export', async () => {
    const guest = createForgeSpecApi({ baseUrl });
    const found = await guest.library.search({ q: 'esp32' });
    expect(found.results[0].specs.voltage_max.value).toBe(3.6);
    await expect(guest.projects.list()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect((await guest.library.parse('100mA', { attribute: 'current_max' })).value).toBe(0.1);

    const api = createForgeSpecApi({ baseUrl });
    const user = await api.auth.register({ email: 'client@example.com', name: 'Client', password: 'password123' });
    expect(api.isAuthenticated).toBe(true);
    expect((await api.auth.profile()).id).toBe(user.id);

    const project = await api.projects.create({ name: 'Contract' });
    await api.bom.add(project.id, { mpn: 'L7805CV' });
    const added = await api.bom.add(project.id, { mpn: 'ESP32-WROOM-32', designator: 'U1' });
    expect(added.summary.errors).toBe(1);
    expect(added.item.compatibility.issues[0].attributes).toContain('voltage_max');

    const miss = await api.bom.add(project.id, { mpn: 'NOPE-123' }).catch((e) => e);
    expect(miss).toBeInstanceOf(ApiError);
    expect(miss).toMatchObject({ status: 404, code: 'COMPONENT_NOT_FOUND', details: { suggestion: 'create_custom_part' } });

    const bad = (await api.projects.create({ name: '' }).catch((e) => e)) as ApiError;
    expect(bad.fieldErrors).toHaveProperty('name');

    const { items, totals } = await api.bom.list(project.id);
    expect(totals.error_count).toBe(2);
    const reg = items.find((i) => i.component.mpn === 'L7805CV')!;
    const fixed = await api.bom.overrideSpec(project.id, reg.id, 'output_voltage', 3.3);
    expect(fixed.summary.errors).toBe(0);
    expect((await api.rules.report(project.id)).errors).toEqual([]);

    const v1 = await api.versions.commit(project.id, 'first');
    await api.bom.update(project.id, added.item.id, { quantity: 5 });
    const diff = await api.versions.compare(project.id, v1.id, 'working');
    expect(diff.modified[0].changes[0]).toMatchObject({ field: 'quantity', previous: 1, current: 5 });

    const info = await api.exports.generate(project.id, { format: 'csv' });
    const file = await api.exports.download(info);
    expect(file.filename).toBe(info.filename);
    expect(await file.blob.text()).toContain('ESP32-WROOM-32');

    expect((await api.projects.list())[0].metrics.component_count).toBe(2);
    expect((await api.rules.builderMeta()).attributes.length).toBeGreaterThan(10);
    // The actor is still told about *new critical errors*: the voltage mismatch, then the
    // current-budget overrun after quantity went to 5 (5 x 0.5 A on a 1.5 A regulator).
    expect(await api.notifications.unreadCount()).toBe(2);
    expect((await api.notifications.list({ unread: true })).map((n) => n.type)).toEqual(['critical_error', 'critical_error']);
    await api.notifications.markAllRead();
    expect(await api.notifications.unreadCount()).toBe(0);
  });

  it('refreshes an expired access token transparently and replays the request', async () => {
    const tokens = new MemoryTokenStore();
    let expired = 0;
    const api = createForgeSpecApi({ baseUrl, tokens, onSessionExpired: () => expired++ });
    await api.auth.register({ email: 'refresh@example.com', name: 'Refresh', password: 'password123' });

    const good = tokens.get()!;
    tokens.set({ ...good, accessToken: 'expired.or.invalid' });
    expect((await api.projects.list())).toEqual([]); // 401 -> refresh -> retry
    expect(tokens.get()!.accessToken).not.toBe('expired.or.invalid');
    expect(tokens.get()!.refreshToken).not.toBe(good.refreshToken); // rotated

    // concurrent requests share a single refresh
    const before = tokens.get()!;
    tokens.set({ ...before, accessToken: 'bad' });
    const [a, b] = await Promise.all([api.projects.list(), api.auth.profile()]);
    expect(a).toEqual([]);
    expect(b.email).toBe('refresh@example.com');

    // refresh token revoked -> session expired callback, tokens cleared
    tokens.set({ accessToken: 'bad', refreshToken: 'revoked' });
    await expect(api.projects.list()).rejects.toMatchObject({ status: 401 });
    expect(expired).toBe(1);
    expect(api.isAuthenticated).toBe(false);
  });

  it('logout revokes the refresh token', async () => {
    const tokens = new MemoryTokenStore();
    const api = createForgeSpecApi({ baseUrl, tokens });
    await api.auth.register({ email: 'bye@example.com', name: 'Bye', password: 'password123' });
    const old = tokens.get()!;
    await api.auth.logout();
    expect(tokens.get()).toBeNull();
    const res = await fetch(`${baseUrl}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: old.refreshToken }) });
    expect(res.status).toBe(401);
  });

  it('reports network failures as ApiError NETWORK_ERROR', async () => {
    const api = createForgeSpecApi({ baseUrl: 'http://127.0.0.1:1/api/v1' });
    await expect(api.library.search({ q: 'x' })).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });
});
