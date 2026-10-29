import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../index';
import type { Component, ForgeSpecApi, SearchResult } from '../index';
import { App } from './App';
import { EMOJI_RE, keySpecs } from './format';

const spec = (value: number, unit: string, raw = `${value}${unit}`) => ({ raw, value, unit, status: 'ok' as const });

const esp: Component = {
  id: 'c1', source: 'api', owner_id: null, mpn: 'ESP32-WROOM-32', manufacturer: 'Espressif', name: 'ESP32 module', category: 'mcu',
  description: 'Wi-Fi + Bluetooth MCU module', package_type: 'Module', datasheet_url: '', lifecycle_status: 'active', stock: 15000, price: 3.5,
  specs: {
    voltage_min: spec(3, 'V', '3.0V ~ 3.6V'),
    voltage_max: spec(3.6, 'V', '3.0V ~ 3.6V'),
    current_max: spec(0.5, 'A', '500mA'),
    length_mm: spec(25.5, 'mm', '18 x 25.5 x 3.1 mm'),
    width_mm: spec(18, 'mm', '18 x 25.5 x 3.1 mm'),
    height_mm: { raw: '3.1 mm', value: 3.1, unit: 'mm', status: 'ambiguous' },
  },
  supply_risk: { level: 'none', reasons: [] }, created_at: '', updated_at: '',
};

const found = (results: Component[], extra: Partial<SearchResult> = {}): SearchResult => ({ results, total: results.length, provider: 'nexar', warnings: [], ...extra });

function fakeApi(search: ForgeSpecApi['library']['search'], over: Partial<{ login: () => Promise<unknown> }> = {}) {
  return {
    isAuthenticated: false,
    library: { search },
    auth: {
      login: over.login ?? vi.fn(),
      register: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      profile: vi.fn(),
    },
  } as unknown as ForgeSpecApi;
}

describe('homepage', () => {
  it('shows the requested content, the three header actions, and no emoji anywhere', () => {
    render(<App api={fakeApi(vi.fn())} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bill of Materials & Version Control for Hardware');
    expect(screen.getByRole('button', { name: 'Log In' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try as Guest' })).toBeVisible();
    expect(screen.getByPlaceholderText('Search Part Number (e.g., STM32F407, LM7805...)')).toBeVisible();
    for (const t of ['Auto-fetch from Octopart/Nexar', 'Detect Errors Early', 'Track Every Change']) expect(screen.getByRole('heading', { name: t })).toBeVisible();
    expect(screen.getByText(/2026 ForgeSpec Team/)).toBeVisible();
    expect(document.body.textContent).not.toMatch(EMOJI_RE);
  });

  it('searches without logging in and shows key specs and a parsed detail table', async () => {
    const search = vi.fn().mockResolvedValue(found([esp]));
    render(<App api={fakeApi(search)} />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('searchbox'), 'esp32{Enter}');
    expect(await screen.findByRole('heading', { name: 'ESP32-WROOM-32' })).toBeVisible();
    expect(search).toHaveBeenLastCalledWith({ q: 'esp32', limit: 12 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // no login wall

    expect(screen.getByText('3 to 3.6 V')).toBeVisible();
    expect(screen.getByText('0.5 A')).toBeVisible();
    expect(screen.getByText('25.5 x 18 x 3.1 mm')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /view technical details/i }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Current draw (max)')).toBeVisible();
    expect(within(table).getByText('500mA')).toBeVisible();
    expect(within(table).getByText('Check')).toBeVisible(); // ambiguous parse is flagged
  });

  it('debounces typing and ignores a stale slower response', async () => {
    let resolveFirst!: (r: SearchResult) => void;
    const search = vi
      .fn()
      .mockImplementationOnce(() => new Promise<SearchResult>((r) => (resolveFirst = r)))
      .mockResolvedValueOnce(found([{ ...esp, id: 'c2', mpn: 'SECOND' }]));
    render(<App api={fakeApi(search)} />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('searchbox'), 'ab');
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1), { timeout: 1500 });
    await user.type(screen.getByRole('searchbox'), 'c');
    expect(await screen.findByRole('heading', { name: 'SECOND' })).toBeVisible();
    resolveFirst(found([{ ...esp, id: 'c1', mpn: 'FIRST' }]));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('heading', { name: 'FIRST' })).not.toBeInTheDocument();
  });

  it('offers a custom part when nothing is found, and sends guests to log in for it', async () => {
    const search = vi.fn().mockResolvedValue(found([], { not_found: true, message: 'Component not found', suggestion: 'create_custom_part' }));
    render(<App api={fakeApi(search)} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'zzzz{Enter}');
    expect(await screen.findByRole('heading', { name: 'Component not found' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create a custom part' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Log in to create a custom part.');
  });

  it('shows a readable error when the server is unreachable', async () => {
    const search = vi.fn().mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'down'));
    render(<App api={fakeApi(search)} />);
    await userEvent.setup().type(screen.getByRole('searchbox'), 'lm7805{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the ForgeSpec server');
  });

  it('guests are asked to log in only when they try to save, and login updates the header', async () => {
    const search = vi.fn().mockResolvedValue(found([esp]));
    const login = vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co', name: 'Ana', created_at: '' });
    render(<App api={fakeApi(search, { login })} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'esp32{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Add to Project' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Log in to save parts to a project.');
    await user.type(within(dialog).getByLabelText('Email'), 'a@b.co');
    await user.type(within(dialog).getByLabelText('Password'), 'password123');
    await user.click(within(dialog).getByRole('button', { name: 'Log In' }));

    expect(login).toHaveBeenCalledWith({ email: 'a@b.co', password: 'password123' });
    expect(await screen.findByText('Ana')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Try as Guest' })).not.toBeInTheDocument();
  });

  it('shows field errors from the API in the sign-up form', async () => {
    const api = fakeApi(vi.fn());
    (api.auth.register as ReturnType<typeof vi.fn>).mockRejectedValue(new ApiError(422, 'VALIDATION_ERROR', 'bad', [{ path: 'password', message: 'at least 8 characters' }]));
    render(<App api={api} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Ana');
    await user.type(within(dialog).getByLabelText('Email'), 'a@b.co');
    await user.type(within(dialog).getByLabelText('Password'), 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Sign Up' }));
    expect(await within(dialog).findByText('at least 8 characters')).toBeVisible();
    expect(within(dialog).getByLabelText('Password')).toBeInvalid();
  });

  it('Try as Guest focuses the search box', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try as Guest' }));
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });
});

describe('keySpecs', () => {
  it('summarises a power part', () => {
    const reg = { ...esp, specs: { output_voltage: spec(5, 'V'), output_current_max: spec(1.5, 'A') } };
    expect(keySpecs(reg)).toEqual([
      { label: 'Output', value: '5 V' },
      { label: 'Max output', value: '1.5 A' },
    ]);
  });
});
