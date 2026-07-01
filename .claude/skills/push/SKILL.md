---
name: push
description: Commit all pending changes and push to the remote. Use when the user types /push, or explicitly asks to commit and push the current changes.
---

# Push

Commit whatever is currently pending in this repo and push it to its remote, following the same careful process used throughout this project (see the main system git guidelines) — but execute it directly without pausing to ask "should I commit?", since invoking this skill *is* the explicit ask.

## Steps

1. Run in parallel: `git status --short` (never `-uall`), `git diff` (staged + unstaged), and `git log -5 --oneline` to see the existing commit message style.
2. **If there is nothing to commit and the branch is already up to date with its remote, say so and stop.** Do not create empty commits or push when there's nothing new.
3. Check untracked/modified files for anything that looks like a secret (`.env`, `credentials*`, `*secret*`, `*token*`, `.pem`/`.key` files, etc.). If found, exclude them from staging and warn the user instead of silently committing them.
4. Stage the relevant files by name (avoid a blanket `git add -A` if unrelated or sensitive files are present; blanket add is fine when the diff shows only expected project files).
5. Draft a concise commit message (1-2 sentences, focused on *why*, following this repo's existing style), and commit via HEREDOC:
   ```bash
   git commit -m "$(cat <<'EOF'
   <summary line>

   <optional 1-2 sentence body>

   Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
   EOF
   )"
   ```
6. Push:
   - If the current branch already tracks a remote branch: `git push`.
   - If it doesn't (new local branch): `git push -u origin <branch>`.
7. Run `git status` again to confirm a clean tree and that the branch is up to date with the remote. Report back the commit hash/summary and confirm the push succeeded.

## Guardrails (never override these, even though this skill runs without per-step confirmation)

- Never `--force` / `--force-with-lease` push, never push to `main`/`master` with `--force` under any circumstance from this skill.
- Never `--amend` — always create a new commit.
- Never skip hooks (`--no-verify`) or bypass signing (`--no-gpg-sign`). If a pre-commit hook fails, fix the underlying issue, re-stage, and commit again as a new commit.
- Never rewrite history (`reset --hard`, `rebase`, etc.) as part of this flow.
- If `git status` shows the working tree is on a detached HEAD or an unexpected branch, stop and ask the user before committing.
