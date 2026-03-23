# MODE.md — Coding Workflow

> Load this file when the task involves writing, debugging, or reviewing code.
> Then load the relevant `projects/[project]/PROJECT.md` for project-specific rules.

## Workflow

### Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### Context Isolation (Default: Subagent Per Task)
- **Every discrete task gets its own subagent** — this is the default, not a judgment call
- Each subagent gets a fresh context window, preventing cross-task pollution
- Only skip subagent isolation for trivially small tasks (single-file, < 5 lines changed)
- Main context is for orchestration, planning, and user communication — not deep execution
- For complex problems, throw more compute at it via parallel subagents
- **Model routing**: Default subagents to **Sonnet** to save tokens. Only use **Opus** for:
  - Architectural planning or system design decisions
  - Complex multi-file refactors requiring deep reasoning
  - Debugging subtle logic errors that Sonnet struggles with
  - When a Sonnet subagent's output quality is clearly insufficient

### Verification Enforcement
- Never mark a task complete without proving it works
- **Run the project's verification gates before marking done** (see PROJECT.md `Verification Gates` section)
- If a gate fails: fix the issue and re-run — don't skip gates or mark done with known failures
- If no gates are defined in PROJECT.md, fall back to: build check → lint → test (whatever applies)
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"

### Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Code Standards

- Write clean, readable code with meaningful variable names
- Comment complex logic but don't over-comment obvious code
- Follow the conventions already established in the project (check PROJECT.md)
- Test your changes before marking done
- Keep commits focused — one logical change per commit

## Project-Specific Config

Before starting any coding task, read:
```
modes/coding/projects/[project-name]/PROJECT.md
```

Each project's PROJECT.md contains: tech stack, conventions, deployment rules, and project-specific gotchas.
