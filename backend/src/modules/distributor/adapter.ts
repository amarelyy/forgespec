import { Db, json, many, one } from '../../db/pool';
import { HttpError } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { ComponentRow } from '../components/service';
import { buildSpecs } from '../components/specs';
import { DistributorPart, DistributorProvider } from './provider';

/**
 * Distributor Adapter (Integration Layer). The only place that talks to third-party APIs:
 * caching, rate limiting, error mapping and normalisation live here, and results are
 * persisted as shared `source = 'api'` components.
 */
export class DistributorAdapter {
  private cache = new Map<string, { at: number; parts: DistributorPart[] }>();
  private calls: number[] = [];

  constructor(
    private db: Db,
    private provider: DistributorProvider,
    private opts = { cacheTtlMs: 10 * 60_000, maxCallsPerMinute: 30 },
  ) {}

  get providerName() {
    return this.provider.name;
  }

  private async fetchParts(query: string, limit: number): Promise<DistributorPart[]> {
    const key = `${query.toLowerCase()}|${limit}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.opts.cacheTtlMs) return hit.parts;

    const now = Date.now();
    this.calls = this.calls.filter((t) => now - t < 60_000);
    if (this.calls.length >= this.opts.maxCallsPerMinute) {
      throw new HttpError(429, 'DISTRIBUTOR_RATE_LIMITED', 'Too many distributor lookups, try again in a minute');
    }
    this.calls.push(now);

    try {
      const parts = await this.provider.search(query, limit);
      this.cache.set(key, { at: now, parts });
      return parts;
    } catch (e) {
      console.error(`[distributor:${this.provider.name}]`, (e as Error).message);
      throw new HttpError(502, 'DISTRIBUTOR_UNAVAILABLE', 'Distributor lookup failed, you can still create a custom part');
    }
  }

  /** Search the distributor and upsert every hit into the shared component table. */
  async search(query: string, limit = 10): Promise<ComponentRow[]> {
    const parts = await this.fetchParts(query, limit);
    const rows: ComponentRow[] = [];
    for (const p of parts) rows.push(await this.upsert(p));
    return rows;
  }

  /** Exact (case-insensitive) MPN lookup used when adding a part to a BOM by part number. */
  async findByMpn(mpn: string): Promise<ComponentRow | undefined> {
    const rows = await this.search(mpn, 5);
    return rows.find((r) => r.mpn.toLowerCase() === mpn.trim().toLowerCase());
  }

  private async upsert(p: DistributorPart): Promise<ComponentRow> {
    const specs = buildSpecs(p.raw_specs);
    const existing = await one<ComponentRow>(
      this.db,
      `select * from components where source = 'api' and lower(mpn) = $1 and lower(manufacturer) = $2`,
      [p.mpn.toLowerCase(), p.manufacturer.toLowerCase()],
    );
    if (existing) {
      const rows = await many<ComponentRow>(
        this.db,
        `update components set name=$2, category=$3, description=$4, package_type=$5, datasheet_url=$6,
           lifecycle_status=$7, stock=$8, price=$9, specs=$10::jsonb, updated_at=now() where id=$1 returning *`,
        [existing.id, p.name, p.category, p.description, p.package_type, p.datasheet_url, p.lifecycle_status, p.stock, p.price, json(specs)],
      );
      return rows[0];
    }
    const rows = await many<ComponentRow>(
      this.db,
      `insert into components (id, source, mpn, manufacturer, name, category, description, package_type, datasheet_url, lifecycle_status, stock, price, specs)
       values ($1,'api',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) returning *`,
      [newId(), p.mpn, p.manufacturer, p.name, p.category, p.description, p.package_type, p.datasheet_url, p.lifecycle_status, p.stock, p.price, json(specs)],
    );
    return rows[0];
  }
}
