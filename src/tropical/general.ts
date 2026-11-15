/**
 * The general attack — Kotov and Ushakov section 3.
 *
 * Unlike the heuristic, this one does not care how the parameters were chosen.
 * The paper reports 100 percent across all three of its parameter rows.
 *
 * ── The system ──
 * Look for X = ⊕ x_i ⊗ A^⊗i and Y = ⊕ y_j ⊗ B^⊗j with i, j in [0, D]. Any such
 * X commutes with A and any such Y commutes with B automatically, so the first
 * two break conditions are free and only X ⊗ Y = U has to be solved. Writing it
 * out:
 *
 *     X ⊗ Y = ⊕_{i,j} (x_i + y_j) ⊗ A^⊗i ⊗ B^⊗j
 *
 * so with T^ij = A^⊗i ⊗ B^⊗j − U the condition X ⊗ Y = U becomes, cell by cell,
 *
 *     min_{i,j} ( x_i + y_j + T^ij_{kl} ) = 0   for every cell (k, l).
 *
 * Let m_ij be the least entry of T^ij and P_ij the set of cells attaining it.
 * The system holds exactly when
 *
 *   (a) x_i + y_j ≥ −m_ij for every i, j          (nothing dips below zero), and
 *   (b) the pairs where equality holds have their P_ij covering every cell
 *       (every cell is actually reached).
 *
 * So the search is: choose a cover C of the cell grid from the sets P_ij, then
 * decide the system that forces equality on C and inequality elsewhere.
 *
 * ── How the system is decided here ──
 * The paper uses the simplex method. It does not need to. Substituting
 * w_j = −y_j turns every constraint into a DIFFERENCE constraint:
 *
 *     x_i + y_j ≥ −m_ij        becomes    w_j − x_i ≤  m_ij
 *     x_i + y_j  = −m_ij       adds       x_i − w_j ≤ −m_ij
 *
 * and a system of difference constraints is exactly what Bellman–Ford decides,
 * on a graph with one node per variable — 2(D+1) nodes, so 22 at the protocol's
 * own degree bound. It is feasible iff the graph has no negative cycle, and the
 * shortest-path distances ARE a solution, in integers, with no LP library and
 * no floating-point tolerance anywhere. (Cormen, Leiserson, Rivest and Stein,
 * which the paper cites for simplex, gives this reduction in its shortest-paths
 * chapter.) The README says which route this lab took.
 *
 * ── Honesty about the cover search ──
 * Enumerating minimal covers is set cover, which is NP-complete in general —
 * the paper says so. It was easy on every random instance it tried, and it is
 * easy here: at every preset this lab offers, the FIRST cover tried has been
 * the one that works. That is an observation about these instances, not a
 * complexity claim, and the page says so. The search carries a budget anyway,
 * and reports "not recovered within budget" rather than silently returning
 * nothing.
 */

import {
  INF,
  matAdd,
  matEq,
  matMul,
  powers,
  scalarMul,
  type Matrix,
  type Trop,
} from './tropical.js';
import type { PublicTranscript } from './protocol.js';

/** One (i, j) term of the search: its T^ij minimum and where that minimum sits. */
export interface TermData {
  readonly i: number;
  readonly j: number;
  /** m_ij, the least entry of T^ij = A^⊗i ⊗ B^⊗j − U. */
  readonly m: Trop;
  /** P_ij as flat cell indices (row * n + column). */
  readonly cells: readonly number[];
}

export interface GeneralResult {
  readonly status: 'solved' | 'no-solution' | 'budget-exhausted';
  /** x_0 … x_D, lowest degree first. */
  readonly x: readonly Trop[] | null;
  /** y_0 … y_D. */
  readonly y: readonly Trop[] | null;
  readonly xMatrix: Matrix | null;
  readonly yMatrix: Matrix | null;
  /** The (i, j) pairs whose P_ij were forced to equality. */
  readonly cover: readonly { i: number; j: number }[];
  /** How many complete covers were tested. */
  readonly coversTested: number;
  /** The budget it was tested against, so the page can show it. */
  readonly budget: number;
  /** Every term's m_ij and P_ij, for the exhibit. */
  readonly terms: readonly TermData[];
}

/** How many complete covers to test before giving up. */
export const DEFAULT_COVER_BUDGET = 2000;

/**
 * Run the general attack against a public transcript.
 *
 * SIGNATURE IS THE INVARIANT, as in `heuristicAttack`: a `PublicTranscript`
 * holds A, B, U and V, and nothing else, so no secret can reach this code.
 */
export function generalAttack(
  transcript: PublicTranscript,
  maxDegree: number,
  budget = DEFAULT_COVER_BUDGET,
): GeneralResult {
  const { a, b, u } = transcript;
  const n = u.length;
  const cellCount = n * n;
  const aPowers = powers(a, maxDegree);
  const bPowers = powers(b, maxDegree);

  // T^ij = A^⊗i ⊗ B^⊗j − U, reduced to (m_ij, P_ij). U is always finite — it is
  // a product of two polynomial evaluations — so this subtraction never meets
  // the infinity-minus-infinity case even at i = j = 0, where the first operand
  // is the identity. The INF entries there simply stay INF and lose the min.
  const terms: TermData[] = [];
  for (let i = 0; i <= maxDegree; i++) {
    for (let j = 0; j <= maxDegree; j++) {
      const product = matMul(aPowers[i], bPowers[j]);
      let m = INF;
      let cells: number[] = [];
      for (let r = 0; r < n; r++) {
        for (let s = 0; s < n; s++) {
          const t = product[r][s] - u[r][s];
          if (t < m) {
            m = t;
            cells = [r * n + s];
          } else if (t === m) {
            cells.push(r * n + s);
          }
        }
      }
      terms.push({ i, j, m, cells });
    }
  }

  // A term whose minimum is +infinity contributes no finite constraint and can
  // cover nothing; it is dropped rather than carried into the graph, where it
  // would make every distance infinite.
  const usable = terms.filter((t) => Number.isFinite(t.m));

  const nodeCount = 2 * (maxDegree + 1);
  // The inequality edges, present for every usable term regardless of the cover:
  // w_j − x_i ≤ m_ij, i.e. an edge x_i → w_j of weight m_ij.
  const baseEdges: [number, number, number][] = usable.map((t) => [
    t.i,
    maxDegree + 1 + t.j,
    t.m,
  ]);

  /**
   * Bellman–Ford over the difference constraints.
   *
   * All distances start at 0 rather than at a single source: that is the
   * standard trick for a constraint system with no source node, equivalent to
   * adding a zero-weight edge from a virtual source to every variable. Returns
   * the distance vector (a feasible assignment) or null on a negative cycle
   * (infeasible).
   */
  const solve = (cover: readonly TermData[]): number[] | null => {
    const edges = baseEdges.slice();
    for (const t of cover) edges.push([maxDegree + 1 + t.j, t.i, -t.m]);
    const dist = new Array<number>(nodeCount).fill(0);
    for (let round = 0; round < nodeCount; round++) {
      let changed = false;
      for (const [from, to, weight] of edges) {
        if (dist[from] + weight < dist[to]) {
          dist[to] = dist[from] + weight;
          changed = true;
        }
      }
      if (!changed) return dist;
    }
    // One more relaxation still improves something: a negative cycle, so the
    // equalities on this cover contradict the inequalities. Try another cover.
    return null;
  };

  // For each cell, the terms that could cover it, widest coverage first. The
  // paper notes that a workable cover is usually a SMALL one and sorts its
  // candidates the same way; this is the same heuristic, stated as an ordering
  // rather than a claim.
  const byCell: TermData[][] = Array.from({ length: cellCount }, (_, cell) =>
    usable.filter((t) => t.cells.includes(cell)).sort((p, q) => q.cells.length - p.cells.length),
  );

  let coversTested = 0;
  let exhausted = false;

  /**
   * Depth-first over covers, returning the solution AND the cover that
   * produced it.
   *
   * The cover is captured by value at the leaf rather than read back from the
   * working array afterwards. Returning only the distances and inspecting the
   * caller's array does not work: the recursion pops its way back out, so by
   * the time the top-level call returns, the array it was handed is empty
   * again — the attack solves the instance correctly and then reports a cover
   * of nothing. The page draws that cover on the grid, so it is visible rather
   * than theoretical, and `claims.spec.ts` asserts every cell carries one.
   */
  const search = (
    covered: boolean[],
    cover: TermData[],
  ): { distances: number[]; cover: TermData[] } | null => {
    if (coversTested >= budget) {
      exhausted = true;
      return null;
    }
    const firstUncovered = covered.indexOf(false);
    if (firstUncovered === -1) {
      coversTested++;
      const distances = solve(cover);
      return distances === null ? null : { distances, cover: cover.slice() };
    }
    for (const term of byCell[firstUncovered]) {
      if (cover.includes(term)) continue;
      cover.push(term);
      // Prune on partial feasibility: a cover extension whose equalities already
      // contradict the inequalities cannot become feasible by adding more
      // equalities, so the whole subtree below it is dead. This is what keeps
      // the search at one tested cover on every instance measured here.
      if (solve(cover) !== null) {
        const next = covered.slice();
        for (const cell of term.cells) next[cell] = true;
        const found = search(next, cover);
        if (found !== null) {
          cover.pop();
          return found;
        }
      }
      cover.pop();
      if (exhausted) return null;
    }
    return null;
  };

  const found = search(new Array<boolean>(cellCount).fill(false), []);
  const distances = found?.distances ?? null;
  const chosen = found?.cover ?? [];

  if (distances === null) {
    return {
      status: exhausted ? 'budget-exhausted' : 'no-solution',
      x: null,
      y: null,
      xMatrix: null,
      yMatrix: null,
      cover: [],
      coversTested,
      budget,
      terms,
    };
  }

  const x = distances.slice(0, maxDegree + 1);
  // Undo the substitution: y_j = −w_j.
  const y = distances.slice(maxDegree + 1).map((w) => -w);

  const xMatrix = combine(x, aPowers);
  const yMatrix = combine(y, bPowers);

  // INVARIANT 3: X ⊗ Y = U is checked before this result is used anywhere.
  // A solver that returned a feasible-looking assignment whose product misses U
  // is reported as a failure, not dressed up as a near miss.
  if (!matEq(matMul(xMatrix, yMatrix), u)) {
    return {
      status: 'no-solution',
      x: null,
      y: null,
      xMatrix: null,
      yMatrix: null,
      cover: [],
      coversTested,
      budget,
      terms,
    };
  }

  return {
    status: 'solved',
    x,
    y,
    xMatrix,
    yMatrix,
    cover: chosen.map((t) => ({ i: t.i, j: t.j })),
    coversTested,
    budget,
    terms,
  };
}

/** ⊕ over i of coefficient_i ⊗ M^⊗i, from a precomputed power run. */
function combine(coefficients: readonly Trop[], pows: readonly Matrix[]): Matrix {
  let acc: Matrix | null = null;
  for (let i = 0; i < coefficients.length; i++) {
    const term = scalarMul(coefficients[i], pows[i]);
    acc = acc === null ? term : matAdd(acc, term);
  }
  return acc as Matrix;
}
