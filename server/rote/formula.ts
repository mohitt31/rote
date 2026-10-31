import { cell, type Cell, type Row } from "../../shared/rote/model.js";
// Deliberately tiny grammar: literals, [column], + - * /, unary -, parentheses.
// + concatenates only when both operands are strings. No calls or property access.
type Expr = (row: Row) => Cell;
export function compileFormula(source: string, columns: string[]): Expr {
  let pos = 0,
    depth = 0;
  const ws = () => {
    while (/\s/.test(source[pos] ?? "") && pos < source.length) pos++;
  };
  const fail = (): never => {
    throw Error(`Invalid formula near character ${pos + 1}`);
  };
  function atom(): Expr {
    ws();
    if (++depth > 30) throw Error("Formula nesting exceeds 30");
    let out: Expr;
    if (source[pos] === "-") {
      pos++;
      const a = atom();
      out = (r) => -numeric(a(r));
    } else if (source[pos] === "(") {
      pos++;
      out = expression();
      ws();
      if (source[pos++] !== ")") fail();
    } else if (source[pos] === "[") {
      const end = source.indexOf("]", ++pos);
      if (end < 0) fail();
      const c = source.slice(pos, end);
      if (!columns.includes(c)) throw Error(`Unknown column: ${c}`);
      pos = end + 1;
      out = (r) => cell(r, c);
    } else if (source[pos] === '"') {
      const m = source.slice(pos).match(/^"(?:[^"\\]|\\["\\nrt])*"/);
      if (!m) return fail();
      pos += m[0].length;
      const value = JSON.parse(m[0]) as string;
      out = () => value;
    } else {
      const m = source.slice(pos).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (!m) return fail();
      pos += m[0].length;
      const n = Number(m[0]);
      if (!Number.isFinite(n)) fail();
      out = () => n;
    }
    depth--;
    return out;
  }
  function term(): Expr {
    let lhs = atom();
    while (true) {
      ws();
      const op = source[pos];
      if (op !== "*" && op !== "/") return lhs;
      pos++;
      const a = lhs,
        b = atom();
      lhs = (r) => {
        const x = numeric(a(r)),
          y = numeric(b(r));
        if (op === "/" && y === 0) throw Error("Division by zero");
        return finite(op === "*" ? x * y : x / y);
      };
    }
  }
  function expression(): Expr {
    let lhs = term();
    while (true) {
      ws();
      const op = source[pos];
      if (op !== "+" && op !== "-") return lhs;
      pos++;
      const a = lhs,
        b = term();
      lhs = (r) => {
        const x = a(r),
          y = b(r);
        if (op === "+" && typeof x === "string" && typeof y === "string")
          return x + y;
        return finite(
          op === "+" ? numeric(x) + numeric(y) : numeric(x) - numeric(y),
        );
      };
    }
  }
  const result = expression();
  ws();
  if (pos !== source.length) fail();
  return result;
}
export function numeric(value: Cell): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw Error("Expected a finite number");
  return value;
}
function finite(n: number) {
  if (!Number.isFinite(n)) throw Error("Non-finite arithmetic result");
  return n;
}
