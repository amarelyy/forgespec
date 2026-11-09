import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

// Each test starts on the homepage; the guest flow changes the URL.
beforeEach(() => window.history.replaceState(null, '', '/'));

const PLACEHOLDER = 'Search part number, e.g. LM7805';
const drawer = () => within(screen.getByLabelText('Component Library'));

describe('landing page', () => {
  it('shows every section, the three header actions, and no emoji anywhere', () => {
    render(<App api={fakeApi(vi.fn())} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Catch the 3\.3\s+V part on your 5\s+V rail before you buy it\./);
    expect(screen.getAllByRole('button', { name: 'Log In' })[0]).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Sign Up' })[0]).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try as Guest' })).toBeVisible();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeVisible();
    // moving carousel
    for (const t of ['Catch wrong parts before you buy', 'See what changed between versions', 'Specs are read for you', 'Export a clean list for suppliers']) {
      expect(screen.getByRole('heading', { name: t, hidden: true })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Next slide' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Previous slide' })).toBeVisible();
    // walkthrough, guest band, footer
    expect(screen.getByRole('heading', { name: 'Watch one sensor go from search to saved' })).toBeVisible();
    expect(screen.getByRole('heading', { name: /Look around first/ })).toBeVisible();
    expect(screen.getByText(/2026 ForgeSpec Team/)).toBeVisible();
    expect(document.body.textContent).not.toMatch(EMOJI_RE);
  });

  it('lists the sample catalogue offline, with the raw datasheet string next to the parsed value', () => {
    render(<App api={fakeApi(vi.fn())} />);
    expect(screen.getByText('14 parts in this sample')).toBeVisible();
    // BME280 is open by default
    expect(drawer().getByText('"1.71V ~ 3.6V"')).toBeVisible();
    expect(drawer().getByText('1.71 – 3.6 V')).toBeVisible();
    expect(drawer().getByText('3.6 µA')).toBeVisible();
  });

  it('filters the sample list by category chip, and a single letter does not call the API', async () => {
    const search = vi.fn();
    render(<App api={fakeApi(search)} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Motors' }));
    expect(screen.getByText('2 parts in this sample')).toBeVisible();
    expect(screen.getByText('MG996R')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.type(screen.getByRole('searchbox'), 'r');
    await new Promise((r) => setTimeout(r, 450));
    expect(search).not.toHaveBeenCalled();
  });

  it('searches the distributor without logging in and shows a parsed detail list', async () => {
    const search = vi.fn().mockResolvedValue(found([esp]));
    render(<App api={fakeApi(search)} />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('searchbox'), 'esp32');
    const row = await screen.findByRole('button', { name: /ESP32-WROOM-32\s*ESP32 module/ }, { timeout: 2000 });
    expect(search).toHaveBeenLastCalledWith({ q: 'esp32', limit: 12 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // no login wall

    await user.click(row);
    expect(screen.getByText('Current draw (max)')).toBeVisible();
    expect(screen.getByText('"500mA"')).toBeVisible();
    expect(screen.getByText('0.5 A')).toBeVisible();
    expect(screen.getAllByText('"3.0V ~ 3.6V"')).toHaveLength(2); // min and max rows
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
    expect(await screen.findByText('SECOND', {}, { timeout: 2000 })).toBeVisible();
    resolveFirst(found([{ ...esp, id: 'c1', mpn: 'FIRST' }]));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('FIRST')).not.toBeInTheDocument();
  });

  it('offers a custom part when nothing is found, and sends guests to log in for it', async () => {
    const search = vi.fn().mockResolvedValue(found([], { not_found: true, message: 'Component not found', suggestion: 'create_custom_part' }));
    render(<App api={fakeApi(search)} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'zzzz');
    expect(await screen.findByText('Component not found', {}, { timeout: 2000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create custom part' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Log in to create a custom part.');
  });

  it('shows a readable error and falls back to the sample list when the server is unreachable', async () => {
    const search = vi.fn().mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'down'));
    render(<App api={fakeApi(search)} />);
    await userEvent.setup().type(screen.getByRole('searchbox'), 'lm7805');
    expect(await screen.findByRole('alert', {}, { timeout: 2000 })).toHaveTextContent('Cannot reach the ForgeSpec server');
    expect(drawer().getByText('LM7805CT')).toBeVisible(); // the sample list still works
  });

  it('guests are asked to log in only when they try to save, and login updates the header', async () => {
    const login = vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co', name: 'Ana', created_at: '' });
    render(<App api={fakeApi(vi.fn(), { login })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Log in to save/ })); // the BME280 detail is open by default

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Log in to save parts to a project.');
    await user.type(within(dialog).getByLabelText('Email'), 'a@b.co');
    await user.type(within(dialog).getByLabelText('Password'), 'password123');
    await user.click(within(dialog).getByRole('button', { name: 'Log In' }));

    expect(login).toHaveBeenCalledWith({ email: 'a@b.co', password: 'password123' });
    // Signed in: the three auth buttons give way to the three-line account menu.
    const menu = await screen.findByRole('button', { name: 'Account menu' });
    const header = within(screen.getByRole('banner'));
    for (const name of ['Log In', 'Sign Up', 'Try as Guest']) expect(header.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(menu).toHaveAttribute('aria-expanded', 'false');

    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Ana')).toBeVisible();
    expect(screen.getByText('a@b.co')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('a@b.co')).not.toBeInTheDocument();
    expect(menu).toHaveFocus();

    await user.click(menu);
    const pages = within(screen.getByRole('navigation', { name: 'Pages' }));
    expect(pages.getByRole('link', { name: 'Home' })).toBeVisible();
    expect(pages.getByText('Settings')).toBeVisible();
    expect(pages.getByText(/Account Profile/)).toHaveAttribute('aria-disabled', 'true');
    expect(pages.getByText(/Team Members & Roles/)).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', { name: 'Log Out' }));
    expect(await within(screen.getByRole('banner')).findByRole('button', { name: 'Sign Up' })).toBeVisible();
  });

  it('shows field errors from the API in the sign-up form', async () => {
    const api = fakeApi(vi.fn());
    (api.auth.register as ReturnType<typeof vi.fn>).mockRejectedValue(new ApiError(422, 'VALIDATION_ERROR', 'bad', [{ path: 'password', message: 'at least 8 characters' }]));
    render(<App api={api} />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'Sign Up' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Ana');
    await user.type(within(dialog).getByLabelText('Email'), 'a@b.co');
    await user.type(within(dialog).getByLabelText('Password'), 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Sign Up' }));
    expect(await within(dialog).findByText('at least 8 characters')).toBeVisible();
    expect(within(dialog).getByLabelText('Password')).toBeInvalid();
  });

  it('every guest button takes you to the Component Library search on this page', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    const user = userEvent.setup();
    const box = screen.getByPlaceholderText(PLACEHOLDER);
    await user.click(screen.getByRole('button', { name: 'Try as Guest' }));
    expect(box).toHaveFocus();
    expect(window.location.pathname).toBe('/');

    box.blur();
    for (const b of screen.getAllByRole('button', { name: 'Browse parts as guest' })) {
      await user.click(b);
      expect(box).toHaveFocus();
      box.blur();
    }
  });
});

describe('header navigation', () => {
  const main = () => within(screen.getByRole('navigation', { name: 'Main' }));

  it('shows Home, Dashboard and Component Library as text links, with submenus from the site map', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    const user = userEvent.setup();
    expect(main().getByRole('link', { name: 'Home' })).toHaveAttribute('href', '#top');

    const dash = main().getByRole('button', { name: 'Dashboard' });
    expect(dash).toHaveAttribute('aria-expanded', 'false');
    await user.hover(dash);
    expect(dash).toHaveAttribute('aria-expanded', 'true');
    const panel = within(document.getElementById('sn-dashboard')!);
    for (const t of ['Your projects', 'Create new project', 'Component List (BOM)', 'Version History', 'Compare Versions', 'Compatibility Report', 'Sub-assemblies', 'Export']) {
      expect(panel.getByText(t)).toBeVisible();
    }
    expect(panel.getByText('Opens from a project')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(dash).toHaveAttribute('aria-expanded', 'false');
    expect(dash).toHaveFocus();
    expect(document.body.textContent).not.toMatch(EMOJI_RE);
  });

  it('sends guests to log in for project pages, and Search components jumps to the library', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    const user = userEvent.setup();
    await user.click(main().getByRole('button', { name: 'Dashboard' }));
    await user.click(main().getByRole('button', { name: /^Your projects/ }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Log in to open your projects.');
    await user.keyboard('{Escape}');

    await user.click(main().getByRole('button', { name: 'Component Library' }));
    await user.click(main().getByRole('button', { name: 'Search components' }));
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveFocus();
  });
});

describe('carousel', () => {
  it('steps with the side arrows and wraps around', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    const user = userEvent.setup();
    const reel = document.querySelector<HTMLElement>('.reel')!;
    expect(reel.style.transform).toBe('translateX(-0%)');
    await user.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(reel.style.transform).toBe('translateX(-100%)');
    await user.click(screen.getByRole('button', { name: 'Previous slide' }));
    await user.click(screen.getByRole('button', { name: 'Previous slide' }));
    expect(reel.style.transform).toBe('translateX(-300%)');
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
