// =============================================================================
// Rules Engine — Expression language
// -----------------------------------------------------------------------------
// A small, safe, JSON-encoded boolean/value expression language (a lean subset
// of the JsonLogic idea). It is DATA, so rules can be authored in the Journey
// Builder, stored in the DB, versioned, and evaluated identically on the client
// (for conditional visibility) and the server (for authoritative scoring &
// qualification). No `eval`, no code — just a typed evaluator.
//
// Grammar (recursive):
//   literal        -> string | number | boolean | null
//   { var: key }   -> read a variable/answer from the context by key
//   { "==":  [a,b] } { "!=": [a,b] }
//   { ">":  [a,b] } { ">=": [a,b] } { "<": [a,b] } { "<=": [a,b] }
//   { and: [..] }  { or: [..] }     { not: expr }
//   { in: [val, array] }            { contains: [array, val] }
//   { empty: expr }  { present: expr }
// =============================================================================

import { z } from "zod";

export type Scalar = string | number | boolean | null;

// Zod cannot easily express the full recursive union with good ergonomics and
// still stay fast, so we validate shape loosely and rely on the evaluator to be
// total (never throws) over arbitrary JSON.
export const expressionSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown()), z.record(z.unknown())]),
);

export type Expression = unknown;
export type EvalContext = Record<string, unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (isRecord(v)) return Object.keys(v).length === 0;
  return false;
}

/**
 * Evaluate an expression against a context. Total function: on any malformed
 * input it returns `undefined` rather than throwing, so a bad rule can never
 * crash a live journey.
 */
export function evaluate(expr: Expression, ctx: EvalContext): unknown {
  // literals
  if (expr === null || typeof expr !== "object") return expr;
  if (Array.isArray(expr)) return expr.map((e) => evaluate(e, ctx));
  if (!isRecord(expr)) return undefined;

  const keys = Object.keys(expr);
  if (keys.length !== 1) return undefined;
  const op = keys[0]!;
  const raw = expr[op];
  const args = Array.isArray(raw) ? raw.map((a) => evaluate(a, ctx)) : [evaluate(raw, ctx)];
  const [a, b] = args;

  switch (op) {
    case "var": {
      const key = typeof raw === "string" ? raw : String(a);
      return ctx[key];
    }
    case "==":
      return a === b || String(a) === String(b);
    case "!=":
      return !(a === b || String(a) === String(b));
    case ">":
      return toNumber(a) > toNumber(b);
    case ">=":
      return toNumber(a) >= toNumber(b);
    case "<":
      return toNumber(a) < toNumber(b);
    case "<=":
      return toNumber(a) <= toNumber(b);
    case "and":
      return args.every(Boolean);
    case "or":
      return args.some(Boolean);
    case "not":
      return !a;
    case "in":
      return Array.isArray(b) ? b.some((x) => x === a || String(x) === String(a)) : false;
    case "contains":
      return Array.isArray(a) ? a.some((x) => x === b || String(x) === String(b)) : false;
    case "empty":
      return isEmpty(a);
    case "present":
      return !isEmpty(a);
    default:
      return undefined;
  }
}

/** Coerce an expression's result to a boolean for gating (visibility/logic). */
export function evaluateBoolean(expr: Expression | undefined, ctx: EvalContext): boolean {
  if (expr === undefined) return true; // no condition => always true
  return Boolean(evaluate(expr, ctx));
}
