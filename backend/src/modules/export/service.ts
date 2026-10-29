import PDFDocument from 'pdfkit';
import { AppContext } from '../../context';
import { many, one } from '../../db/pool';
import { newId } from '../../lib/ids';
import { notFound } from '../../lib/errors';
import { audit } from '../audit/service';
import { BomRow, loadBomRows, unitPrice } from '../bom/rows';
import { effectiveSpecs } from '../components/specs';

export interface ExportOptions {
  format: 'csv' | 'pdf';
  include_deprecated: boolean;
  include_removed: boolean;
}

/** Spreadsheet apps execute cells starting with = + - @ as formulas; neutralise them. */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !(typeof v === 'number')) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const money = (n: number) => Math.round(n * 100) / 100;

function selectRows(rows: BomRow[], o: ExportOptions) {
  return rows.filter((r) => r.status === 'active' || (r.status === 'deprecated' && o.include_deprecated) || (r.status === 'removed' && o.include_removed));
}

export function buildCsv(rows: BomRow[]): string {
  const specKeys = [...new Set(rows.flatMap((r) => Object.keys(effectiveSpecs(r.component_specs, r.spec_overrides))))].sort();
  const header = ['Designator', 'MPN', 'Manufacturer', 'Name', 'Category', 'Package', 'Status', 'Rail', 'Quantity', 'Unit Price', 'Line Total', 'Supplier URL', 'Notes', ...specKeys];
  const lines = [header.map(cell).join(',')];
  let total = 0;
  for (const r of rows) {
    const price = unitPrice(r);
    const line = price === null ? null : money(price * r.quantity);
    if (r.status === 'active' && line !== null) total += line;
    const specs = effectiveSpecs(r.component_specs, r.spec_overrides);
    lines.push([r.designator, r.mpn, r.manufacturer, r.name, r.category, r.package_type, r.status, r.rail, r.quantity, price ?? '', line ?? '', r.supplier_url, r.notes, ...specKeys.map((k) => specs[k] ?? '')].map(cell).join(','));
  }
  const blanks = header.length - 11;
  lines.push(['', '', '', '', '', '', '', '', '', 'TOTAL (active)', money(total), ...Array(Math.max(blanks, 0)).fill('')].map(cell).join(','));
  return lines.join('\r\n') + '\r\n';
}

export function buildPdf(projectName: string, rows: BomRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(`Bill of Materials: ${projectName}`);
    doc.fontSize(9).fillColor('#555').text(`Generated ${new Date().toISOString().slice(0, 10)} by ForgeSpec`).fillColor('#000').moveDown();

    const cols = [
      { h: 'Ref', w: 60 }, { h: 'MPN', w: 130 }, { h: 'Manufacturer', w: 110 }, { h: 'Description', w: 220 },
      { h: 'Qty', w: 35 }, { h: 'Unit', w: 60 }, { h: 'Total', w: 65 },
    ];
    const row = (cells: string[], bold = false) => {
      if (doc.y > doc.page.height - 70) doc.addPage();
      const y = doc.y;
      let x = 40;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      cells.forEach((c, i) => { doc.text(c, x, y, { width: cols[i].w - 4, height: 11, ellipsis: true, lineBreak: false }); x += cols[i].w; });
      doc.y = y + 13;
    };
    row(cols.map((c) => c.h), true);
    let total = 0;
    for (const r of rows) {
      const price = unitPrice(r);
      const line = price === null ? null : money(price * r.quantity);
      if (r.status === 'active' && line !== null) total += line;
      row([r.designator, r.mpn, r.manufacturer, `${r.name}${r.status !== 'active' ? ` [${r.status}]` : ''}`, String(r.quantity), price === null ? '-' : price.toFixed(2), line === null ? '-' : line.toFixed(2)]);
    }
    doc.moveDown().font('Helvetica-Bold').fontSize(10).text(`Total (active items): ${total.toFixed(2)}`, 40);
    doc.end();
  });
}

export async function generateExport(ctx: AppContext, projectId: string, userId: string, opts: ExportOptions) {
  const project = await one<{ name: string }>(ctx.db, 'select name from projects where id = $1', [projectId]);
  if (!project) throw notFound('Project', 'PROJECT_NOT_FOUND');
  const rows = selectRows(await loadBomRows(ctx.db, projectId), opts);
  const body = opts.format === 'csv' ? Buffer.from('﻿' + buildCsv(rows), 'utf8') : await buildPdf(project.name, rows);

  const id = newId();
  const safe = project.name.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) || 'bom';
  const filename = `${safe}-bom-${new Date().toISOString().slice(0, 10)}.${opts.format}`;
  const key = `exports/${projectId}/${id}.${opts.format}`;
  const expires = new Date(Date.now() + ctx.config.exportTtlHours * 3_600_000);
  await ctx.storage.put(key, body);
  await ctx.db.query('insert into exports (id, project_id, created_by, format, filename, storage_key, expires_at) values ($1,$2,$3,$4,$5,$6,$7)', [id, projectId, userId, opts.format, filename, key, expires.toISOString()]);
  await audit(ctx.db, { projectId, userId, action: 'export.create', entity: 'export', entityId: id, detail: { format: opts.format, rows: rows.length } });
  return { id, filename, format: opts.format, expires_at: expires.toISOString(), item_count: rows.length, download_url: `/api/v1/exports/${id}/download` };
}

export async function fetchExport(ctx: AppContext, exportId: string) {
  const e = await one<{ project_id: string; format: string; filename: string; storage_key: string; expires_at: string }>(ctx.db, 'select * from exports where id = $1', [exportId]);
  if (!e) throw notFound('Export', 'EXPORT_NOT_FOUND');
  if (new Date(e.expires_at) < new Date()) throw notFound('Export (expired, generate it again)', 'EXPORT_EXPIRED');
  const data = await ctx.storage.get(e.storage_key);
  if (!data) throw notFound('Export file', 'EXPORT_NOT_FOUND');
  return { ...e, data };
}

/** TTL cleanup (Object Storage lifecycle). Run periodically from index.ts. */
export async function purgeExpiredExports(ctx: AppContext) {
  const expired = await many<{ id: string; storage_key: string }>(ctx.db, 'select id, storage_key from exports where expires_at < now()');
  for (const e of expired) {
    await ctx.storage.delete(e.storage_key);
    await ctx.db.query('delete from exports where id = $1', [e.id]);
  }
  return expired.length;
}
