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
  it('shows every section, one Sign In button plus Try as Guest in the header, and no emoji anywhere', () => {
    render(<App api={fakeApi(vi.fn())} />);
    // The headline is for screen readers only; the hero itself shows the four features and the board.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/catch the 3\.3\s+V part on your 5\s+V rail before you buy it\./);
    const header = within(screen.getByRole('banner'));
    expect(header.getByRole('button', { name: 'Sign In' })).toBeVisible();
    expect(header.getByRole('button', { name: 'Try as Guest' })).toBeVisible();
    // Log In and Sign Up are merged into the Sign In window.
    expect(header.queryByRole('button', { name: 'Log In' })).not.toBeInTheDocument();
    expect(header.queryByRole('button', { name: 'Sign Up' })).not.toBeInTheDocument();
    // Hero: what you can do, no buttons.
    const feats = within(screen.getByRole('list', { name: 'What you can do' }));
    for (const t of ['Search', 'Check', 'Versions', 'Export']) expect(feats.getByRole('button', { name: t })).toBeVisible();
    const hero = within(document.getElementById('hero')!);
    expect(hero.queryByRole('button', { name: 'Enter Workspace' })).not.toBeInTheDocument();
    expect(hero.queryByRole('button', { name: 'Browse parts as guest' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeVisible();
    // No carousel and no blue band any more.
    expect(screen.queryByRole('button', { name: 'Next slide' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Look around first/ })).not.toBeInTheDocument();
    // Walkthrough: the heading and the step names only.
    expect(screen.getByRole('heading', { name: 'Watch one sensor go from search to saved' })).toBeVisible();
    expect(screen.queryByText(/line-follower robot. Here is what happens/)).not.toBeInTheDocument();
    expect(screen.queryByText('Details come from the distributor and are turned into numbers.')).not.toBeInTheDocument();
    // Footer: the ways in, contact, and the team line.
    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getByRole('button', { name: 'Enter Workspace' })).toBeVisible();
    expect(footer.getByRole('button', { name: 'Browse parts as guest' })).toBeVisible();
    expect(footer.getByRole('link', { name: 'GitHub repository' })).toHaveAttribute('href', 'https://github.com/amarelyy/forgespec');
    expect(footer.getByRole('link', { name: 'Report a problem' })).toHaveAttribute('href', 'https://github.com/amarelyy/forgespec/issues');
    expect(footer.getByText(/2026 ForgeSpec Team/)).toBeVisible();
    expect(document.body.textContent).not.toMatch(EMOJI_RE);
  });

  it('lists the sample catalogue offline, with the raw datasheet string next to the parsed value', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    expect(screen.getByText('14 parts in this sample')).toBeVisible();
    await userEvent.setup().click(drawer().getByRole('button', { name: /^BME280/ }));
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
    expect(drawer().getByText('MG996R')).toBeVisible();
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

  it('offers a custom part when nothing is found, and sends guests to sign in for it', async () => {
    const search = vi.fn().mockResolvedValue(found([], { not_found: true, message: 'Component not found', suggestion: 'create_custom_part' }));
    render(<App api={fakeApi(search)} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'zzzz');
    expect(await screen.findByText('Component not found', {}, { timeout: 2000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create custom part' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Sign in to create a custom part.');
  });

  it('shows a readable error and falls back to the sample list when the server is unreachable', async () => {
    const search = vi.fn().mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'down'));
    render(<App api={fakeApi(search)} />);
    await userEvent.setup().type(screen.getByRole('searchbox'), 'lm7805');
    expect(await screen.findByRole('alert', {}, { timeout: 2000 })).toHaveTextContent('Cannot reach the ForgeSpec server');
    expect(drawer().getByText('LM7805CT')).toBeVisible(); // the sample list still works
  });

  it('guests are asked to sign in only when they try to save, and signing in updates the header', async () => {
    const login = vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co', name: 'Ana', created_at: '' });
    render(<App api={fakeApi(vi.fn(), { login })} />);
    const user = userEvent.setup();
    await user.click(drawer().getByRole('button', { name: /^BME280/ }));
    await user.click(screen.getByRole('button', { name: /Sign in to save/ }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Sign in to save parts to a project.');
    await user.type(within(dialog).getByLabelText('Email'), 'a@b.co');
    await user.type(within(dialog).getByLabelText('Password'), 'password123');
    await user.click(within(dialog).getByRole('button', { name: 'Sign In' }));

    expect(login).toHaveBeenCalledWith({ email: 'a@b.co', password: 'password123' });
    // Signed in: the account buttons give way to the three-line account menu.
    const menu = await screen.findByRole('button', { name: 'Account menu' });
    const header = within(screen.getByRole('banner'));
    for (const name of ['Sign In', 'Try as Guest']) expect(header.queryByRole('button', { name })).not.toBeInTheDocument();
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
    expect(pages.getByText(/System Settings/)).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', { name: 'Log Out' }));
    expect(await within(screen.getByRole('banner')).findByRole('button', { name: 'Sign In' })).toBeVisible();
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
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }));
    expect(await within(dialog).findByText('at least 8 characters')).toBeVisible();
    expect(within(dialog).getByLabelText('Password')).toBeInvalid();
  });

  it('Sign In opens one window with Sign In and Sign Up tabs', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    const user = userEvent.setup();
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Sign In' }));
    const dialog = await screen.findByRole('dialog');
    const signIn = within(dialog).getByRole('tab', { name: 'Sign In' });
    const signUp = within(dialog).getByRole('tab', { name: 'Sign Up' });
    expect(signIn).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).queryByLabelText('Name')).not.toBeInTheDocument();

    await user.click(signUp);
    expect(signUp).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByLabelText('Name')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Create account' })).toBeVisible();

    // Arrow keys move between the tabs.
    await user.keyboard('{ArrowLeft}');
    expect(signIn).toHaveAttribute('aria-selected', 'true');
    expect(signIn).toHaveFocus();
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

  it('has the logo as the Home link, and Dashboard and Component Library tabs with submenus from the site map', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    const user = userEvent.setup();
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'ForgeSpec, home' })).toHaveAttribute('href', '#top');
    expect(main().queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();

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

  it('sends guests to sign in for project pages, and Search components jumps to the library', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    const user = userEvent.setup();
    await user.click(main().getByRole('button', { name: 'Dashboard' }));
    await user.click(main().getByRole('button', { name: /^Your projects/ }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Sign in to open your projects.');
    await user.keyboard('{Escape}');

    await user.click(main().getByRole('button', { name: 'Component Library' }));
    await user.click(main().getByRole('button', { name: /^Search components/ }));
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveFocus();
  });
});

describe('hero', () => {
  it('has an Enter Workspace button that asks guests to sign in', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enter Workspace' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Sign in to enter your workspace.');
  });
});

describe('header search', () => {
  const field = () => screen.getByRole('combobox', { name: 'Search parts by part number' });

  it('"/" focuses it and lists sample parts, without calling the API', async () => {
    const search = vi.fn();
    render(<App api={fakeApi(search)} />);
    const user = userEvent.setup();
    await user.keyboard('/');
    await waitFor(() => expect(field()).toHaveFocus());
    expect(field()).toHaveAttribute('aria-expanded', 'true');
    const panel = within(screen.getByRole('dialog', { name: 'Part results' }));
    expect(panel.getByText('ATMEGA328P-AU')).toBeVisible();
    expect(search).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Part results' })).not.toBeInTheDocument();
  });

  it('shows live distributor results under the bar and opens a part to read its specs', async () => {
    const search = vi.fn().mockResolvedValue(found([esp]));
    render(<App api={fakeApi(search)} />);
    const user = userEvent.setup();
    await user.type(field(), 'esp32');
    const panel = within(screen.getByRole('dialog', { name: 'Part results' }));
    const row = await panel.findByRole('button', { name: /ESP32-WROOM-32\s*ESP32 module/ }, { timeout: 2000 });
    expect(search).toHaveBeenLastCalledWith({ q: 'esp32', limit: 12 });

    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(panel.getByText('"500mA"')).toBeVisible();
    expect(panel.getByText('0.5 A')).toBeVisible();

    await user.click(panel.getByRole('button', { name: 'Sign in to save' }));
    expect(await screen.findByRole('dialog', { name: 'Sign in to ForgeSpec' })).toHaveTextContent('Sign in to save parts to a project.');
  });

  it('walks the results with the arrow keys', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    const user = userEvent.setup();
    await user.click(field());
    await user.keyboard('{ArrowDown}');
    const items = within(screen.getByRole('dialog', { name: 'Part results' })).getAllByRole('button', { expanded: false });
    await waitFor(() => expect(items[0]).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(field()).toHaveFocus();
  });
});

describe('menu preview', () => {
  it('explains the hovered item in the preview area', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    const user = userEvent.setup();
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    await user.hover(nav.getByRole('button', { name: 'Dashboard' }));
    const panel = document.getElementById('sn-dashboard')!;
    const preview = within(panel.querySelector<HTMLElement>('.sn-preview')!);
    expect(preview.getByText('Your projects, and everything inside each one.')).toBeInTheDocument();

    await user.hover(within(panel).getByRole('button', { name: /^Sub-assemblies/ }));
    expect(preview.getByText('Sub-assemblies')).toBeInTheDocument();
    expect(preview.getByText(/drop it into any project as a single piece/)).toBeInTheDocument();
  });
});

describe('hero features', () => {
  it('shows one feature at a time and clicking another opens it; there is no pause button or timer line', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    const user = userEvent.setup();
    const list = within(screen.getByRole('list', { name: 'What you can do' }));
    expect(list.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-expanded', 'true');
    expect(list.getByRole('button', { name: 'Export' })).toHaveAttribute('aria-expanded', 'false');

    await user.click(list.getByRole('button', { name: 'Export' }));
    expect(list.getByRole('button', { name: 'Export' })).toHaveAttribute('aria-expanded', 'true');
    expect(list.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-expanded', 'false');
    expect(list.getByText('total $7.41')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /pause/i })).not.toBeInTheDocument();
  });
});

describe('walkthrough map', () => {
  it('has five stops on the road; clicking one makes it the active stop', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    const user = userEvent.setup();
    const stops = within(screen.getByRole('list', { name: 'Five steps' }));
    const names = ['Search the part', 'Specs arrive', 'The check fails', 'Fix it', 'Save a version'];
    names.forEach((n, i) => expect(stops.getByRole('button', { name: `${i + 1} ${n}` })).toBeInTheDocument());
    await user.click(stops.getByRole('button', { name: '3 The check fails' }));
    expect(stops.getByRole('button', { name: '3 The check fails' })).toHaveAttribute('aria-pressed', 'true');
    expect(stops.getByRole('button', { name: '1 Search the part' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('library section', () => {
  it('the Try part numbers search the library for that part', async () => {
    const search = vi.fn().mockResolvedValue(found([esp]));
    render(<App api={fakeApi(search)} />);
    const user = userEvent.setup();
    const tryRow = within(screen.getByRole('group', { name: 'Try a part number' }));
    await user.click(tryRow.getByRole('button', { name: 'BME280' }));
    expect(screen.getByRole('searchbox')).toHaveValue('BME280');
    await waitFor(() => expect(search).toHaveBeenLastCalledWith({ q: 'BME280', limit: 12 }), { timeout: 2000 });
  });

  it('has Browse parts as guest and Sign Up next to the heading', async () => {
    render(<App api={fakeApi(vi.fn())} />);
    const user = userEvent.setup();
    const section = within(document.getElementById('library')!);
    await user.click(section.getByRole('button', { name: 'Sign Up' }));
    expect(await screen.findByRole('dialog', { name: 'Create your account' })).toBeVisible();
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
