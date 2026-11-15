# Build brief — crypto-lab-tropical-exchange

Written 15 November 2026. Paste this whole file to the coding agent, or save it as `brief.md`
in the new repo. It is self-contained apart from `_MASTER-TEMPLATE.md`, which must be in the
repo root (or readable at `audits/_MASTER-TEMPLATE.md` in the crypto-lab catalog repo).

Source papers are on the owner's machine at
`~/Downloads/crypto-lab-brief-sources/crypto-lab-tropical-exchange/`. Read them there; do not
search the web for copies, do not copy the PDFs into the repo, do not commit them.

---

## KICKOFF (read this first)

Build a new Crypto Lab browser demo (Vite + TypeScript, static site, no backend) in the
repository **`crypto-lab-tropical-exchange`**.

Read `_MASTER-TEMPLATE.md` in full and treat it as the BINDING spec for build, teaching,
look, accessibility, README and deploy. If `audits/kickoff.md` has been given to you, it
governs how you work inside this repo. This brief supplies only the demo-specific facts and
the acceptance checks. Where the template and this brief disagree on build/teach/look/a11y,
the template wins. Where this brief states cryptographic facts, check them against the cited
primary source and by computation; if you find one wrong, do not silently deviate: write
"Brief said X; that is wrong because Y (source or computation)" in your report and build the
correct thing.

Build to every standard in the template, in its order: §1 Build, §3 Look, §2 Teach,
§4 Accessibility (including §4.1a setup rules, §4.1b claims suite, §4.1c mutation
discipline run from a script, §4.1d negative claim), §5 README, §6 Deploy with §6.1 and §6.2.

Hard rules (from the template; repeated because they are the ones that get broken):
real computation only, never a canned or simulated verdict; honest scoping in the page and
the README; do NOT weaken a gate to get a green run; if something cannot pass honestly,
leave it failing and say so. Do not touch the shared catalog files. Copy the top bar from an
existing lab. Copy the accessibility gate and `claims.spec.ts` shape from
`crypto-lab-schnorr-forge` and rewrite every lab-specific passage.

When done, report: one-line summary with the test count; the mutation ledger (each mutation,
killed or not); the three success rates your build measures (FACTS 6) next to the published
ones; confirmation that grouping / auto-merge / PR gate / workflow_dispatch are all present;
and the card metadata listed at the end of this brief for the catalog session.

---

## NEW DEMO BRIEF

- Repo name:         crypto-lab-tropical-exchange
- Short name (H1):   Tropical Exchange
- Subtitle:          Min-plus matrices · Stickel-style key exchange · broken twice
- One-liner:         Browser-based tropical (min-plus) matrix key exchange at its designers' parameters, with the one-line heuristic and the general cover-and-inequalities attack that recover the shared key run for real, each recovered key compared entry by entry with the true one
- Concept to teach:  "No known algorithm solves these systems" is not a security argument: at the proposed parameters high powers of a random matrix drown out every other term, so the public message gives away a working key, and the general system falls to a small search plus difference constraints.
- Primitives/spec:   D. Grigoriev and V. Shpilrain, "Tropical cryptography" (IACR ePrint 2013/012), section 2 protocol. Attack: M. Kotov and A. Ushakov, "Analysis of a key exchange protocol based on tropical matrix algebra" (IACR ePrint 2015/852).
- Accent (--accent): #cf8a3c   (not used by any of the 203 labs whose accent is recorded in the 12 November 2026 snapshot; confirm against the live catalog and against neighbouring cards)
- Favicon emoji:     🌴
- In scope:          see SCOPE below
- Non-goals:         see SCOPE below

GitHub "About" line: use the one-liner above.

---

## PRE-FLIGHT (verify, do not assume)

1. Confirm the repository name is free under `systemslibrarian` and no catalog card is titled
   "Tropical Exchange".
2. In the catalog repo, search `CATALOG.md` and the lab READMEs for `tropical`, `min-plus`,
   `Stickel`, `semiring`, `non-commutative`, `noncommutative`. What the brief author found on
   15 November 2026 (12 November snapshot): no lab matches `tropical` or `Stickel`. If your
   search finds a lab that already runs this exchange or this attack, STOP and report.
   Otherwise link the nearest neighbours you actually find (labs that run a broken scheme and
   its break, Diffie-Hellman labs) under Related Demos.
3. Playwright port: ask the catalog tool (`node tools/port-sync.js` in the catalog repo). If you
   cannot reach the catalog repo, stop and ask the owner for a port. Never 4173.

---

## SOURCES AND WHAT EACH IS FOR

- **ePrint 2015/852** (Kotov and Ushakov, 6 pages; in the sources folder). Read in full by the
  brief author. It restates the protocol and the designers' key generation (section 1.2),
  gives the heuristic with a printed 3 by 3 matrix and its powers (section 2, Table 1) and the
  general attack (section 3, Table 2). Every protocol fact below is from this paper.
- **ePrint 2013/012** (Grigoriev and Shpilrain). The design paper. NOT read by the brief
  author. Read its section 2 before you describe the designers' reasoning or quote their
  parameters as theirs; if it differs from how 2015/852 restates it, report the difference.
- The authors of the attack published their own code (the paper cites
  github.com/mkotov/tropical, written for GAP). Not consulted by the brief author; you may
  compare against it, and should say so in the README if you do.
- Later work (tropical signatures and their forgeries, 2023 to 2026; modified exchanges and
  their breaks) is out of scope here and was not verified. See EXTENSION SEAMS.

---

## FACTS (write tests from these, not from your code)

1. **Algebra.** Entries are integers or +infinity. a ⊕ b = min(a, b); a ⊗ b = a + b.
   Matrix sum is entrywise min; matrix product is (X ⊗ Y)[i][j] = min over k of
   X[i][k] + Y[k][j]. The identity matrix has 0 on the diagonal and +infinity elsewhere.
   A scalar c times a matrix adds c to every entry.
2. **Polynomials.** p(A) = ⊕ over i from 0 to d of c_i ⊗ A^⊗i, with A^⊗0 the identity. The
   constant term is INCLUDED (the paper's sums run from i = 0). This choice matters: without
   it the measured success rates do not match the published table (FACTS 6).
3. **Protocol** (2015/852 section 1.2). Public n by n matrices A, B with A ⊗ B ≠ B ⊗ A.
   Alice picks polynomials p1, p2 and sends U = p1(A) ⊗ p2(B). Bob picks q1, q2 and sends
   V = q1(A) ⊗ q2(B). Alice computes p1(A) ⊗ V ⊗ p2(B); Bob computes q1(A) ⊗ U ⊗ q2(B);
   the two are equal.
4. **Designers' key generation as restated there:** n = 10; entries of A and B uniform in
   [-10^10, 10^10]; each polynomial's degree uniform in 1..10; coefficients uniform in
   [-1000, 1000].
5. **Break condition** (section 1.3). Any X, Y with X ⊗ A = A ⊗ X, Y ⊗ B = B ⊗ Y and
   X ⊗ Y = U give the key as X ⊗ V ⊗ Y. X and Y need not equal Alice's secrets.
   - *Heuristic* (section 2): for i, j in 1..10, test whether U − (A^⊗i ⊗ B^⊗j), entry by
     entry, is the same number c everywhere. If so X = c ⊗ A^⊗i, Y = B^⊗j.
   - *General attack* (section 3): seek X = ⊕ x_i ⊗ A^⊗i and Y = ⊕ y_j ⊗ B^⊗j with i, j in
     0..D. Let T_ij = A^⊗i ⊗ B^⊗j − U (entrywise), m_ij its minimum entry, P_ij the set of
     cells where that minimum is attained. X ⊗ Y = U holds exactly when x_i + y_j ≥ −m_ij for
     all i, j, and the pairs where equality holds have P_ij covering every cell. So: choose a
     cover, then decide the equalities and inequalities. The paper used the simplex method.
     The brief author found that substituting w_j = −y_j makes every constraint a difference
     constraint (w_j − x_i ≤ m_ij, and x_i − w_j ≤ −m_ij on the cover), so Bellman-Ford on
     2(D + 1) nodes decides it and returns integers. No LP library is needed. You may use
     either; state which in the README.
6. **Published and measured success rates** (heuristic; general attack).

   | Coefficients / matrix entries | Paper Table 1 (100 instances) | Measured A (5,000) | Measured B (1,500) | General attack |
   |---|---|---|---|---|
   | [-10^3, 10^3] / [-10^10, 10^10] | 97% | 97.0% | 98.1% | paper 100%; measured 1000/1000 and 150/150 |
   | [-10^10, 10^10] / [-10^10, 10^10] | 71% | 72.2% | 73.1% | paper 100%; measured 1000/1000 and 150/150 |
   | [0, 10^10] / [0, 10^10] | 2% | 1.4% | 1.4% | paper 100%; measured 1000/1000 and 150/150 |

   "Measured A" and "B" are two independent programs written on 15 November 2026 (one with
   numpy, one in plain Python); in every instance both parties' keys were compared and every
   recovered key was compared entry by entry with the true key. The heuristic never returned a
   wrong key in 30,000 instances (it either found the key or found nothing). Without the
   constant term the rates were 99.7 / 79.7 / 14.2%, which is how the choice in FACTS 2 was
   settled. The paper's running times (0.5 to 2.5 seconds, 2015 hardware, GAP) are not
   comparable; the plain-Python general attack averaged about 0.02 s per instance.
7. **Magnitudes.** At the widest setting the largest absolute entry observed in a shared key
   was about 4.3 × 10^11, far below 2^53. JavaScript numbers are therefore exact here; assert
   `Number.isSafeInteger` on every finite entry rather than assuming it. `Infinity` is a
   legitimate entry (identity matrix); `Infinity − Infinity` is not, so never subtract two
   matrices that can both hold +infinity in the same cell without handling it (T_00 = I − U
   has +infinity off the diagonal, which is fine; U is always finite).

---

## SCOPE

In scope, as exhibits in this order:

1. **Min-plus arithmetic.** Two small matrices, ⊕ and ⊗ computed cell by cell with the
   minimising index shown. The printed matrix of check A and its powers, so the learner sees
   entries go negative and fall roughly linearly.
2. **The exchange.** Generate A, B, the four polynomials; show U, V and both parties' keys
   agreeing. Parameter presets: the three rows of FACTS 6, plus a 3 by 3 "by hand" preset.
3. **The heuristic.** The eavesdropper's view only (A, B, U, V). Scan (i, j), show the
   difference matrix for each, stop at the first constant one, build X and Y, compute
   X ⊗ V ⊗ Y, compare with the true key. Explain why it works: the leading power dominates.
4. **Where the heuristic stops working.** The non-negative preset: the scan finds nothing.
5. **The general attack.** Same instance. Show the cover chosen, the solved x and y, X ⊗ Y = U
   checked, the key recovered, and that X is not Alice's p1(A).
6. **Many trials.** Run N fresh instances per preset in a worker; report heuristic and general
   success counts beside the published percentages, with N shown.

Non-goals (say so on the page and in the README): tropical signatures and their forgeries;
later modified exchanges; any claim about tropical schemes in general beyond this protocol at
these parameters; any claim that the general attack is polynomial-time (the paper notes cover
enumeration is a hard problem in general and was easy on every random instance it tried).

---

## SECURITY / CORRECTNESS INVARIANTS

1. Every key the page calls "recovered" has been compared, entry by entry, with the key the
   honest parties computed. The verdict comes from that comparison, never from "the attack
   returned something".
2. The attacker code receives only A, B, U, V (enforce by function signature; a test passes
   an object without the secrets).
3. Before a general-attack result is used, X ⊗ Y = U is checked; a failure is reported as a
   failure.
4. A, B with A ⊗ B = B ⊗ A are rejected at generation and regenerated.
5. All randomness for secrets comes from `crypto.getRandomValues` with rejection sampling for
   uniform ranges (no modulo bias, no `Math.random`). The 10^10 range exceeds 32 bits: draw
   enough bits and reject.
6. Counts in exhibit 6 are counted, never extrapolated.

---

## ARCHITECTURE

Pure modules, no DOM: `tropical.ts` (matrix ops, powers, polynomial evaluation),
`protocol.ts`, `heuristic.ts`, `general.ts` (cover search + constraint solver), `trials.ts`
(worker). UI modules render from returned data only. The general attack and the trial runner
run in a Web Worker so the page stays responsive; the worker is cancellable.

---

## UI AND VISUAL SEMANTICS

Follow §3. Matrices as real tables with row and column headers. In the difference matrix of
exhibit 3, cells equal to the candidate constant are marked by text and shape as well as
colour. Secrets are visually separated from the eavesdropper's view and labelled. Numbers of
this size need tabular figures and horizontal scrolling inside the table region, not page
overflow.

---

## EDGE CASES (each fails closed and teaches via its message)

- Commuting A and B (for instance B equal to a power of A): refused, with the reason.
- Degree outside 1..10, matrix size outside the offered presets, non-integer input in the
  by-hand preset: refused.
- Heuristic finds no constant difference: reported as "heuristic found nothing", never as
  "secure".
- General attack exhausts its search budget (should not happen at these sizes; keep a budget
  anyway): reported as "not recovered within budget", with the budget shown.
- A learner edits U by hand in the by-hand preset so that no solution exists: the general
  attack reports no solution; the page does not show a key.

---

## EXTENSION SEAMS (shape now, do not build)

A `Scheme` interface so a modified exchange or a tropical signature scheme with its forgery
could be added later as separate exhibits. Name these on the page as "not built here".

---

## ACCEPTANCE CHECKS — expected outcomes, derived independently of any implementation

**A. The paper's printed example** (2015/852 section 2; retyped and recomputed by the brief
author, all four powers matched). A = [[-42, 13, -96], [-28, 16, 65], [-85, 31, -75]].
A^⊗2 = [[-181, -65, -171], [-70, -15, -124], [-160, -72, -181]].
A^⊗3 = [[-256, -168, -277], [-209, -93, -199], [-266, -150, -256]].
A^⊗4 = [[-362, -246, -352], [-284, -196, -305], [-341, -253, -362]].
A^⊗5 = [[-437, -349, -458], [-390, -274, -380], [-447, -331, -437]].
Check these against the PDF, then test all four.

**B. Hand-sized instance 1 (heuristic succeeds).** A as in check A;
B = [[57, -23, 10], [-64, 3, -91], [38, -70, -12]]. Coefficient lists are lowest degree first.
p1 = (4, -7, 2), p2 = (-3, 9, -5, 1), q1 = (6, 0, -8), q2 = (-2, 5). Expected:
- A ⊗ B = [[-58, -166, -108], [-48, -51, -75], [-37, -145, -87]];
  B ⊗ A = [[-75, -7, -65], [-176, -60, -166], [-98, -54, -87]] (so they do not commute).
- p1(A) = [[-179, -63, -169], [-68, -13, -122], [-158, -70, -179]];
  p2(B) = [[-123, -183, -150], [-224, -172, -251], [-145, -230, -172]].
- U = [[-314, -399, -341], [-267, -352, -294], [-324, -409, -351]].
- V = [[-191, -244, -186], [-89, -197, -139], [-170, -254, -196]].
- Shared key K = [[-647, -595, -674], [-600, -548, -627], [-657, -605, -684]], both parties.
- Heuristic scanning i then j from 1 to 3: first hit i = 2, j = 3, c = 3; the recovered key
  equals K. (c is the sum of the two leading coefficients, 2 + 1.)
- General attack with D = 3 returns some x, y with X ⊗ Y = U and X ⊗ V ⊗ Y = K. The solution
  is not unique, so test those two equalities and the two commutation conditions, not
  particular x and y. In the brief author's run X differed from p1(A) and Y from p2(B).

**C. Hand-sized instance 2 (heuristic fails, general attack succeeds).**
A = [[97, 9, 17], [79, 79, 56], [16, 16, 0]], B = [[0, 26, 99], [27, 21, 21], [37, 40, 25]],
p1 = (20, 6, 5, 6), p2 = (9, 0, 11), q1 = (5, 4, 8), q2 = (10, 9). Expected:
- p1(A) = [[20, 15, 22], [77, 20, 61], [21, 21, 5]]; p2(B) = [[0, 26, 58], [27, 9, 21], [37, 40, 9]].
- U = [[20, 24, 31], [47, 29, 41], [21, 30, 14]]; V = [[14, 23, 31], [41, 15, 35], [29, 30, 14]].
- K = [[34, 39, 45], [61, 44, 56], [34, 44, 28]], both parties.
- Heuristic with i, j in 1..3: no constant difference.
- General attack with D = 3: succeeds (same four equalities as in B). One valid answer, for
  orientation only: x = (0, -14, -15, 0), y = (29, 20, 20, 20).
This instance also exercises the constant term: with the constant terms dropped, U, V and K
all change.

**D. Protocol algebra.** For random instances at each preset: both keys equal; p(A) commutes
with A; associativity of ⊗ on random triples; (c ⊗ X) ⊗ Y = c ⊗ (X ⊗ Y).

**E. Rates.** With at least 1,000 fresh instances per preset (a slow test, tagged so it can
run in CI without blocking quick runs): heuristic success between 95% and 99.5% for the
designers' preset, between 67% and 78% for the wide-coefficient preset, between 0.3% and 3.5%
for the non-negative preset; the heuristic never returns a wrong key; the general attack
recovers the key in every one of at least 200 instances per preset. If your numbers fall
outside these bands, the first thing to check is FACTS 2.

**F. Mutations that must be killed (§4.1c, run from a script, each a concrete patch).**
(1) matrix product uses max instead of min; (2) polynomial evaluation drops the constant term
(killed by check C, not by check B's U and K, which do not change); (3) the heuristic builds
X without the constant c (check B's key is then off by 3 in every entry); (4) the general
attack enforces the equalities but not the inequalities (in the brief author's run this
returned x, y with X ⊗ Y ≠ U on both hand-sized instances); (5) Bob computes
q1(A) ⊗ V ⊗ q2(B), using his own message; (6) the "recovered" verdict is set when the attack
returns a matrix instead of when it equals the key (killed by the fixture in NEGATIVE CLAIM);
(7) the commuting-pair check is removed; (8) the scan's upper bound is D − 1 instead of D
(in check B the only constant difference is at i = 2, j = 3, so the scan then finds
nothing). A surviving mutation is reported, not explained away.

**G. Fail-closed paths, each a NAMED test:** every refusal under EDGE CASES; invariant 2
(attacker called without secrets); invariant 3 (a forged x, y with X ⊗ Y ≠ U is rejected);
non-safe-integer entry rejected.

**H. Claims suite (§4.1b).** At minimum: the two keys on screen are equal, compared in the
test from the rendered cells; the recovered key on screen equals the honest key on screen,
compared in the test; the (i, j, c) shown reproduces U when the test recomputes
c ⊗ A^⊗i ⊗ B^⊗j from the rendered A and B with its own few lines of min-plus arithmetic; the
trial counts shown sum to N; stale verdicts are retired when any input changes; the no-op
guard; the `[hidden]` probe.

---

## NEGATIVE CLAIM (§4.1d)

Claim, scoped to the instance on the page: **"Both parties computing the same key says
nothing about who else can compute it: for this instance an eavesdropper who saw only A, B, U
and V has the same key."**

Evidence fixture: exhibit 3 on instance 1 of check B. Every check the honest parties can make
reports success (keys equal, messages well-formed, A and B do not commute), and the verdict
reads `KEYS AGREE — AND THE EAVESDROPPER HAS THE SAME KEY`, with the negative-claim sentence
and the parameter preset visible in that state.

Bite fixture for mutation (6): keep A, B and Bob's q1, q2 of check B, but give the attacker
the message of a different Alice, p1 = (1, 5, 3), p2 = (0, -4, 2), namely
U' = [[-300, -248, -327], [-253, -201, -280], [-310, -258, -337]], while the session key is
still check B's K. The heuristic fires on U' (i = 2, j = 2, c = 5) and produces
[[-496, -581, -523], [-449, -534, -476], [-506, -591, -533]], which is NOT K. The page must
say the key was not recovered. The three assertions and two bite tests are as §4.1d
specifies.

---

## README NOTES

Follow §5. "What It Is" names the protocol, both attacks, the parameters, and "not production
crypto — a teaching demo; this scheme was never deployed". "When to Use It" must include a
"do NOT": do not read this page as a verdict on every tropical construction; it shows one
protocol at its proposed parameters. "What Can Go Wrong" is the lesson: hardness of a general
problem versus the instances a key generator actually produces. "Real-World Usage": none;
say so plainly. "Build & Verify" states the test count, the paper's printed vector, the three
measured rates with N, and the a11y gate. Credit both papers by title and authors with ePrint
links; no links to PDF copies elsewhere.

---

## CARD METADATA TO REPORT BACK (for the catalog session; do not edit the catalog yourself)

Title: Tropical Exchange. Subtitle as above. Suggested categories: KEY EXCHANGE, ATTACKS
(confirm both exist in the catalog's CATEGORIES). Suggested level: intermediate. Chips: only
what the source implements (min-plus matrix algebra, the exchange, the heuristic attack, the
general attack). Accent #cf8a3c.

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
