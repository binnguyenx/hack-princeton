---
name: tdd
description: >-
  Test-driven development (red → green → refactor) for this project. Use during
  the Build step of intent-spec-plan, when implementing from an accepted
  spec/plan, when the user wants features or bugfixes test-first, mentions
  red-green-refactor, or wants integration tests. Derive behavior from
  features/<name>/spec.md when it exists.
---

# Test-Driven Development

TDD is the red → green loop. This skill makes that loop produce tests that enforce behavioral constraints and provide reliable feedback.

**On this project:** for major feature work, run TDD inside the intent-spec-plan Build step. The accepted `features/<name>/spec.md` (requirements and success criteria) is the primary source for the behavior inventory. Do not invent requirements in tests that the spec never stated; if you need a new rule, stop and update the spec with the user first.

When exploring the codebase, also read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## Good test design

### Behavioral coverage

Every system or feature has invariants and constraints. Before testing, build a **behavior inventory** for the work currently under test or read from existing one. Derive it from the user’s requirements, the feature `spec.md` when present, existing behavior, relevant docs, domain rules, documentation, callers, and relevant integration boundaries.

The inventory should capture every distinct observable rule that defines correctness (the work achieves this purpose), including when relevant:

- valid inputs and expected outputs
- invalid inputs and their expected failure behavior; assert the observable failure contract rather than merely catching any failure
- boundary conditions and meaningful equivalence classes
- state changes and externally observable side effects
- behavior that must *not* occur during the work, or when work interacts with other features
- ordering, consistency, and lifecycle rules
- interactions with established domain invariants
- regressions backed by reported bugs or by codebase evidence
- implicit constraints supported by clear evidence from the codebase or domain

Include safety properties when they are observable requirements of the work, such as preserving existing state, avoiding partial writes, maintaining authorization boundaries, or leaving the system recoverable after failure. Do not expand an ordinary feature task into a general safety or security audit.

Distinguish confirmed requirements from inferred constraints. Do not silently turn uncertain assumptions into permanent tests. Surface an inferred constraint to the user when the ambiguity would materially change the public contract or implementation.

Every unique rule in the inventory must be exercised by at least one test at an agreed public seam. A test earns its place when violating the rule would cause it to fail. Before keeping a test, ask:

> What plausible incorrect implementation would this test detect?

If the test would still pass after the relevant behavior were implemented incorrectly, strengthen or remove it.

Do not multiply tests for inputs that exercise the same rule and failure mode. Prefer one representative case per equivalence class, adding boundary or interaction cases only when they establish distinct behavior.

The inventory is not a batch of tests to write upfront. Preserve the vertical TDD loop: select one uncovered rule, write one failing test, implement the minimum behavior needed to satisfy it, and then update the inventory based on what that cycle revealed.

### Good test implementation
Tests verify the behavior inventory through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

### Tests as a verification interface

Treat the test suite as the developer’s fastest interface for deciding whether a change is behaviorally correct.

Tests should provide:

- **fast feedback**: run the smallest relevant test scope during each TDD cycle
- **clear localization**: a failure should identify which behavior or invariant was violated
- **diagnostic value**: test names and focused assertions should make the expected behavior and observed problem understandable without debugging unrelated code
- **determinism**: the same code and environment should produce the same result
- **regression confidence**: once a rule is learned, its test should protect that rule from future changes

Keep each test focused on one behavioral reason to fail, even when several assertions are needed to verify that behavior. Avoid unrelated assertions, excessive setup, broad snapshots, and duplicated coverage because they make failures slower and harder to interpret.

After the focused test passes, run the relevant surrounding suite to check integration with existing invariants. Run broader project checks at an appropriate checkpoint rather than after every minimal cycle.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.
**Test only at established or agreed seams.** Before writing the first test, identify the seams under test. Confirm them with the user when they are not already established by the request or project conventions. Reconfirm only when the work introduces a materially different or ambiguous seam.
Ask: "What's the public interface, and which seams should we test?"

When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), consult a codebase-design skill if one is available in the environment; otherwise agree the seam with the user before writing tests.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactor only after green.** Once the focused test passes, improve the implementation while keeping all relevant tests green.
- **Validate the red state.** Confirm that the new test fails for the expected behavioral reason, not because of incorrect setup, syntax, fixtures, or environment problems.

## References

- Read [tests.md](tests.md) when evaluating test-case quality or when examples of the anti-patterns are needed.
- Read [mocking.md](mocking.md) when a test crosses a system boundary or requires a controlled dependency.
- Read [test-harness.md](test-harness.md) when creating or materially changing shared setup, fixtures, runner utilities, or data-driven tests.
