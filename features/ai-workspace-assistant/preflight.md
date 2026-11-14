# Preflight: AI workspace assistant

Shared instructions. The main agent maintains this file. Do not write a task's answers here.

Each coding task gets one record at `features/ai-workspace-assistant/preflights/<task-id>.md`. The main agent assigns or agrees that task id and path before delegation. The record names the responsible agent. Only one editor changes that record at a time. If the task grows, update that same record. Do not create a record for a coding task that does not exist yet.

This checklist does not replace `intent.md`, `spec.md`, or `plan.md`. It does not authorize coding by itself, and it is not another approval gate.

Read the relevant intent and spec before every coding task. Update those files only when the task changes requirements or behavior.

Copy the ten items below into the task record and answer them there. Keep the ten items. Reference requirement IDs. Do not paste the requirement text.

1. **Task and file scope.** What will change, and which files.
2. **Documents read.** The intent, spec, and other docs actually read for this task.
3. **Requirement IDs.** The requirement and success-criterion IDs this task covers.
4. **Classification.** Bugfix, refactor, new capability, or behavior change.
5. **Intent.** Whether `intent.md` needs an update, and why.
6. **Spec and contracts.** Whether `spec.md` or a contract needs an update, and why.
7. **Acceptance.** The current acceptance status of the intent and spec. Do not infer acceptance.
8. **Dependencies and assumptions.** What this task relies on. Distinguish a mock or test double from a real capability.
9. **Verification.** How the task will be checked.
10. **Conclusion.** Whether coding may begin for this task, or what is still outstanding. This conclusion does not authorize coding by itself.
