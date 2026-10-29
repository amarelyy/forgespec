import { DistributorPart, DistributorProvider } from './provider';

const TOKEN_URL = 'https://identity.nexar.com/connect/token';
const GRAPHQL_URL = 'https://api.nexar.com/graphql';

const QUERY = `
query Search($q: String!, $limit: Int!) {
  supSearchMpn(q: $q, limit: $limit) {
    results {
      part {
        mpn
        manufacturer { name }
        shortDescription
        category { name }
        totalAvail
        medianPrice1000 { price }
        bestDatasheet { url }
        specs { attribute { name } displayValue }
      }
    }
  }
}`;

/**
 * Octopart/Nexar GraphQL provider.
 * NOTE: written from the public Nexar schema and NOT yet exercised against the live API
 * (no credentials in this repo). Verify the query shape with real credentials before relying on it.
 */
export class NexarProvider implements DistributorProvider {
  readonly name = 'nexar';
  private token?: { value: string; expiresAt: number };

  constructor(private clientId: string, private clientSecret: string, private timeoutMs = 8000) {}

  private async fetchJson(url: string, init: RequestInit) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (!res.ok) throw new Error(`Nexar responded ${res.status}`);
      return (await res.json()) as any;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: this.clientId, client_secret: this.clientSecret, scope: 'supply.domain' });
    const data = await this.fetchJson(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    this.token = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  async search(query: string, limit: number): Promise<DistributorPart[]> {
    const token = await this.getToken();
    const data = await this.fetchJson(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: QUERY, variables: { q: query, limit } }),
    });
    if (data.errors?.length) throw new Error(`Nexar GraphQL error: ${data.errors[0].message}`);
    const results: any[] = data.data?.supSearchMpn?.results ?? [];
    return results.map(({ part: p }) => {
      const raw_specs: Record<string, string> = {};
      for (const s of p.specs ?? []) if (s.attribute?.name && s.displayValue) raw_specs[s.attribute.name] = s.displayValue;
      return {
        mpn: p.mpn,
        manufacturer: p.manufacturer?.name ?? '',
        name: p.shortDescription ? `${p.mpn} ${p.shortDescription}`.slice(0, 120) : p.mpn,
        category: mapCategory(p.category?.name),
        description: p.shortDescription ?? '',
        package_type: raw_specs['Case/Package'] ?? raw_specs['Package / Case'] ?? '',
        datasheet_url: p.bestDatasheet?.url ?? '',
        lifecycle_status: 'unknown',
        stock: typeof p.totalAvail === 'number' ? p.totalAvail : null,
        price: p.medianPrice1000?.price ?? null,
        raw_specs,
      } satisfies DistributorPart;
    });
  }
}

/** Distributor categories are free text; collapse the ones rules care about. */
function mapCategory(name?: string): string {
  const n = (name ?? '').toLowerCase();
  if (/regulator|converter|power supply|pmic|power management/.test(n)) return 'power';
  if (/microcontroller|mcu|processor/.test(n)) return 'mcu';
  if (/sensor/.test(n)) return 'sensor';
  if (/display|led/.test(n)) return 'display';
  if (/motor|servo|actuator|relay/.test(n)) return 'actuator';
  if (/connector|header/.test(n)) return 'connector';
  if (/resistor|capacitor|inductor|passive/.test(n)) return 'passive';
  return 'ic';
}
