# 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly.
- If uncertain, ask. If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan and verify each step before moving on.

## 5. Commits — STRICT RULES

- DO NOT add Co-Authored-By trailers to commit messages.
- DO NOT add "Generated with Claude Code" footers.
- DO NOT mention Claude, Anthropic, AI, or any model name in commit messages.
- Commits should read as if written by the human author. No attribution to AI.
- Keep commit messages factual: what changed and why. No emojis unless the user explicitly asks.

If the user explicitly requests an attribution line, follow their wording exactly — but never add one by default.

## 6. Pull Requests

- Same rule as commits: no AI attribution, no Co-Authored-By.
- PR body should focus on the change itself, not who wrote it.

## 7. Code Style

- Match the existing style of the file you're editing. Don't reformat unrelated lines.
- Don't add comments like "// Added by Claude" or "# AI-generated".
- Comments should explain WHY non-obvious decisions were made, not narrate what the code does.
- Backend: always run `ruff check .` and `ruff format .` before committing. CI enforces both.
- Frontend: run `npm run build` (TypeScript strict) before committing. All type errors must be zero.

## 8. Scope Discipline

- Do only what the user asked. Don't refactor adjacent code unless explicitly requested.
- If you spot a bug or improvement out of scope, mention it briefly at the end of your reply — don't silently fix it.

## 9. Implementation vs. Recommendation

- When the user says "tell me" or "what changes are needed" — write up the changes, do not implement them.
- When the user says "implement", "do it", "fix it", or "code it" — implement directly.
- When ambiguous, default to writing up first and ask.

## 10. Verifying Work

- Before reporting work as done, verify with `git status` / `git diff` that the changes actually landed.
- Do not claim a commit is pushed without confirming with `git push` output.
- Run CI checks locally before pushing: `ruff check .` + `pytest tests -q` for backend; `npm run build` for frontend.

## 11. Destructive Actions

- Never run `git reset --hard`, `git push --force`, or delete files/branches without the user's explicit go-ahead.
- Never modify `.env`, secrets, or credentials files.
