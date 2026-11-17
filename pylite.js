/* PyLite: a small, sandboxed interpreter for a safe subset of Python, used for .la mods.
   No imports, files, network or system access. Execution is step- and size-limited. */
(function (root) {
'use strict';

class PyError extends Error {
  constructor(msg, line) { super(line ? 'Line ' + line + ': ' + msg : msg); this.rawMessage = msg; this.pyline = line || 0; }
}
const BLOCKED_KW = ['lambda', 'class', 'try', 'except', 'finally', 'with', 'raise', 'global', 'nonlocal', 'del', 'assert', 'yield', 'async', 'await'];
const RESERVED = new Set(['if', 'elif', 'else', 'for', 'while', 'in', 'def', 'return', 'pass', 'break', 'continue', 'import', 'from', 'and', 'or', 'not', 'is', 'as'].concat(BLOCKED_KW));
const MAX_STR = 10000, MAX_LIST = 10000;

/* ---------- tokenizer ---------- */
const RE_NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
const RE_NUM = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const OPS2 = ['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/='];
function tokenize(src) {
  const T = [], ind = [0], n = src.length;
  let i = 0, line = 1, depth = 0, atStart = true;
  const push = (t, v) => T.push({ t, v, line });
  function readString(pre) {
    const q = src[i], triple = src.substr(i, 3) === q + q + q, raw = pre.indexOf('r') >= 0;
    i += triple ? 3 : 1; let out = '';
    const map = { n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"', r: '\r', '0': '\0' };
    for (;;) {
      if (i >= n) throw new PyError('Unterminated string', line);
      const ch = src[i];
      if (triple) { if (src.substr(i, 3) === q + q + q) { i += 3; break; } }
      else if (ch === q) { i++; break; }
      else if (ch === '\n') throw new PyError('Unterminated string', line);
      if (ch === '\\' && !raw) {
        const nx = src[i + 1];
        if (nx === '\n') { i += 2; line++; continue; }
        if (nx !== undefined && Object.prototype.hasOwnProperty.call(map, nx)) { out += map[nx]; i += 2; continue; }
      }
      if (ch === '\n') line++;
      out += ch; i++;
      if (out.length > MAX_STR) throw new PyError('String is too long', line);
    }
    push(pre.indexOf('f') >= 0 ? 'fstr' : 'str', out);
  }
  while (i < n) {
    if (atStart && depth === 0) {
      let col = 0, j = i;
      while (j < n && (src[j] === ' ' || src[j] === '\t')) { col += src[j] === '\t' ? 4 : 1; j++; }
      if (j >= n) break;
      if (src[j] === '\n' || src[j] === '#' || src[j] === '\r') { while (j < n && src[j] !== '\n') j++; i = j + 1; line++; continue; }
      i = j;
      if (col > ind[ind.length - 1]) { ind.push(col); push('indent'); }
      else { while (col < ind[ind.length - 1]) { ind.pop(); push('dedent'); } if (col !== ind[ind.length - 1]) throw new PyError('Unindent does not match any outer indentation level', line); }
      atStart = false;
    }
    const c = src[i];
    if (c === '\n') { i++; if (depth === 0) { push('nl'); atStart = true; } line++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; line++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      RE_NUM.lastIndex = i; const m = RE_NUM.exec(src); push('num', parseFloat(m[0])); i += m[0].length; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      RE_NAME.lastIndex = i; const m = RE_NAME.exec(src)[0], q = src[i + m.length];
      if ((m === 'f' || m === 'F' || m === 'r' || m === 'R') && (q === '"' || q === "'")) { i += m.length; readString(m.toLowerCase()); continue; }
      push('name', m); i += m.length; continue;
    }
    if (c === '"' || c === "'") { readString(''); continue; }
    const two = src.substr(i, 2);
    if (OPS2.indexOf(two) >= 0) { push('op', two); i += 2; continue; }
    if ('+-*/%<>=()[]{},:.'.indexOf(c) >= 0) {
      if ('([{'.indexOf(c) >= 0) depth++; else if (')]}'.indexOf(c) >= 0) { depth--; if (depth < 0) throw new PyError('Unmatched "' + c + '"', line); }
      push('op', c); i++; continue;
    }
    throw new PyError('Unexpected character "' + c + '"', line);
  }
  if (depth !== 0) throw new PyError('Unclosed bracket', line);
  if (T.length && T[T.length - 1].t !== 'nl') push('nl');
  while (ind.length > 1) { ind.pop(); push('dedent'); }
  push('eof');
  return T;
}

/* ---------- parser ---------- */
function Parser(T) {
  let p = 0;
  const fail = (m, tok) => { throw new PyError(m, (tok || T[p]).line); };
  const isOp = v => T[p].t === 'op' && T[p].v === v;
  const isName = v => T[p].t === 'name' && T[p].v === v;
  const expectOp = v => { if (!isOp(v)) fail('Expected "' + v + '"'); return T[p++]; };
  const endLine = () => { if (T[p].t === 'nl') p++; else if (T[p].t !== 'eof' && T[p].t !== 'dedent') fail('Unexpected "' + (T[p].v === undefined ? T[p].t : T[p].v) + '"'); };

  function block() {
    if (T[p].t === 'nl') {
      p++; if (T[p].t !== 'indent') fail('Expected an indented block'); p++;
      const body = [];
      while (T[p].t !== 'dedent' && T[p].t !== 'eof') body.push(stmt());
      if (T[p].t === 'dedent') p++;
      return body;
    }
    return [simple()];
  }
  function stmt() {
    const t = T[p];
    if (t.t === 'indent') fail('Unexpected indent');
    if (t.t === 'name') {
      if (t.v === 'if' || t.v === 'elif') return ifStmt();
      if (t.v === 'for') {
        p++; const v = T[p]; if (v.t !== 'name' || RESERVED.has(v.v)) fail('Expected a loop variable'); p++;
        if (!isName('in')) fail('Expected "in"'); p++;
        const iter = expr(); expectOp(':'); return { k: 'for', v: v.v, iter, body: block(), line: t.line };
      }
      if (t.v === 'while') { p++; const cond = expr(); expectOp(':'); return { k: 'while', cond, body: block(), line: t.line }; }
      if (t.v === 'def') {
        p++; const nm = T[p]; if (nm.t !== 'name' || RESERVED.has(nm.v)) fail('Expected a function name'); p++;
        expectOp('('); const params = [];
        while (!isOp(')')) {
          const a = T[p]; if (a.t !== 'name' || RESERVED.has(a.v)) fail('Expected a parameter name'); p++;
          let d = null; if (isOp('=')) { p++; d = expr(); }
          params.push({ n: a.v, d }); if (isOp(',')) p++; else break;
        }
        expectOp(')'); expectOp(':'); return { k: 'def', name: nm.v, params, body: block(), line: t.line };
      }
    }
    return simple();
  }
  function ifStmt() {
    const t = T[p++]; const cond = expr(); expectOp(':'); const body = block(); let orelse = [];
    if (isName('elif')) orelse = [ifStmt()];
    else if (isName('else')) { p++; expectOp(':'); orelse = block(); }
    return { k: 'if', cond, body, orelse, line: t.line };
  }
  function simple() {
    const t = T[p];
    if (t.t === 'name') {
      if (BLOCKED_KW.indexOf(t.v) >= 0) fail('"' + t.v + '" is not allowed in .la mods');
      if (t.v === 'pass') { p++; endLine(); return { k: 'pass', line: t.line }; }
      if (t.v === 'break' || t.v === 'continue') { p++; endLine(); return { k: t.v, line: t.line }; }
      if (t.v === 'return') { p++; let v = null; if (T[p].t !== 'nl' && T[p].t !== 'eof') v = expr(); endLine(); return { k: 'return', v, line: t.line }; }
      if (t.v === 'import' || t.v === 'from') {
        p++;
        if (T[p].t === 'name' && T[p].v === 'lavo') { while (T[p].t !== 'nl' && T[p].t !== 'eof') p++; endLine(); return { k: 'pass', line: t.line }; }
        fail('Imports are not allowed in .la mods. Everything you need is built in.', t);
      }
    }
    const e = expr();
    if (isOp('=')) { p++; const v = expr(); endLine(); if (e.k !== 'name' && e.k !== 'index') fail('Cannot assign to this', t); return { k: 'assign', target: e, v, line: t.line }; }
    for (const op of ['+=', '-=', '*=', '/=']) {
      if (isOp(op)) { p++; const v = expr(); endLine(); if (e.k !== 'name' && e.k !== 'index') fail('Cannot assign to this', t); return { k: 'aug', op: op[0], target: e, v, line: t.line }; }
    }
    endLine(); return { k: 'expr', e, line: t.line };
  }
  function expr() {
    const a = orE();
    if (isName('if')) { const t = T[p++]; const c = orE(); if (!isName('else')) fail('Expected "else"'); p++; const b = expr(); return { k: 'tern', c, a, b, line: t.line }; }
    return a;
  }
  function orE() { let l = andE(); while (isName('or')) { const t = T[p++]; l = { k: 'or', l, r: andE(), line: t.line }; } return l; }
  function andE() { let l = notE(); while (isName('and')) { const t = T[p++]; l = { k: 'and', l, r: notE(), line: t.line }; } return l; }
  function notE() { if (isName('not')) { const t = T[p++]; return { k: 'not', e: notE(), line: t.line }; } return cmp(); }
  function cmp() {
    let l = add();
    for (;;) {
      const t = T[p]; let op = null;
      if (t.t === 'op' && ['==', '!=', '<', '>', '<=', '>='].indexOf(t.v) >= 0) { op = t.v; p++; }
      else if (isName('in')) { op = 'in'; p++; }
      else if (isName('not') && T[p + 1].t === 'name' && T[p + 1].v === 'in') { op = 'not in'; p += 2; }
      else if (isName('is')) { p++; if (isName('not')) { p++; op = 'is not'; } else op = 'is'; }
      else break;
      l = { k: 'cmp', op, l, r: add(), line: t.line };
    }
    return l;
  }
  function add() { let l = mul(); while (isOp('+') || isOp('-')) { const t = T[p++]; l = { k: 'bin', op: t.v, l, r: mul(), line: t.line }; } return l; }
  function mul() { let l = unary(); while (isOp('*') || isOp('/') || isOp('//') || isOp('%')) { const t = T[p++]; l = { k: 'bin', op: t.v, l, r: unary(), line: t.line }; } return l; }
  function unary() { if (isOp('-') || isOp('+')) { const t = T[p++]; return { k: 'neg', neg: t.v === '-', e: unary(), line: t.line }; } return power(); }
  function power() { const b = post(); if (isOp('**')) { const t = T[p++]; return { k: 'bin', op: '**', l: b, r: unary(), line: t.line }; } return b; }
  function post() {
    let e = atom();
    for (;;) {
      const t = T[p];
      if (isOp('(')) {
        p++; const args = [], kw = [];
        while (!isOp(')')) {
          if (T[p].t === 'name' && T[p + 1].t === 'op' && T[p + 1].v === '=') { const nm = T[p].v; p += 2; kw.push([nm, expr()]); }
          else { if (kw.length) fail('Positional argument after keyword argument'); args.push(expr()); }
          if (isOp(',')) p++; else break;
        }
        expectOp(')'); e = { k: 'call', f: e, args, kw, line: t.line };
      } else if (isOp('[')) {
        p++; const idx = expr(); if (isOp(':')) fail('Slices are not supported'); expectOp(']'); e = { k: 'index', o: e, i: idx, line: t.line };
      } else if (isOp('.')) {
        p++; const nm = T[p]; if (nm.t !== 'name') fail('Expected a method name'); p++; e = { k: 'attr', o: e, name: nm.v, line: t.line };
      } else break;
    }
    return e;
  }
  function atom() {
    const t = T[p];
    if (t.t === 'num') { p++; return { k: 'lit', v: t.v, line: t.line }; }
    if (t.t === 'str') { p++; return { k: 'lit', v: t.v, line: t.line }; }
    if (t.t === 'fstr') { p++; return { k: 'fstr', parts: parseF(t.v, t.line), line: t.line }; }
    if (t.t === 'name') {
      if (t.v === 'True') { p++; return { k: 'lit', v: true, line: t.line }; }
      if (t.v === 'False') { p++; return { k: 'lit', v: false, line: t.line }; }
      if (t.v === 'None') { p++; return { k: 'lit', v: null, line: t.line }; }
      if (RESERVED.has(t.v)) fail('Unexpected "' + t.v + '"');
      p++; return { k: 'name', n: t.v, line: t.line };
    }
    if (isOp('(')) {
      p++; if (isOp(')')) { p++; return { k: 'list', items: [], line: t.line }; }
      const e = expr();
      if (isOp(',')) { const items = [e]; while (isOp(',')) { p++; if (isOp(')')) break; items.push(expr()); } expectOp(')'); return { k: 'list', items, line: t.line }; }
      expectOp(')'); return e;
    }
    if (isOp('[')) {
      p++; const items = [];
      while (!isOp(']')) { items.push(expr()); if (isName('for')) fail('List comprehensions are not supported'); if (isOp(',')) p++; else break; }
      expectOp(']'); return { k: 'list', items, line: t.line };
    }
    if (isOp('{')) {
      p++; const pairs = [];
      while (!isOp('}')) { const key = expr(); expectOp(':'); pairs.push([key, expr()]); if (isOp(',')) p++; else break; }
      expectOp('}'); return { k: 'dict', pairs, line: t.line };
    }
    fail('Unexpected "' + (t.v === undefined ? t.t : t.v) + '"');
  }
  return {
    program() { const out = []; while (T[p].t !== 'eof') out.push(stmt()); return out; },
    expression() { const e = expr(); endLine(); if (T[p].t !== 'eof') fail('Unexpected "' + T[p].v + '"'); return e; }
  };
}
function parseF(text, line) {
  const parts = []; let i = 0, buf = '';
  while (i < text.length) {
    const c = text[i];
    if (c === '{' && text[i + 1] === '{') { buf += '{'; i += 2; continue; }
    if (c === '}' && text[i + 1] === '}') { buf += '}'; i += 2; continue; }
    if (c === '}') throw new PyError('Single "}" in f-string', line);
    if (c === '{') {
      if (buf) { parts.push(buf); buf = ''; }
      let d = 1, j = i + 1, q = null;
      while (j < text.length && d > 0) {
        const ch = text[j];
        if (q) { if (ch === q) q = null; }
        else if (ch === '"' || ch === "'") q = ch;
        else if ('([{'.indexOf(ch) >= 0) d++;
        else if (')]}'.indexOf(ch) >= 0) d--;
        else if ((ch === ':' || ch === '!') && d === 1 && text[j + 1] !== '=') throw new PyError('f-string format specs are not supported', line);
        if (d > 0) j++;
      }
      if (d > 0) throw new PyError('Unclosed "{" in f-string', line);
      const src = text.slice(i + 1, j);
      if (!src.trim()) throw new PyError('Empty expression in f-string', line);
      try { parts.push(Parser(tokenize(src.trim())).expression()); } catch (e) { throw new PyError(e.rawMessage || e.message, line); }
      i = j + 1; continue;
    }
    buf += c; i++;
  }
  if (buf) parts.push(buf);
  return parts;
}
function parse(src) { return Parser(tokenize(src)).program(); }

/* ---------- values ---------- */
const isNum = v => typeof v === 'number' || typeof v === 'boolean';
const num = v => typeof v === 'boolean' ? (v ? 1 : 0) : v;
const isDict = v => v instanceof Map;
const isFunc = v => v && typeof v === 'object' && v.k === 'func';
function typeName(v) { return v === null ? 'None' : typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'float') : typeof v === 'string' ? 'str' : Array.isArray(v) ? 'list' : isDict(v) ? 'dict' : 'function'; }
function numStr(v) { return !isFinite(v) ? (isNaN(v) ? 'nan' : v > 0 ? 'inf' : '-inf') : String(v); }
function repr(v) { return typeof v === 'string' ? "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'" : str(v, true); }
function str(v, inner) {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return numStr(v);
  if (typeof v === 'string') return inner ? repr(v) : v;
  if (Array.isArray(v)) return '[' + v.map(x => repr(x)).join(', ') + ']';
  if (isDict(v)) return '{' + Array.from(v.entries()).map(e => repr(e[0]) + ': ' + repr(e[1])).join(', ') + '}';
  return '<function>';
}
function truthy(v) { return !(v === null || v === false || v === 0 || v === '' || (Array.isArray(v) && !v.length) || (isDict(v) && !v.size)); }
function eq(a, b) {
  if (isNum(a) && isNum(b)) return num(a) === num(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
  return a === b;
}
function roundHalfEven(x, nd) { const f = Math.pow(10, nd || 0), y = x * f; let r = Math.round(y); if (Math.abs(y % 1) === 0.5 && r % 2 !== 0) r -= 1; return r / f; }

/* ---------- interpreter ---------- */
function Scope(parent) { this.vars = new Map(); this.parent = parent || null; }
Scope.prototype.lookup = function (n) { let s = this; while (s) { if (s.vars.has(n)) return s; s = s.parent; } return null; };

function interpret(prog, globalsObj, maxSteps) {
  const G = new Scope(null); let steps = 0, depth = 0;
  Object.keys(globalsObj).forEach(k => G.vars.set(k, globalsObj[k]));
  const tick = line => { if (++steps > maxSteps) throw new PyError('The mod ran for too long and was stopped.', line); };
  const E = (m, line) => new PyError(m, line);

  function iterable(v, line) {
    if (Array.isArray(v)) return v.slice();
    if (typeof v === 'string') return v.split('');
    if (isDict(v)) return Array.from(v.keys());
    throw E("'" + typeName(v) + "' object is not iterable", line);
  }
  function binop(op, a, b, line) {
    if (op === '+') {
      if (isNum(a) && isNum(b)) return num(a) + num(b);
      if (typeof a === 'string' && typeof b === 'string') { if (a.length + b.length > MAX_STR) throw E('String is too long', line); return a + b; }
      if (Array.isArray(a) && Array.isArray(b)) { if (a.length + b.length > MAX_LIST) throw E('List is too long', line); return a.concat(b); }
      throw E('Cannot add ' + typeName(a) + ' and ' + typeName(b), line);
    }
    if (op === '*') {
      if (isNum(a) && isNum(b)) return num(a) * num(b);
      const rep = (s, c) => { c = Math.floor(num(c)); if (c < 0) c = 0; return c; };
      if (typeof a === 'string' && isNum(b)) { const c = rep(a, b); if (a.length * c > MAX_STR) throw E('String is too long', line); return a.repeat(c); }
      if (isNum(a) && typeof b === 'string') { const c = rep(b, a); if (b.length * c > MAX_STR) throw E('String is too long', line); return b.repeat(c); }
      if (Array.isArray(a) && isNum(b)) { const c = rep(a, b); if (a.length * c > MAX_LIST) throw E('List is too long', line); let o = []; for (let i = 0; i < c; i++) o = o.concat(a); return o; }
      throw E('Cannot multiply ' + typeName(a) + ' and ' + typeName(b), line);
    }
    if (!isNum(a) || !isNum(b)) throw E('Unsupported operand types for ' + op + ': ' + typeName(a) + ' and ' + typeName(b), line);
    const x = num(a), y = num(b);
    switch (op) {
      case '-': return x - y;
      case '/': if (y === 0) throw E('Division by zero', line); return x / y;
      case '//': if (y === 0) throw E('Division by zero', line); return Math.floor(x / y);
      case '%': if (y === 0) throw E('Modulo by zero', line); return ((x % y) + y) % y;
      case '**': { if (Math.abs(y) > 100) throw E('Exponent too large', line); const r = Math.pow(x, y); if (!isFinite(r)) throw E('Result too large', line); return r; }
    }
    throw E('Unsupported operator ' + op, line);
  }
  function compare(op, a, b, line) {
    switch (op) {
      case '==': return eq(a, b);
      case '!=': return !eq(a, b);
      case 'is': return a === b;
      case 'is not': return a !== b;
      case 'in': case 'not in': {
        let r;
        if (typeof b === 'string') { if (typeof a !== 'string') throw E("'in <string>' requires a string", line); r = b.indexOf(a) >= 0; }
        else if (Array.isArray(b)) r = b.some(x => eq(x, a));
        else if (isDict(b)) r = b.has(a);
        else throw E("Argument of type '" + typeName(b) + "' is not iterable", line);
        return op === 'in' ? r : !r;
      }
    }
    let x, y;
    if (isNum(a) && isNum(b)) { x = num(a); y = num(b); }
    else if (typeof a === 'string' && typeof b === 'string') { x = a; y = b; }
    else throw E("Cannot compare '" + typeName(a) + "' and '" + typeName(b) + "'", line);
    switch (op) { case '<': return x < y; case '>': return x > y; case '<=': return x <= y; case '>=': return x >= y; }
    throw E('Bad comparison', line);
  }
  function index(o, i, line) {
    if (Array.isArray(o) || typeof o === 'string') {
      if (!isNum(i) || !Number.isInteger(num(i))) throw E('Indexes must be integers', line);
      let k = num(i); if (k < 0) k += o.length;
      if (k < 0 || k >= o.length) throw E('Index out of range', line);
      return o[k];
    }
    if (isDict(o)) { if (!o.has(i)) throw E('Key not found: ' + repr(i), line); return o.get(i); }
    throw E("'" + typeName(o) + "' object is not subscriptable", line);
  }
  function assignTo(t, v, sc) {
    if (t.k === 'name') { sc.vars.set(t.n, v); return; }
    const o = ev(t.o, sc), i = ev(t.i, sc);
    if (Array.isArray(o)) {
      if (!isNum(i) || !Number.isInteger(num(i))) throw E('Indexes must be integers', t.line);
      let k = num(i); if (k < 0) k += o.length; if (k < 0 || k >= o.length) throw E('Index out of range', t.line);
      o[k] = v; return;
    }
    if (isDict(o)) { if (typeof i !== 'string' && !isNum(i)) throw E('Dict keys must be text or numbers', t.line); o.set(i, v); return; }
    throw E('Item assignment is not supported here', t.line);
  }
  function method(o, name, args, line) {
    const need = n => { if (args.length < n) throw E(name + '() needs ' + n + ' argument(s)', line); };
    if (typeof o === 'string') {
      switch (name) {
        case 'lower': return o.toLowerCase();
        case 'upper': return o.toUpperCase();
        case 'strip': return o.trim();
        case 'startswith': need(1); return o.startsWith(String(args[0]));
        case 'endswith': need(1); return o.endsWith(String(args[0]));
        case 'replace': need(2); if (typeof args[0] !== 'string' || typeof args[1] !== 'string') throw E('replace() needs text', line); { const r = o.split(args[0]).join(args[1]); if (r.length > MAX_STR) throw E('String is too long', line); return r; }
        case 'split': { const r = args.length && typeof args[0] === 'string' ? o.split(args[0]) : o.trim().split(/\s+/).filter(Boolean); return r.slice(0, MAX_LIST); }
        case 'join': { need(1); const l = iterable(args[0], line); if (!l.every(x => typeof x === 'string')) throw E('join() needs a list of text', line); const r = l.join(o); if (r.length > MAX_STR) throw E('String is too long', line); return r; }
      }
    } else if (Array.isArray(o)) {
      if (name === 'append') { need(1); if (o.length >= MAX_LIST) throw E('List is too long', line); o.push(args[0]); return null; }
    } else if (isDict(o)) {
      if (name === 'get') { need(1); return o.has(args[0]) ? o.get(args[0]) : (args.length > 1 ? args[1] : null); }
      if (name === 'keys') return Array.from(o.keys());
      if (name === 'values') return Array.from(o.values());
    }
    throw E("'" + typeName(o) + "' object has no method '" + name + "'", line);
  }
  function callUser(f, args, kw, line) {
    if (++depth > 24) throw E('Too many nested calls', line);
    const sc = new Scope(G), d = f.def;
    d.params.forEach((pr, i) => {
      let v;
      if (i < args.length) v = args[i];
      else if (kw.has(pr.n)) v = kw.get(pr.n);
      else if (f.defaults[i] !== undefined) v = f.defaults[i];
      else throw E(d.name + '() missing argument "' + pr.n + '"', line);
      sc.vars.set(pr.n, v);
    });
    if (args.length > d.params.length) throw E(d.name + '() got too many arguments', line);
    const r = execBlock(d.body, sc); depth--;
    return r && r.t === 'return' ? r.v : null;
  }
  function ev(n, sc) {
    tick(n.line);
    switch (n.k) {
      case 'lit': return n.v;
      case 'name': { const s = sc.lookup(n.n); if (!s) throw E("Name '" + n.n + "' is not defined", n.line); return s.vars.get(n.n); }
      case 'fstr': { let o = ''; n.parts.forEach(pt => { o += typeof pt === 'string' ? pt : str(ev(pt, sc)); if (o.length > MAX_STR) throw E('String is too long', n.line); }); return o; }
      case 'list': return n.items.map(x => ev(x, sc));
      case 'dict': { const m = new Map(); n.pairs.forEach(pr => { const k = ev(pr[0], sc); if (typeof k !== 'string' && !isNum(k)) throw E('Dict keys must be text or numbers', n.line); m.set(k, ev(pr[1], sc)); }); return m; }
      case 'bin': return binop(n.op, ev(n.l, sc), ev(n.r, sc), n.line);
      case 'neg': { const v = ev(n.e, sc); if (!isNum(v)) throw E('Bad operand for unary ' + (n.neg ? '-' : '+'), n.line); return n.neg ? -num(v) : num(v); }
      case 'not': return !truthy(ev(n.e, sc));
      case 'and': { const l = ev(n.l, sc); return truthy(l) ? ev(n.r, sc) : l; }
      case 'or': { const l = ev(n.l, sc); return truthy(l) ? l : ev(n.r, sc); }
      case 'cmp': return compare(n.op, ev(n.l, sc), ev(n.r, sc), n.line);
      case 'tern': return truthy(ev(n.c, sc)) ? ev(n.a, sc) : ev(n.b, sc);
      case 'index': return index(ev(n.o, sc), ev(n.i, sc), n.line);
      case 'attr': throw E('Methods must be called, like text.lower()', n.line);
      case 'call': {
        const args = n.args.map(a => ev(a, sc)), kw = new Map(); n.kw.forEach(k => kw.set(k[0], ev(k[1], sc)));
        if (n.f.k === 'attr') { if (kw.size) throw E('Methods do not take keyword arguments', n.line); return method(ev(n.f.o, sc), n.f.name, args, n.line); }
        const f = ev(n.f, sc);
        if (typeof f === 'function') return f(args, kw, n.line);
        if (isFunc(f)) return callUser(f, args, kw, n.line);
        throw E("'" + typeName(f) + "' object is not callable", n.line);
      }
    }
    throw E('Unsupported expression', n.line);
  }
  function execBlock(body, sc) { for (const s of body) { const r = exec(s, sc); if (r) return r; } return undefined; }
  function loopBody(body, sc) { const r = execBlock(body, sc); if (r) { if (r.t === 'break') return 'b'; if (r.t === 'continue') return 'c'; return r; } return undefined; }
  function exec(s, sc) {
    tick(s.line);
    switch (s.k) {
      case 'pass': return undefined;
      case 'expr': ev(s.e, sc); return undefined;
      case 'assign': assignTo(s.target, ev(s.v, sc), sc); return undefined;
      case 'aug': assignTo(s.target, binop(s.op, ev(s.target, sc), ev(s.v, sc), s.line), sc); return undefined;
      case 'if': return execBlock(truthy(ev(s.cond, sc)) ? s.body : s.orelse, sc);
      case 'for': {
        for (const x of iterable(ev(s.iter, sc), s.line)) { sc.vars.set(s.v, x); const r = loopBody(s.body, sc); if (r === 'b') break; if (r === 'c') continue; if (r) return r; }
        return undefined;
      }
      case 'while': {
        while (truthy(ev(s.cond, sc))) { tick(s.line); const r = loopBody(s.body, sc); if (r === 'b') break; if (r === 'c') continue; if (r) return r; }
        return undefined;
      }
      case 'def': sc.vars.set(s.name, { k: 'func', def: s, defaults: s.params.map(pr => pr.d ? ev(pr.d, sc) : undefined) }); return undefined;
      case 'return': return { t: 'return', v: s.v ? ev(s.v, sc) : null };
      case 'break': return { t: 'break' };
      case 'continue': return { t: 'continue' };
    }
    throw E('Unsupported statement', s.line);
  }
  execBlock(prog, G);
}

/* ---------- mod runtime ---------- */
const SAFE = /^[A-Za-z0-9_\-.=:+,\/\\]+$/;
const BAD_ENV = ['PATH', 'PATHEXT', 'COMSPEC', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'HOME', 'LD_PRELOAD', 'LD_LIBRARY_PATH'];
const BAD_FLAG = ['+exec', '-exec', '+connect', '-connect', '+rcon', '-run', '-script', '-cmd', '-load', '-dll', '-inject', '-preload'];
const clampNum = (s, v) => { let n = parseFloat(v); if (!isFinite(n)) n = s.default; n = Math.min(s.max, Math.max(s.min, n)); return Math.round(n * 1000) / 1000; };

function runMod(code, ctx) {
  if (typeof code !== 'string') throw new PyError('Mod code must be text.');
  if (code.length > 65536) throw new PyError('The mod file is too large (64 KB max).');
  ctx = ctx || {}; const values = ctx.values || {};
  const res = { meta: { name: '', version: '1.0.0', author: '', description: '', games: null }, settings: [], args: [], env: {}, priority: '', logs: [] };
  const keys = new Set();
  const bind = (a, kw, names, req, line, fn) => {
    const out = names.map((nm, i) => i < a.length ? a[i] : (kw.has(nm) ? kw.get(nm) : undefined));
    kw.forEach((_, k) => { if (names.indexOf(k) < 0) throw new PyError(fn + "() got an unexpected argument '" + k + "'", line); });
    for (let i = 0; i < req; i++) if (out[i] === undefined) throw new PyError(fn + '() needs ' + names[i], line);
    if (a.length > names.length) throw new PyError(fn + '() got too many arguments', line);
    return out;
  };
  const text = (v, max, what, line) => { if (typeof v !== 'string') throw new PyError(what + ' must be text', line); if (v.length > max) throw new PyError(what + ' is too long (' + max + ' max)', line); return v; };
  const setting = (s, line) => {
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(s.key)) throw new PyError('Setting key "' + s.key + '" must be lowercase letters, numbers or underscores (24 max).', line);
    if (keys.has(s.key)) throw new PyError('Setting key "' + s.key + '" is used twice', line);
    if (res.settings.length >= 12) throw new PyError('A mod can have up to 12 settings', line);
    keys.add(s.key); res.settings.push(s);
  };
  const api = {
    name: (a, kw, l) => { res.meta.name = text(bind(a, kw, ['value'], 1, l, 'name')[0], 60, 'Name', l).trim(); return null; },
    version: (a, kw, l) => { const v = text(bind(a, kw, ['value'], 1, l, 'version')[0], 20, 'Version', l); if (!/^\d+(\.\d+){0,3}$/.test(v)) throw new PyError('Version must look like 1.0.0', l); res.meta.version = v; return null; },
    author: (a, kw, l) => { res.meta.author = text(bind(a, kw, ['value'], 1, l, 'author')[0], 40, 'Author', l); return null; },
    description: (a, kw, l) => { res.meta.description = text(bind(a, kw, ['value'], 1, l, 'description')[0], 300, 'Description', l); return null; },
    games: (a, kw, l) => {
      let list = a.length === 1 && Array.isArray(a[0]) ? a[0] : a;
      if (!list.length || list.length > 20) throw new PyError('games() needs 1 to 20 names, or "*"', l);
      res.meta.games = list.map(x => text(x, 60, 'A game name', l).trim()).filter(Boolean);
      if (!res.meta.games.length) throw new PyError('games() needs at least one name', l);
      return null;
    },
    number: (a, kw, l) => {
      const [key, label, mn, mx, df, st] = bind(a, kw, ['key', 'label', 'min', 'max', 'default', 'step'], 5, l, 'number');
      text(key, 24, 'Key', l); text(label, 40, 'Label', l);
      if (![mn, mx, df].every(isNum) || (st !== undefined && !isNum(st))) throw new PyError('number() needs numeric min, max, default and step', l);
      const s = { key, label, type: 'number', min: num(mn), max: num(mx), step: st === undefined ? 1 : num(st), default: num(df) };
      if (s.min >= s.max || s.step <= 0 || Math.abs(s.min) > 1e6 || Math.abs(s.max) > 1e6 || s.default < s.min || s.default > s.max) throw new PyError('number() "' + key + '": check min, max, default and step', l);
      setting(s, l); return values[key] === undefined ? s.default : clampNum(s, values[key]);
    },
    toggle: (a, kw, l) => {
      const [key, label, df] = bind(a, kw, ['key', 'label', 'default'], 3, l, 'toggle');
      text(key, 24, 'Key', l); text(label, 40, 'Label', l);
      if (typeof df !== 'boolean') throw new PyError('toggle() default must be True or False', l);
      setting({ key, label, type: 'toggle', default: df }, l); return values[key] === undefined ? df : !!values[key];
    },
    choice: (a, kw, l) => {
      const [key, label, options, df] = bind(a, kw, ['key', 'label', 'options', 'default'], 3, l, 'choice');
      text(key, 24, 'Key', l); text(label, 40, 'Label', l);
      if (!Array.isArray(options) || options.length < 2 || options.length > 10 || !options.every(x => typeof x === 'string' && x.length <= 30 && SAFE.test(x))) throw new PyError('choice() needs 2 to 10 short options (letters, numbers and - _ . only)', l);
      const d = options.indexOf(df) >= 0 ? df : options[0];
      setting({ key, label, type: 'choice', options: options.slice(), default: d }, l); return options.indexOf(values[key]) >= 0 ? values[key] : d;
    },
    arg: (a, kw, l) => {
      if (kw.size) throw new PyError('arg() does not take keyword arguments', l);
      a.forEach(v => {
        if (!(typeof v === 'string' || isNum(v))) throw new PyError('arg() needs text or numbers', l);
        const s = str(v);
        if (!s || s.length > 80 || !SAFE.test(s)) throw new PyError('Launch option "' + s + '" has characters that are not allowed', l);
        if (BAD_FLAG.indexOf(s.split('=')[0].toLowerCase()) >= 0) throw new PyError('Launch option "' + s + '" is blocked for safety', l);
        if (res.args.length >= 32) throw new PyError('Too many launch options (32 max)', l);
        res.args.push(s);
      });
      return null;
    },
    env: (a, kw, l) => {
      const [k, v] = bind(a, kw, ['key', 'value'], 2, l, 'env');
      const val = typeof v === 'string' || isNum(v) ? str(v) : null;
      if (typeof k !== 'string' || !/^[A-Z][A-Z0-9_]{0,31}$/.test(k) || BAD_ENV.indexOf(k) >= 0) throw new PyError('Environment name "' + str(k) + '" is not allowed', l);
      if (val === null || val.length > 80 || !SAFE.test(val)) throw new PyError('Environment value for ' + k + ' is not allowed', l);
      if (!(k in res.env) && Object.keys(res.env).length >= 8) throw new PyError('Too many environment values (8 max)', l);
      res.env[k] = val; return null;
    },
    priority: (a, kw, l) => {
      const v = bind(a, kw, ['level'], 1, l, 'priority')[0];
      if (['high', 'above_normal', 'normal'].indexOf(v) < 0) throw new PyError('priority() must be "high", "above_normal" or "normal"', l);
      res.priority = v === 'normal' ? '' : v; return null;
    },
    print: a => { res.logs.push(a.map(x => str(x)).join(' ').slice(0, 200)); return null; }
  };
  const builtins = {
    range: (a, kw, l) => {
      if (!a.length || a.length > 3 || !a.every(x => isNum(x) && Number.isInteger(num(x)))) throw new PyError('range() needs whole numbers', l);
      let s = 0, e, st = 1; if (a.length === 1) e = num(a[0]); else { s = num(a[0]); e = num(a[1]); if (a.length === 3) st = num(a[2]); }
      if (st === 0) throw new PyError('range() step cannot be zero', l);
      const o = []; for (let i = s; st > 0 ? i < e : i > e; i += st) { o.push(i); if (o.length > MAX_LIST) throw new PyError('range() is too large', l); } return o;
    },
    len: (a, kw, l) => { const v = a[0]; if (typeof v === 'string' || Array.isArray(v)) return v.length; if (isDict(v)) return v.size; throw new PyError('len() needs text, a list or a dict', l); },
    int: (a, kw, l) => { const v = a[0]; if (typeof v === 'string') { if (!/^\s*[+-]?\d+\s*$/.test(v)) throw new PyError('Cannot convert ' + repr(v) + ' to int', l); return parseInt(v, 10); } if (isNum(v)) return Math.trunc(num(v)); throw new PyError('int() needs text or a number', l); },
    float: (a, kw, l) => { const v = a[0]; if (typeof v === 'string') { if (!/^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v)) throw new PyError('Cannot convert ' + repr(v) + ' to float', l); return parseFloat(v); } if (isNum(v)) return num(v); throw new PyError('float() needs text or a number', l); },
    str: a => a.length ? str(a[0]) : '',
    bool: a => a.length ? truthy(a[0]) : false,
    abs: (a, kw, l) => { if (!isNum(a[0])) throw new PyError('abs() needs a number', l); return Math.abs(num(a[0])); },
    round: (a, kw, l) => { if (!isNum(a[0])) throw new PyError('round() needs a number', l); const nd = a.length > 1 ? num(a[1]) : 0; return roundHalfEven(num(a[0]), nd); },
    min: (a, kw, l) => { const l2 = a.length === 1 ? a[0] : a; if (!Array.isArray(l2) || !l2.length) throw new PyError('min() needs values', l); return l2.reduce((m, x) => compareLT(x, m, l) ? x : m); },
    max: (a, kw, l) => { const l2 = a.length === 1 ? a[0] : a; if (!Array.isArray(l2) || !l2.length) throw new PyError('max() needs values', l); return l2.reduce((m, x) => compareLT(m, x, l) ? x : m); },
    sum: (a, kw, l) => { if (!Array.isArray(a[0]) || !a[0].every(isNum)) throw new PyError('sum() needs a list of numbers', l); return a[0].reduce((s, x) => s + num(x), 0); },
    sorted: (a, kw, l) => { const v = a[0]; if (!Array.isArray(v)) throw new PyError('sorted() needs a list', l); return v.slice().sort((x, y) => compareLT(x, y, l) ? -1 : compareLT(y, x, l) ? 1 : 0); }
  };
  function compareLT(x, y, l) {
    if (isNum(x) && isNum(y)) return num(x) < num(y);
    if (typeof x === 'string' && typeof y === 'string') return x < y;
    throw new PyError('Cannot compare these values', l);
  }
  const globals = Object.assign({}, builtins, api, {
    game: ctx.game || '', engine: ctx.engine || 'unknown', platform: ctx.platform || 'web', source: ctx.source || ''
  });
  interpret(parse(code), globals, ctx.maxSteps || 60000);
  if (!res.meta.name) throw new PyError('The mod needs a name: add  name("My Mod")  at the top.');
  if (!res.meta.games) res.meta.games = ['*'];
  return res;
}

const api = { run: runMod, PyError, clampNum, parse };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PyLite = api;
})(typeof window !== 'undefined' ? window : globalThis);
