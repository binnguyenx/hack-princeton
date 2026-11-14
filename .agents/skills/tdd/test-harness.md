# Test Harness Design

A test has two complementary parts:

1. **The test case** describes the behavior being checked: its inputs, relevant conditions, and expected observable result.
2. **The test harness** builds the machinery that creates those conditions, executes the code through the agreed seam, observes the result, and applies the assertions.

Good cases do not make a test valid by themselves. The harness must execute them under the intended conditions, show the observable behavior accurately through meaningful assertions. A developer should be able to inspect both the case and the harness and understand why the result is trustworthy.

Use a data-driven harness when multiple related cases share the same setup and execution semantics. Do not introduce a generic runner for a single test or for superficially similar cases whose behavior becomes less clear when forced through one abstraction.

## Three layers

Structure a data-driven harness into three explicit layers.

### 1. Setup

Setup creates the environment in which the behavior is exercised. It may construct dependencies, seed state, start an application, create temporary resources, or provide controlled substitutes for external systems.

Setup should:

- expose the dependencies and public interfaces needed by the runner - not the internal implementation
- make important environmental conditions explicit
- begin from a known state for every case
- isolate cases so their result does not depend on execution order
- clean up resources reliably, including after a failure
- avoid unrelated production-scale infrastructure when a smaller faithful setup exists

Keep setup separate from both case definitions and behavioral assertions. Changing how the environment is constructed should not require rewriting the cases or runner unless the public testing seam or observable contract changes.

Do not hide behaviorally important conditions behind defaults. If time, identity, permissions, configuration, existing state, randomness, or dependency behavior affects the rule under test, explain that condition visibly or in a clearly named setup variant.

### 2. Runner and assertion utility

The runner accepts a case, exercises the system through the agreed seam, captures observable results, and applies the assertions described by the case. It defines the mechanical meaning of a group of cases.

The runner should:

- have a narrow purpose and a name that identifies the behavior it exercises
- use the same public path that a real caller uses
- keep execution steps readable in their actual order
- make the mapping from case fields to actions and assertions easy to inspect
- return or expose useful diagnostic information on failure
- avoid assertions unrelated to the behavior family it owns
- avoid conditional branches that turn it into a hidden testing language

Expected results must come from the specification, a worked example, a trusted fixture, or another independent oracle. The runner must not calculate the expected value by reproducing the same algorithm or business rules as the code under test.

Shared assertions belong in the runner when they express invariants that apply to every case in that behavior family. Case-specific expectations should remain visible in the case. Do not bury a material expectation in an implicit default merely to shorten the case table.

### 3. Cases

Cases are declarative descriptions of examples from the behavior inventory. A reader should be able to understand what condition is being tested and what result is expected without mentally executing the runner.

Each case should expose, when relevant:

- a descriptive name tied to one behavioral rule
- inputs or requested action
- behaviorally relevant initial conditions
- expected output or failure
- expected state changes or side effects
- state or side effects that must remain absent

Prefer domain vocabulary over harness vocabulary. Keep case data minimal, but include every value needed to understand why the expectation follows. Avoid opaque positional tuples when named fields would reveal meaning.

Group cases only when they share one execution path and assertion structure. Split them into separate runners when their setup, actions, or meaning of success differ materially.

## Transparency and verifiability

The harness is part of the evidence for correctness and must itself be understandable and verifiable.

A developer inspecting it should be able to answer:

- What state exists before the action?
- Through which seam is the action performed?
- Which result and side effects are observed?
- Where does each expected value come from?
- What would cause this case to fail?
- What is reset or cleaned up before the next case?

Prefer direct control flow and ordinary test-framework features over custom DSLs, metaprogramming, deep inheritance, or generalized framework code. A small amount of repetition is preferable to an abstraction that conceals setup, execution, or assertions.

Verify a new or materially changed harness before trusting all cases that use it:

- Run a representative case in the red state and confirm that it fails for the intended behavioral reason.
- Confirm that failure output identifies the case and shows the relevant expected and observed values.
- When setup or cleanup is non-trivial, exercise or directly test its important failure and isolation behavior.
- For non-trivial runner logic, use focused tests with known inputs or simplify the runner until its correctness is evident by inspection.

A table of passing cases does not validate the harness if the assertions never observe the real result. The red-state check is evidence that the complete path from setup through execution to assertion can detect the targeted defect.

## Lightweight operation

Use the smallest harness that faithfully exercises the chosen seam.

- Reuse one setup within a case only when doing so cannot leak state across cases.
- Prefer deterministic clocks, randomness, identifiers, and dependency responses when those factors affect behavior.
- Avoid fixed delays; wait for observable conditions with bounded timeouts when asynchronous behavior must be tested.
- Keep fixtures small and purpose-built.
- Run the narrow behavior group during the red-green loop, then the relevant surrounding suite at checkpoints.
- Make slow or infrastructure-heavy suites explicit rather than silently placing them in the fastest feedback path.

Optimize for trustworthy feedback, not minimum runtime at the cost of fidelity. A fast harness that bypasses the real seam or omits required effects is not useful.

## Review checklist

Before keeping a harness, check:

- The setup, runner, and cases are visibly separate.
- Each case reads as a behavioral example rather than a script.
- The runner's execution and assertions are easy to trace.
- Expected results are independent of the implementation.
- Important conditions and expectations are not hidden in defaults.
- Cases cannot affect one another or depend on order.
- Failures identify both the case and the violated behavior.
- The abstraction removes meaningful duplication without creating a testing DSL.
- The harness exercises the agreed public seam with sufficient fidelity.
- A red-state run demonstrated that the harness can detect the target defect.
