import type { MenuVisualKind } from './menuMotion';

/**
 * The site map: every page, what it is for, and whether it needs an account.
 * The header mega menu and the footer both read it, so they always list the same pages.
 * Pages that are not built yet: guests are asked to sign in (they need an account anyway); signed-in users see "Soon".
 */

export interface SiteItem {
  label: string;
  /** One line that says what the page is for; shown in the preview. */
  desc: string;
  visual?: MenuVisualKind;
  onClick?: () => void;
  /** Needs an account (Dashboard, Project Workspace, Custom Part Creator). */
  login?: string;
  /** Page not built yet. */
  soon?: boolean;
  /** Indented under the item above, e.g. Compare Versions under Version History. */
  child?: boolean;
}
export interface SiteGroup {
  label: string;
  note?: string;
  items: SiteItem[];
}
export interface SiteMenu {
  id: string;
  label: string;
  intro: string;
  groups: SiteGroup[];
}

export function siteMenus(onLibrary: () => void): SiteMenu[] {
  const ws = 'Sign in to open your projects.';
  return [
    {
      id: 'dashboard',
      label: 'Dashboard',
      intro: 'Your projects, and everything inside each one.',
      groups: [
        {
          label: 'Projects',
          items: [
            { label: 'Your projects', desc: 'All your boards in one place. Each shows what it costs and whether it has a problem (the red light).', visual: 'projects', login: ws, soon: true },
            { label: 'Create new project', desc: 'Start a new, empty board and begin adding parts to it, or start from one of your templates.', visual: 'create', login: 'Sign in to create a project.', soon: true },
          ],
        },
        {
          label: 'Project workspace',
          note: 'Opens from a project',
          items: [
            { label: 'Component List (BOM)', desc: 'Every part on the board, listed with its quantity and price. This is your bill of materials (BOM).', visual: 'bom', login: ws, soon: true },
            { label: 'Version History', desc: 'Each time you save, a new version goes on top of the stack, like commits in Git. You can go back to any of them.', visual: 'history', login: ws, soon: true },
            { label: 'Compare Versions', desc: 'See exactly what changed between two versions: added parts in green, removed parts in red.', visual: 'diff', login: ws, soon: true, child: true },
            { label: 'Compatibility Report', desc: 'ForgeSpec checks every part against your power supply and the other parts. Green passes; red needs fixing before you buy.', visual: 'report', login: ws, soon: true },
            { label: 'Sub-assemblies', desc: 'Build a group of parts once, like a motor driver, then drop it into any project as a single piece.', visual: 'subassembly', login: ws, soon: true },
            { label: 'Export', desc: 'Turn the parts list into a CSV or PDF file, ready to send to a supplier.', visual: 'export', login: ws, soon: true },
          ],
        },
      ],
    },
    {
      id: 'library',
      label: 'Component Library',
      intro: 'Every part from the distributors. Guests can browse; saving needs an account.',
      groups: [
        {
          label: 'Browse',
          items: [
            { label: 'Search components', desc: 'Type a part number and matching parts come straight from the distributors. Open one to see its datasheet values; ForgeSpec turns text like "7V ~ 25V" into numbers it can check. No account needed.', visual: 'search', onClick: onLibrary },
          ],
        },
        {
          label: 'Your parts',
          items: [{ label: 'Custom Part Creator', desc: 'Can\'t find a part? Make your own: give it a shape, pins, a name and specs, and it is saved to your library.', visual: 'custom', login: 'Sign in to create a custom part.', soon: true }],
        },
      ],
    },
  ];
}
