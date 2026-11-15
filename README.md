# Tropical Exchange

**Min-plus matrices · Stickel-style key exchange · broken twice**

An interactive, browser-only lab for the tropical (min-plus) matrix key exchange of Grigoriev and Shpilrain. Run the protocol at the parameters its designers proposed, then run the two published attacks that recover the shared key from the public messages alone — the one-line heuristic, and the general cover-and-inequalities attack — with every recovered key compared against the honest one, entry by entry.

> **Not production cryptography — a teaching demo.** This scheme was never deployed, and the exhibits below are why it should not be. Secrets are printed on screen on purpose. Everything runs in the browser; nothing is stored or transmitted.

## What It Is

Tropical algebra keeps the ordinary integers and swaps the two operations:

```
a ⊕ b = min(a, b)          a ⊗ b = a + b
(X ⊗ Y)[i][j] = min over k of X[i][k] + Y[k][j]
```

Because "addition" is now a minimum, there is no subtraction. A structure of that shape is a semiring, and it was proposed as a cryptographic platform precisely because the linear algebra that breaks similar schemes over ordinary rings has no obvious counterpart over it.

**The protocol** (Grigoriev and Shpilrain, section 2; restated in Kotov and Ushakov section 1.2). Public `n × n` tropical matrices `A`, `B` with `A ⊗ B ≠ B ⊗ A`. Alice picks polynomials `p₁`, `p₂` and sends `U = p₁(A) ⊗ p₂(B)`. Bob picks `q₁`, `q₂` and sends `V = q₁(A) ⊗ q₂(B)`. Alice computes `p₁(A) ⊗ V ⊗ p₂(B)`, Bob computes `q₁(A) ⊗ U ⊗ q₂(B)`, and the two agree — because a polynomial in `A` commutes with any other polynomial in `A`.

**The designers' key generation**, as that paper restates it: `n = 10`; entries of `A` and `B` uniform in `[-10¹⁰, 10¹⁰]`; each polynomial's degree uniform in `1..10`; coefficients uniform in `[-1000, 1000]`.

**The security model that was claimed, and what went wrong.** Breaking it means computing `K` from `A`, `B`, `U`, `V`. It suffices to find *any* `X`, `Y` with `X ⊗ A = A ⊗ X`, `Y ⊗ B = B ⊗ Y` and `X ⊗ Y = U` — they need not be Alice's secrets. No algorithm was known for solving such systems over a tropical semiring in general. But a key generator does not produce general instances. At these parameters the powers of a random matrix run away downward so fast that the leading term of each polynomial swallows all the others, and `U` degenerates into `c ⊗ A^⊗ⁱ ⊗ B^⊗ʲ` — recoverable by subtraction. And when that fails, the full system still falls to a small search plus a set of difference constraints.

The whole algebra is hand-rolled in [`src/tropical/tropical.ts`](src/tropical/tropical.ts), with the protocol in [`protocol.ts`](src/tropical/protocol.ts) and the two attacks in [`heuristic.ts`](src/tropical/heuristic.ts) and [`general.ts`](src/tropical/general.ts). There is no cryptographic library here and there could not be: the algebra *is* the teaching subject, so every operation is meant to be opened and read.

## Exhibits

1. **Min-Plus Arithmetic** — Two small matrices with `⊕` and `⊗` computed cell by cell, with the minimising index shown for whichever cell you pick and every tied minimum reported. Then the paper's own printed matrix and its powers, so you can watch the entries go negative and fall roughly linearly — the observation the first attack is built on.
2. **The Exchange** — Generate `A`, `B` and four polynomials, see `U` and `V`, and watch both parties compute a key independently. The two keys are compared entry by entry and the verdict is that comparison's result. Four presets: the three parameter rows the paper measured, plus a `3×3` instance small enough to check by hand, with an editor for typing your own.
3. **The Heuristic Attack** — The eavesdropper's view only. Step the scan through each `(i, j)`, watch the difference matrix `U − A^⊗ⁱ ⊗ B^⊗ʲ` redraw, and see one of them come out as the same number in every cell. Build `X` and `Y` from it, compute `X ⊗ V ⊗ Y`, and compare with the real key. A disclosure shows what happens when the attacker is handed a *different* Alice's message: the scan still fires and still returns a well-formed matrix, and that matrix is not the key.
4. **Where It Stops Working** — The non-negative preset, where the powers climb instead of falling and the scan finds nothing on any pair. Then, on the same instance, the general attack takes the key anyway.
5. **The General Attack** — The same instance, solved properly: the chosen cover drawn on the grid of cells, the solved `x` and `y`, `X ⊗ Y` checked against `U`, the recovered key compared with the real one, and a side-by-side showing that `X` is not Alice's `p₁(A)`.
6. **Many Trials** — N fresh instances per parameter set, run in a Web Worker and cancellable, with the measured success counts shown beside the published percentages and N on screen. Every number is counted, never extrapolated.

Several exhibits end with an optional quick check — one prediction, one immediate explanation. The lab is fully usable whether or not you answer them.

## When to Use It

- **Use** this to see what "no known algorithm" is worth as a security argument when a key generator only ever produces a narrow slice of the problem space.
- **Use** it as a worked example of a published break: both attacks are the paper's, and the lab reproduces its measured success rates rather than asserting them.
- **Do NOT** read this page as a verdict on tropical cryptography generally. It shows one protocol at one set of proposed parameters. Later constructions over tropical semirings — modified exchanges, signature schemes — are out of scope here, were not implemented, and nothing on this page is evidence about them.
- **Do NOT** treat the general attack as proven efficient. Enumerating minimal covers is set cover, which is NP-complete; the paper reports it was easy on every random instance it tried, and so is this lab's experience, but that is an observation about these instances and not a complexity result.
- **Do NOT** use any of this code to protect anything.

## Live Demo

**https://systemslibrarian.github.io/crypto-lab-tropical-exchange/**

Run the exchange, step the scan until it fires, watch a stranger derive your shared key from two public matrices, then switch to the parameters where that trick fails and watch the second attack work anyway.

## What Can Go Wrong

This is the lesson of the lab, and it is not really about tropical algebra.

- **Hardness in general is not hardness where your keys live.** The security argument was that nobody knows how to solve tropical systems. True, and irrelevant: the key generator produces instances with a specific structure, and that structure had an algorithm. The gap between "this problem is hard" and "the instances my generator emits are hard" is where this scheme died.
- **A degenerate distribution hiding inside a legitimate parameter choice.** Nothing about `[-10¹⁰, 10¹⁰]` matrix entries and `[-1000, 1000]` coefficients looks wrong. But those two ranges together guarantee that the polynomials collapse to single terms, and the collapse is the break. The numbers were chosen for size, not for the relationship between them.
- **One failed attack read as evidence of security.** Exhibit 4 exists for this. The heuristic drops to about 2% on non-negative parameters, which looks like a fix and is not — the general attack recovers the key on exactly those instances.
- **"The attack returned something" mistaken for "the attack succeeded."** Exhibit 3's disclosure is the fixture for this. Given the wrong message, the heuristic produces a well-formed matrix satisfying every condition it checks, and that matrix is not the session key. Every verdict in this lab is the result of comparing against the true key, never a self-report.

## Real-World Usage

**None.** This protocol was published in 2014 and broken in 2015; it was never deployed in any system. It is here because the *reason* it broke is a mistake that is still available to make.

## How to Run Locally

```bash
npm install
npm run dev          # http://localhost:5173/crypto-lab-tropical-exchange/
npm run build        # maintenance controls + typecheck + production build
npm test             # the unit suite, incl. the paper's printed powers
npm run test:slow    # 1,000 instances per preset, measured against the published rates
npm run test:a11y    # WCAG 2.1 AA axe gate + the claims suite (builds first)
npm run test:mutation # applies each recorded mutation and judges whether it was killed
```

## Related Demos

- [crypto-lab-lll-break](https://systemslibrarian.github.io/crypto-lab-lll-break/) — Merkle–Hellman knapsack encryption and the lattice reduction that breaks it: the same shape of story, a scheme whose hard problem was not the problem its keys posed.
- [crypto-lab-ggh-trapdoor](https://systemslibrarian.github.io/crypto-lab-ggh-trapdoor/) — another broken proposal, where the gap between the assumed problem and the generated instance is again where the attack lives.
- [crypto-lab-agreeing-in-public](https://systemslibrarian.github.io/crypto-lab-agreeing-in-public/) — the plain-language introduction to what a key exchange is for, if the protocol here is your first.
- [crypto-lab-diffie-hellman-mitm](https://systemslibrarian.github.io/crypto-lab-diffie-hellman-mitm/) — a key exchange that is sound, and what still goes wrong without authentication.

## Build & Verify

- **116 unit tests** (Vitest, colocated under `src/**/*.test.ts`), run in CI on every push and before every merge.
- **Spec known-answer vectors** — [`src/tropical/fixtures.ts`](src/tropical/fixtures.ts) carries the `3×3` matrix printed in Kotov and Ushakov section 2 together with its four printed tropical powers `A^⊗2` … `A^⊗5`, and [`tropical.test.ts`](src/tropical/tropical.test.ts) reproduces all four. Those values came from the publication, not from this code.
- **Two worked instances, derived independently of this implementation** — every expected matrix for both (`A ⊗ B`, `B ⊗ A`, `p₁(A)`, `p₂(B)`, `U`, `V`, `K`, and the heuristic's `(i, j, c)`) is asserted in [`protocol.test.ts`](src/tropical/protocol.test.ts) and [`attacks.test.ts`](src/tropical/attacks.test.ts). One is where the heuristic succeeds; the other is where it finds nothing and the general attack succeeds.
- **The constant term, pinned both ways** — the paper's polynomial sums run from `i = 0`. One test asserts that dropping it changes `U`, `V` and `K` on the second instance, and another asserts it changes *nothing* on the first — which is why one worked example cannot settle the question, and why the mutation that drops it is recorded against the second.
- **Measured success rates** — [`rates.slow.test.ts`](src/tropical/rates.slow.test.ts) runs 1,000 fresh instances per parameter set, compares every recovered key with the honest key entry by entry, and asserts the measured rate lands in a band around the published figure. Latest run: **96.4%**, **73.1%** and **1.0%** against the paper's **97%**, **71%** and **2%**; the general attack recovered the key in **200 of 200** instances at every parameter set, where the paper reports 100%. The heuristic has never returned a wrong key.
- **Fail-closed paths, each a named test** — a commuting `A`, `B` pair; a degree outside the preset's range; a non-integer or non-square input; a forged `X`, `Y` whose product is not `U`; an entry beyond 2⁵³; a hand-edited `U` with no solution; and the attack functions' signatures, which take a transcript carrying only `A`, `B`, `U`, `V` and have no parameter a secret could arrive through.
- **Mutation discipline** — [`e2e/verdict-mutations.json`](e2e/verdict-mutations.json) records eight mutations as concrete patches, each naming the test and the exact claim that kills it. `npm run test:mutation` applies each one in an isolated tree archived from HEAD, confirms the patch changed the file, confirms the built bundle hash moved, and accepts a kill only when the named assertion fails and the unmutated baseline passed in the same run. A patch that does not compile is reported as DOES NOT BUILD and is never counted as a kill.
- **Accessibility gate** — `@axe-core/playwright` scans the production build for **zero** WCAG 2.1 A/AA violations across roughly thirty driven states at desktop and phone width ([`e2e/a11y.spec.ts`](e2e/a11y.spec.ts)), with arithmetic contrast measurement, a ratcheted non-text-contrast oracle, and reflow and scroll-region checks axe has no rules for.
- **Claims suite** — [`e2e/claims.spec.ts`](e2e/claims.spec.ts) recomputes the page's headline claims from the values it renders, by a different route than the source takes.
- **Gated CI and deployment** — one workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) runs the maintenance controls, typecheck, unit tests, the rate suite, the build, the accessibility gate and the claims suite **before merge**. Pull requests receive no Pages credentials and publish no artifact; `main` stamps its exact source revision, deploys only after the same gate, and then verifies the served bytes carry that revision.

## Performance

Every operation runs in the browser in milliseconds: at the designers' `10 × 10` parameters the heuristic averages about 1.2 ms per instance and the general attack about 2 ms, measured by the rate suite. Exhibit 6 runs its batches in a Web Worker so the page stays responsive and the run stays cancellable.

The paper's own timings — 0.5 to 2.5 seconds per instance — are **not** comparable with these: different hardware, a different language, and eleven years. The success *rates* are comparable, and those are what the lab puts side by side.

## Sources

- M. Kotov and A. Ushakov, *Analysis of a key exchange protocol based on tropical matrix algebra*, IACR ePrint [2015/852](https://eprint.iacr.org/2015/852). The protocol restatement, the designers' key generation, the heuristic (section 2, with the printed matrix and its powers reproduced here as test vectors) and the general attack (section 3).
- D. Grigoriev and V. Shpilrain, *Tropical cryptography*, IACR ePrint [2013/012](https://eprint.iacr.org/2013/012), published in Comm. Algebra 43:2624–2632, 2014. The design paper, whose section 2 protocol this is.

The authors of the attack published their own GAP implementation alongside the paper. This lab does not use it and was not compared against it; the agreement reported above is between this implementation, the values printed in the paper, and the expected values derived independently for the build brief.

The constraint system here is decided by Bellman–Ford over difference constraints rather than by the simplex method the paper used. Substituting `wⱼ = −yⱼ` makes every constraint a difference constraint, so the system is a shortest-path problem on `2(D+1)` nodes — 22 at the protocol's own degree bound — feasible exactly when the graph has no negative cycle, and the distances are themselves an integer solution. No linear-programming library is involved.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
