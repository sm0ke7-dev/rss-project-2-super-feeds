# CLAUDE.md — Root Configuration

## How This System Works (Progressive Disclosure)

This project supports both **coding** and **writing** workflows. Do NOT load everything at once.

### Loading Chain
1. **Always read this file first** (universal rules)
2. **Identify the mode**: Is this a coding task or a writing task?
3. **Read the mode file**: `modes/coding/MODE.md` OR `modes/writing/MODE.md`
4. **Read the project/client file**: `modes/coding/projects/[project]/PROJECT.md` OR `modes/writing/clients/[client]/CLIENT.md`

Only load what's relevant to the current task. Never load coding rules for writing tasks or vice versa.

---

## Task Management

### Work Hierarchy
Break non-trivial work into three levels:
- **Milestone** = a shippable version or deliverable (contains 2-10 slices)
- **Slice** = a demoable capability or feature (contains 1-7 tasks)
- **Task** = a single context-window-sized unit of work

Not every session needs all three levels. For small work, a flat task list is fine. Use the hierarchy when the work is big enough to benefit from structure.

### Workflow
1. **Plan First**: Write plan to `tasks/todo.md` using the hierarchy when appropriate
2. **Verify Plan**: Check in with user before starting execution
3. **Track Progress**: Mark items complete as you go
4. **Explain Decisions**: High-level summary at each step; flag any deviations from the brief
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after any correction

## Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review `tasks/lessons.md` at the start of every session
- Lessons apply globally unless tagged to a specific mode or client

## Core Principles

- **Simplicity First**: Whether coding or writing, keep it clean and direct. No unnecessary complexity.
- **No Laziness**: Find root causes for problems. No shortcuts. Senior professional standards.
- **Minimal Impact**: Touch only what's necessary. Don't introduce new problems while solving existing ones.
- **Brief is Law**: Always defer to the specific project/client brief over defaults. Defaults are fallbacks, not overrides.
- **Verify Before Done**: Never mark a task complete without proving it meets requirements.
