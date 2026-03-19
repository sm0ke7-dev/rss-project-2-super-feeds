# MODE.md — Coding Workflow

> Load this file when the task involves writing, debugging, or reviewing code.
> Then load the relevant `projects/[project]/PROJECT.md` for project-specific rules.

## Workflow

### Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

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
