import type { HttpClient } from '../lib/http';
import type {
  AddItemInput, AttributeDef, AuditEntry, AuthSession, Backup, BomItem, BomTotals, BulkPatch, CompatibilityReport,
  Component, CustomPartInput, EvaluationSummary, ExportInfo, ExportOptions, ItemPatch, Member, Notification, ParsedQuantity,
  Project, Role, Rule, RuleBuilderMeta, RuleInput, SearchParams, SearchResult, SubAssembly, Template, User, VersionDiff,
  VersionSummary,
} from './types';

const p = (id: string) => `/projects/${encodeURIComponent(id)}`;

/**
 * One function per backend endpoint, grouped like the navigation menu.
 * Each function maps 1:1 to a route in backend/src/modules/**\/routes.ts.
 */
export function createEndpoints(http: HttpClient) {
  // ---- Authentication & Settings > Account Profile ----
  const auth = {
    async register(input: { email: string; name: string; password: string }) {
      const s = await http.post<AuthSession>('/auth/register', input);
      http.setSession(s);
      return s.user;
    },
    async login(input: { email: string; password: string }) {
      const s = await http.post<AuthSession>('/auth/login', input);
      http.setSession(s);
      return s.user;
    },
    async logout() {
      const t = http.tokens.get();
      try {
        if (t) await http.post('/auth/logout', { refresh_token: t.refreshToken });
      } finally {
        http.setSession(null);
      }
    },
    profile: () => http.get<{ user: User }>('/profile').then((r) => r.user),
    updateProfile: (input: { name?: string; current_password?: string; new_password?: string }) =>
      http.put<{ user: User }>('/profile', input).then((r) => r.user),
  };

  // ---- Dashboard ----
  const projects = {
    list: () => http.get<{ projects: Project[] }>('/projects').then((r) => r.projects),
    get: (id: string) => http.get<{ project: Project }>(p(id)).then((r) => r.project),
    create: (input: { name: string; description?: string; template_id?: string }) =>
      http.post<{ project: Project }>('/projects', input).then((r) => r.project),
    update: (id: string, input: { name?: string; description?: string }) =>
      http.put<{ project: Project }>(p(id), input).then((r) => r.project),
    remove: (id: string) => http.delete(p(id)),
    templates: () => http.get<{ templates: Template[] }>('/projects/templates').then((r) => r.templates),
    saveAsTemplate: (id: string, input: { name: string; description?: string }) =>
      http.post<{ template_id: string }>(`${p(id)}/template`, input).then((r) => r.template_id),
    deleteTemplate: (templateId: string) => http.delete(`/projects/templates/${encodeURIComponent(templateId)}`),
  };

  // ---- Workspace > Component List (BOM) ----
  const bom = {
    list: (projectId: string, opts: { includeRemoved?: boolean } = {}) =>
      http.get<{ items: BomItem[]; totals: BomTotals }>(`${p(projectId)}/components`, { include_removed: opts.includeRemoved }),
    /** Throws ApiError code COMPONENT_NOT_FOUND (details.suggestion = 'create_custom_part') when the MPN is unknown. */
    add: (projectId: string, input: AddItemInput) =>
      http.post<{ item: BomItem; summary: EvaluationSummary }>(`${p(projectId)}/components`, input),
    update: (projectId: string, itemId: string, patch: ItemPatch) =>
      http.patch<{ item: BomItem; summary: EvaluationSummary }>(`${p(projectId)}/components/${itemId}`, patch),
    bulkUpdate: (projectId: string, itemIds: string[], patch: BulkPatch) =>
      http.patch<{ updated: number; summary: EvaluationSummary }>(`${p(projectId)}/components/bulk`, { item_ids: itemIds, patch }),
    /** Soft delete by default (status "removed"); pass hard to delete the row. */
    remove: (projectId: string, itemId: string, opts: { hard?: boolean } = {}) =>
      http.delete<{ summary: EvaluationSummary }>(`${p(projectId)}/components/${itemId}`, { hard: opts.hard }),
    /** Unit parser manual override: replaces the parsed numeric value on this BOM line and re-evaluates rules. */
    overrideSpec: (projectId: string, itemId: string, key: string, value: number, unit?: string | null) =>
      http.put<{ item: BomItem; summary: EvaluationSummary }>(`${p(projectId)}/components/${itemId}/specs/${key}`, { value, unit }),
    clearOverride: (projectId: string, itemId: string, key: string) =>
      http.delete<{ item: BomItem; summary: EvaluationSummary }>(`${p(projectId)}/components/${itemId}/specs/${key}`),
  };

  // ---- Component Library (guest browse-only for search/detail) ----
  const library = {
    search: (params: SearchParams = {}) => http.get<SearchResult>('/components/search', { ...params }),
    get: (id: string) => http.get<{ component: Component }>(`/components/${id}`).then((r) => r.component),
    createCustom: (input: CustomPartInput) => http.post<{ component: Component }>('/components', input).then((r) => r.component),
    updateCustom: (id: string, input: Partial<CustomPartInput>) => http.put<{ component: Component }>(`/components/${id}`, input).then((r) => r.component),
    setCustomSpec: (id: string, key: string, value: number, unit?: string | null) =>
      http.put<{ component: Component }>(`/components/${id}/specs/${key}`, { value, unit }).then((r) => r.component),
    removeCustom: (id: string) => http.delete(`/components/${id}`),
    /** Live preview of the unit parser: "100mA" -> 0.1 A */
    parse: (raw: string, opts: { attribute?: string; mode?: 'quantity' | 'range' | 'dimensions' } = {}) =>
      http.post<ParsedQuantity>('/components/parse', { raw, ...opts }),
  };

  // ---- Rule Engine & Workspace > Compatibility ----
  const rules = {
    prebuilt: () => http.get<{ rules: Rule[] }>('/rules/prebuilt').then((r) => r.rules),
    builderMeta: () => http.get<RuleBuilderMeta>('/rules/attributes'),
    attributes: (): Promise<AttributeDef[]> => http.get<RuleBuilderMeta>('/rules/attributes').then((r) => r.attributes),
    forProject: (projectId: string) => http.get<{ prebuilt: Rule[]; custom: Rule[] }>(`${p(projectId)}/rules`),
    validate: (projectId: string, input: RuleInput) =>
      http.post<{ valid: boolean; errors: string[] }>(`${p(projectId)}/rules/custom/validate`, input),
    /** Saved rules are applied to the whole BOM immediately; the fresh report is returned. */
    createCustom: (projectId: string, input: RuleInput) =>
      http.post<{ rule: Rule; summary: EvaluationSummary; report: CompatibilityReport }>(`${p(projectId)}/rules/custom`, input),
    updateCustom: (projectId: string, ruleId: string, input: Partial<RuleInput>) =>
      http.put<{ rule: Rule; summary: EvaluationSummary }>(`${p(projectId)}/rules/custom/${ruleId}`, input),
    removeCustom: (projectId: string, ruleId: string) => http.delete<{ summary: EvaluationSummary }>(`${p(projectId)}/rules/custom/${ruleId}`),
    evaluate: (projectId: string) =>
      http.post<{ summary: EvaluationSummary; report: CompatibilityReport }>(`${p(projectId)}/compatibility/evaluate`),
    report: (projectId: string) => http.get<CompatibilityReport>(`${p(projectId)}/compatibility/report`),
  };

  // ---- Workspace > Version History / Compare Versions ----
  const versions = {
    list: (projectId: string) => http.get<{ versions: VersionSummary[] }>(`${p(projectId)}/versions`).then((r) => r.versions),
    commit: (projectId: string, summary?: string) =>
      http.post<{ version: { id: string; number: number; summary: string } }>(`${p(projectId)}/versions`, { summary }).then((r) => r.version),
    /** `from`/`to` are version ids, or "working" for the uncommitted BOM. */
    compare: (projectId: string, from: string, to: string) => http.get<VersionDiff>(`${p(projectId)}/versions/compare`, { from, to }),
  };

  // ---- Workspace > Sub-assemblies ----
  const subAssemblies = {
    list: () => http.get<{ sub_assemblies: SubAssembly[] }>('/sub-assemblies').then((r) => r.sub_assemblies),
    create: (projectId: string, input: { name: string; description?: string; item_ids: string[] }) =>
      http.post<{ sub_assembly_id: string; item_count: number }>(`${p(projectId)}/sub-assemblies`, input),
    importInto: (projectId: string, subAssemblyId: string) =>
      http.post<{ imported: number; summary: EvaluationSummary; report: CompatibilityReport }>(`${p(projectId)}/sub-assemblies/${subAssemblyId}/import`),
    remove: (id: string) => http.delete(`/sub-assemblies/${id}`),
  };

  // ---- Workspace > Export ----
  const exports = {
    generate: (projectId: string, opts: ExportOptions) =>
      http.post<{ export: ExportInfo }>(`${p(projectId)}/exports`, opts).then((r) => r.export),
    /** Returns the file as a Blob; the UI step decides how to save it. */
    download: (info: Pick<ExportInfo, 'download_url'>) => http.download(info.download_url),
  };

  // ---- Settings > Team Members & Roles, Audit log, Backup & restore ----
  const team = {
    members: (projectId: string) => http.get<{ members: Member[] }>(`${p(projectId)}/members`).then((r) => r.members),
    invite: (projectId: string, email: string, role: Role) => http.post<{ member: Member }>(`${p(projectId)}/members`, { email, role }).then((r) => r.member),
    setRole: (projectId: string, userId: string, role: Role) => http.patch(`${p(projectId)}/members/${userId}`, { role }),
    remove: (projectId: string, userId: string) => http.delete(`${p(projectId)}/members/${userId}`),
  };

  const audit = {
    list: (projectId: string, opts: { limit?: number; offset?: number } = {}) =>
      http.get<{ entries: AuditEntry[] }>(`${p(projectId)}/audit-log`, { ...opts }).then((r) => r.entries),
  };

  const backups = {
    list: (projectId: string) => http.get<{ backups: Backup[] }>(`${p(projectId)}/backups`).then((r) => r.backups),
    create: (projectId: string) => http.post<{ backup: Backup }>(`${p(projectId)}/backups`).then((r) => r.backup),
    restore: (projectId: string, backupId: string) =>
      http.post<{ restored_items: number; summary: EvaluationSummary }>(`${p(projectId)}/backups/${backupId}/restore`),
    remove: (projectId: string, backupId: string) => http.delete(`${p(projectId)}/backups/${backupId}`),
  };

  // ---- Notifications ----
  const notifications = {
    list: (opts: { unread?: boolean; limit?: number; offset?: number } = {}) =>
      http.get<{ notifications: Notification[] }>('/notifications', { ...opts, unread: opts.unread ? 'true' : undefined }).then((r) => r.notifications),
    unreadCount: () => http.get<{ unread: number }>('/notifications/unread-count').then((r) => r.unread),
    markRead: (id: string) => http.patch(`/notifications/${id}/read`),
    markAllRead: () => http.post('/notifications/read-all'),
  };

  return { auth, projects, bom, library, rules, versions, subAssemblies, exports, team, audit, backups, notifications };
}

export type ForgeSpecEndpoints = ReturnType<typeof createEndpoints>;
