/**
 * Safe formula language for compatibility rules. No eval(): a small tokenizer,
 * recursive-descent parser and tree-walking evaluator.
 *
 *   a.output_voltage >= b.voltage_min and a.output_voltage <= b.voltage_max
 *   between(a.output_voltage, b.voltage_min, b.voltage_max)
 *   sum(b.current_max * b.quantity) <= a.output_current_max
 *
 * `a` is the item the rule is anchored to, `b` the item it is compared with.
 * Aggregates (sum, count, maxof, minof) iterate over every candidate `b`.
 */

export type Value = number | string | boolean;
export type Item = Record<string, Value | undefined>;

export class FormulaSyntaxError extends Error {}
export class FormulaEvalError extends Error {}
export class MissingAttributeError extends Error {
  constructor(public side: 'a' | 'b', public attr: string) {
    super(`${side}.${attr} is missing`);
  }
}

type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'ref'; side: 'a' | 'b'; attr: string }
  | { k: 'un'; op: '-' | 'not'; x: Node }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'call'; name: string; args: Node[] };

type Tok = { t: 'num' | 'str' | 'id' | 'op' | 'end'; v: string };

const MAX_LEN = 500;
const SCALAR_FNS: Record<string, { min: number; max: number }> = { abs: { min: 1, max: 1 }, min: { min: 2, max: 8 }, max: { min: 2, max: 8 }, between: { min: 3, max: 3 } };
const AGG_FNS: Record<string, { min: number; max: number }> = { sum: { min: 1, max: 1 }, count: { min: 0, max: 1 }, maxof: { min: 1, max: 1 }, minof: { min: 1, max: 1 } };

function tokenize(src: string): Tok[] {
  if (src.length > MAX_LEN) throw new FormulaSyntaxError(`formula is longer than ${MAX_LEN} characters`);
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/\d|\./.test(c) && !(c === '.' && !/\d/.test(src[i + 1] ?? ''))) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?|^\d+\.?/.exec(src.slice(i))!;
      toks.push({ t: 'num', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end === -1) throw new FormulaSyntaxError('unterminated string');
      toks.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      toks.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!='].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if ('<>+-*/(),.'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new FormulaSyntaxError(`unexpected character "${c}"`);
  }
  toks.push({ t: 'end', v: '' });
  return toks;
}

class Parser {
  private p = 0;
  private depth = 0;
  constructor(private toks: Tok[]) {}
  private peek() { return this.toks[this.p]; }
  private next() { return this.toks[this.p++]; }
  private isOp(v: string) { const t = this.peek(); return t.t === 'op' && t.v === v; }
  private isKw(v: string) { const t = this.peek(); return t.t === 'id' && t.v.toLowerCase() === v; }
  private expectOp(v: string) { if (!this.isOp(v)) throw new FormulaSyntaxError(`expected "${v}"`); this.p++; }

  parse(): Node {
    const n = this.or();
    if (this.peek().t !== 'end') throw new FormulaSyntaxError(`unexpected "${this.peek().v}"`);
    return n;
  }
  private or(): Node {
    let l = this.and();
    while (this.isKw('or')) { this.p++; l = { k: 'bin', op: 'or', l, r: this.and() }; }
    return l;
  }
  private and(): Node {
    let l = this.not();
    while (this.isKw('and')) { this.p++; l = { k: 'bin', op: 'and', l, r: this.not() }; }
    return l;
  }
  private not(): Node {
    if (this.isKw('not')) { this.p++; return { k: 'un', op: 'not', x: this.not() }; }
    return this.cmp();
  }
  private cmp(): Node {
    const l = this.add();
    const t = this.peek();
    if (t.t === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(t.v)) {
      this.p++;
      return { k: 'bin', op: t.v, l, r: this.add() };
    }
    return l;
  }
  private add(): Node {
    let l = this.mul();
    while (this.isOp('+') || this.isOp('-')) { const op = this.next().v; l = { k: 'bin', op, l, r: this.mul() }; }
    return l;
  }
  private mul(): Node {
    let l = this.unary();
    while (this.isOp('*') || this.isOp('/')) { const op = this.next().v; l = { k: 'bin', op, l, r: this.unary() }; }
    return l;
  }
  private unary(): Node {
    if (this.isOp('-')) { this.p++; return { k: 'un', op: '-', x: this.unary() }; }
    return this.primary();
  }
  private primary(): Node {
    if (++this.depth > 40) throw new FormulaSyntaxError('formula is nested too deeply');
    const t = this.next();
    let node: Node;
    if (t.t === 'num') node = { k: 'num', v: Number(t.v) };
    else if (t.t === 'str') node = { k: 'str', v: t.v };
    else if (t.t === 'op' && t.v === '(') { node = this.or(); this.expectOp(')'); }
    else if (t.t === 'id') {
      const low = t.v.toLowerCase();
      if (low === 'true' || low === 'false') node = { k: 'bool', v: low === 'true' };
      else if ((t.v === 'a' || t.v === 'b') && this.isOp('.')) {
        this.p++;
        const attr = this.next();
        if (attr.t !== 'id') throw new FormulaSyntaxError(`expected attribute name after ${t.v}.`);
        node = { k: 'ref', side: t.v, attr: attr.v };
      } else if (this.isOp('(')) {
        this.p++;
        const args: Node[] = [];
        if (!this.isOp(')')) {
          args.push(this.or());
          while (this.isOp(',')) { this.p++; args.push(this.or()); }
        }
        this.expectOp(')');
        const sig = SCALAR_FNS[low] ?? AGG_FNS[low];
        if (!sig) throw new FormulaSyntaxError(`unknown function "${t.v}"`);
        if (args.length < sig.min || args.length > sig.max) throw new FormulaSyntaxError(`${low}() takes ${sig.min === sig.max ? sig.min : `${sig.min}-${sig.max}`} argument(s)`);
        node = { k: 'call', name: low, args };
      } else throw new FormulaSyntaxError(`unknown identifier "${t.v}" (use a.<attribute> or b.<attribute>)`);
    } else throw new FormulaSyntaxError(t.t === 'end' ? 'unexpected end of formula' : `unexpected "${t.v}"`);
    this.depth--;
    return node;
  }
}

export function parseFormula(src: string): Node {
  if (!src.trim()) throw new FormulaSyntaxError('formula is empty');
  return new Parser(tokenize(src)).parse();
}

export type RuleKind = 'single' | 'pair' | 'aggregate';

export interface FormulaInfo {
  refs: { side: 'a' | 'b'; attr: string }[];
}

/** Static checks: syntax, which sides each rule kind may use, boolean result. */
export function validateFormula(kind: RuleKind, src: string, role: 'condition' | 'filter' = 'condition'): FormulaInfo {
  const ast = parseFormula(src);
  const refs: FormulaInfo['refs'] = [];
  const walk = (n: Node, inAgg: boolean) => {
    switch (n.k) {
      case 'ref':
        if (n.side === 'b') {
          if (kind === 'single') throw new FormulaSyntaxError('single-component rules cannot use b.*');
          if (kind === 'aggregate' && !inAgg && role === 'condition') throw new FormulaSyntaxError('in aggregate rules, b.* may only appear inside sum(), count(), maxof() or minof()');
        }
        refs.push({ side: n.side, attr: n.attr });
        return;
      case 'un': return walk(n.x, inAgg);
      case 'bin': walk(n.l, inAgg); walk(n.r, inAgg); return;
      case 'call': {
        const agg = n.name in AGG_FNS;
        if (agg && (kind !== 'aggregate' || role !== 'condition')) throw new FormulaSyntaxError(`${n.name}() is only allowed in aggregate rules`);
        if (agg && inAgg) throw new FormulaSyntaxError('aggregates cannot be nested');
        n.args.forEach((x) => walk(x, inAgg || agg));
        return;
      }
      default: return;
    }
  };
  walk(ast, false);
  const boolish = (n: Node): boolean =>
    n.k === 'bool' ||
    (n.k === 'un' && n.op === 'not') ||
    (n.k === 'bin' && ['<', '>', '<=', '>=', '==', '!=', 'and', 'or'].includes(n.op)) ||
    (n.k === 'call' && n.name === 'between');
  if (!boolish(ast)) throw new FormulaSyntaxError('formula must be a true/false condition, e.g. a.x <= b.y');
  return { refs };
}

export interface EvalCtx {
  a: Item;
  b?: Item;
  /** Candidates for aggregate functions. */
  bset?: Item[];
  /** Set when an aggregate skipped candidates with missing data. */
  incomplete?: boolean;
}

const EPS = 1e-9;

function asNum(v: Value, what: string): number {
  if (typeof v !== 'number') throw new FormulaEvalError(`${what} is not a number`);
  return v;
}

function ev(n: Node, ctx: EvalCtx): Value {
  switch (n.k) {
    case 'num':
    case 'str':
    case 'bool':
      return n.v;
    case 'ref': {
      const obj = n.side === 'a' ? ctx.a : ctx.b;
      if (!obj) throw new FormulaEvalError(`${n.side}.* is not available here`);
      const v = obj[n.attr];
      // "" is a legitimate value (e.g. the default rail); only absent attributes are missing.
      if (v === undefined || v === null) throw new MissingAttributeError(n.side, n.attr);
      return v;
    }
    case 'un': {
      const x = ev(n.x, ctx);
      if (n.op === 'not') return !asBool(x);
      return -asNum(x, 'operand of -');
    }
    case 'bin': {
      if (n.op === 'and') return asBool(ev(n.l, ctx)) && asBool(ev(n.r, ctx));
      if (n.op === 'or') {
        // A missing attribute on one side must not hide a true other side.
        try {
          if (asBool(ev(n.l, ctx))) return true;
        } catch (e) {
          if (!(e instanceof MissingAttributeError)) throw e;
          return asBool(ev(n.r, ctx)) ? true : rethrow(e);
        }
        return asBool(ev(n.r, ctx));
      }
      const l = ev(n.l, ctx);
      const r = ev(n.r, ctx);
      if (['+', '-', '*', '/'].includes(n.op)) {
        const x = asNum(l, 'left operand');
        const y = asNum(r, 'right operand');
        if (n.op === '+') return x + y;
        if (n.op === '-') return x - y;
        if (n.op === '*') return x * y;
        if (y === 0) throw new FormulaEvalError('division by zero');
        return x / y;
      }
      if (typeof l !== typeof r) throw new FormulaEvalError(`cannot compare ${typeof l} with ${typeof r}`);
      if (n.op === '==') return typeof l === 'number' ? Math.abs(l - (r as number)) <= EPS : l === r;
      if (n.op === '!=') return typeof l === 'number' ? Math.abs(l - (r as number)) > EPS : l !== r;
      if (typeof l !== 'number') throw new FormulaEvalError(`${n.op} needs numbers`);
      const y = r as number;
      if (n.op === '<') return l < y - EPS;
      if (n.op === '>') return l > y + EPS;
      if (n.op === '<=') return l <= y + EPS;
      return l >= y - EPS; // >=
    }
    case 'call':
      return call(n, ctx);
  }
}

function rethrow(e: unknown): never {
  throw e;
}

function asBool(v: Value): boolean {
  if (typeof v !== 'boolean') throw new FormulaEvalError('expected a true/false value');
  return v;
}

function call(n: Extract<Node, { k: 'call' }>, ctx: EvalCtx): Value {
  if (n.name in AGG_FNS) {
    const set = ctx.bset ?? [];
    const vals: number[] = [];
    for (const b of set) {
      if (n.name === 'count' && n.args.length === 0) { vals.push(1); continue; }
      try {
        const v = ev(n.args[0], { ...ctx, b });
        if (n.name === 'count') { if (asBool(v)) vals.push(1); } else vals.push(asNum(v, `${n.name}() argument`));
      } catch (e) {
        if (e instanceof MissingAttributeError) { ctx.incomplete = true; continue; }
        throw e;
      }
    }
    if (n.name === 'sum' || n.name === 'count') return vals.reduce((s, x) => s + x, 0);
    if (!vals.length) throw new FormulaEvalError(`${n.name}() has no data`);
    return n.name === 'maxof' ? Math.max(...vals) : Math.min(...vals);
  }
  const args = n.args.map((x) => asNum(ev(x, ctx), `${n.name}() argument`));
  switch (n.name) {
    case 'abs': return Math.abs(args[0]);
    case 'min': return Math.min(...args);
    case 'max': return Math.max(...args);
    default: // between(x, lo, hi)
      return args[0] >= args[1] - EPS && args[0] <= args[2] + EPS;
  }
}

export function evaluateFormula(src: string | Node, ctx: EvalCtx): boolean {
  const ast = typeof src === 'string' ? parseFormula(src) : src;
  return asBool(ev(ast, ctx));
}

export { Node as FormulaNode };
