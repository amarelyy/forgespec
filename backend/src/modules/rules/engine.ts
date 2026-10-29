import {
  FormulaEvalError,
  FormulaNode,
  FormulaSyntaxError,
  Item,
  MissingAttributeError,
  evaluateFormula,
  parseFormula,
  RuleKind,
  validateFormula,
} from './expression';

export type Severity = 'error' | 'warning';

export interface RuleDef {
  id: string;
  name: string;
  description?: string;
  severity: Severity;
  kind: RuleKind;
  /** Filter on the anchor item `a`. Empty = every item. */
  applies_a: string;
  /** Filter on the compared item `b` (may reference `a`). Empty = every other item. */
  applies_b: string;
  formula: string;
}

/** An item as the rule engine sees it: BOM line + effective numeric specs flattened. */
export interface RuleItem extends Item {
  id: string;
}

export type ResultStatus = 'passed' | 'failed' | 'skipped';

export interface EvaluationResult {
  rule_id: string;
  rule_name: string;
  severity: Severity;
  status: ResultStatus;
  /** Items involved: [a] or [a, b]. Empty for rule-level passed/skipped rows. */
  item_ids: string[];
  /** Stable identity of a failure (rule + anchor [+ partner]) used to detect *new* errors across runs. */
  fingerprint: string;
  /** Attributes referenced by the formula, so the UI can highlight the conflicting fields. */
  attributes: string[];
  message: string;
}

export function validateRuleDef(rule: Pick<RuleDef, 'kind' | 'applies_a' | 'applies_b' | 'formula'>): string[] {
  const attrs = new Set<string>();
  try {
    validateFormula(rule.kind, rule.formula).refs.forEach((r) => attrs.add(r.attr));
    if (rule.applies_a.trim()) {
      const info = validateFormula(rule.kind, rule.applies_a, 'filter');
      if (info.refs.some((r) => r.side === 'b')) throw new FormulaSyntaxError('applies_a cannot use b.*');
    }
    if (rule.applies_b.trim()) {
      if (rule.kind === 'single') throw new FormulaSyntaxError('single-component rules have no applies_b');
      validateFormula(rule.kind, rule.applies_b, 'filter');
    }
  } catch (e) {
    if (e instanceof FormulaSyntaxError) return [e.message];
    throw e;
  }
  return [];
}

export function referencedAttributes(formula: string): string[] {
  try {
    return [...new Set(validateFormula('pair', formula.replace(/\b(sum|count|maxof|minof)\(/g, 'max(')).refs.map((r) => r.attr))];
  } catch {
    // Aggregate formulas fail the pair check; fall back to a plain scan.
    return [...new Set([...formula.matchAll(/\b[ab]\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))];
  }
}

const label = (i: RuleItem) => `${i.designator ? `${i.designator} ` : ''}${i.mpn ?? i.name ?? i.id}`;

function passes(filter: string | FormulaNode | null, a: RuleItem, b?: RuleItem): boolean {
  if (!filter) return true;
  try {
    return evaluateFormula(filter, { a, b });
  } catch (e) {
    // Filter cannot be decided (missing attribute): the rule does not apply to this item.
    if (e instanceof MissingAttributeError || e instanceof FormulaEvalError) return false;
    throw e;
  }
}

/**
 * Evaluate rules over a BOM. Failures are reported per offending item/pair;
 * rules that held produce one `passed` row, rules with nothing to evaluate one `skipped` row.
 */
export function runRules(items: RuleItem[], rules: RuleDef[]): EvaluationResult[] {
  const out: EvaluationResult[] = [];

  for (const rule of rules) {
    const attrs = referencedAttributes(rule.formula);
    const base = { rule_id: rule.id, rule_name: rule.name, severity: rule.severity, attributes: attrs };
    let formula: FormulaNode;
    let fa: FormulaNode | null;
    let fb: FormulaNode | null;
    try {
      formula = parseFormula(rule.formula);
      fa = rule.applies_a.trim() ? parseFormula(rule.applies_a) : null;
      fb = rule.applies_b.trim() ? parseFormula(rule.applies_b) : null;
    } catch (e) {
      out.push({ ...base, status: 'skipped', item_ids: [], fingerprint: `${rule.id}|`, message: `Rule is invalid: ${(e as Error).message}` });
      continue;
    }

    let evaluated = 0;
    let insufficient = 0;
    let failed = 0;

    const check = (a: RuleItem, b: RuleItem | undefined, bset: RuleItem[] | undefined) => {
      const ctx = { a, b, bset, incomplete: false };
      try {
        const ok = evaluateFormula(formula, ctx);
        if (ok) {
          if (ctx.incomplete) insufficient++;
          else evaluated++;
          return;
        }
        evaluated++;
        failed++;
        out.push({
          ...base,
          status: 'failed',
          fingerprint: `${rule.id}|${a.id}${rule.kind === 'pair' && b ? `|${b.id}` : ''}`,
          item_ids: b && rule.kind === 'pair' ? [a.id, b.id] : [a.id, ...(rule.kind === 'aggregate' && bset ? bset.map((x) => x.id) : [])],
          message:
            rule.kind === 'pair' && b
              ? `${rule.name}: ${label(a)} conflicts with ${label(b)} (${rule.formula})`
              : rule.kind === 'aggregate'
                ? `${rule.name}: ${label(a)} fails against ${bset?.length ?? 0} other component(s) (${rule.formula})${ctx.incomplete ? ' [some parts lack data]' : ''}`
                : `${rule.name}: ${label(a)} fails (${rule.formula})`,
        });
      } catch (e) {
        if (e instanceof MissingAttributeError || e instanceof FormulaEvalError) insufficient++;
        else throw e;
      }
    };

    const anchors = items.filter((a) => passes(fa, a));
    for (const a of anchors) {
      if (rule.kind === 'single') {
        check(a, undefined, undefined);
      } else if (rule.kind === 'pair') {
        for (const b of items) if (b.id !== a.id && passes(fb, a, b)) check(a, b, undefined);
      } else {
        const bset = items.filter((b) => b.id !== a.id && passes(fb, a, b));
        if (bset.length) check(a, undefined, bset);
      }
    }

    if (failed === 0) {
      if (evaluated > 0) out.push({ ...base, status: 'passed', item_ids: [], fingerprint: `${rule.id}|`, message: `${rule.name}: ${evaluated} check(s) passed` });
      else
        out.push({
          ...base,
          status: 'skipped',
          item_ids: [],
          fingerprint: `${rule.id}|`,
          message: insufficient ? `${rule.name}: ${insufficient} check(s) skipped, component data is incomplete` : `${rule.name}: not applicable to this BOM`,
        });
    }
  }
  return out;
}
