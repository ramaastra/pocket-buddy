# Local Git workflow

Use Git locally for checkpoints by default. Publishing the repository later is an option, but configuring a remote, pushing, or publishing requires the user's explicit request or authorization. Before publishing, review the files and commit history for secrets and other content the user does not intend to share.

## After each requested change

1. Finish the requested work and relevant checks, then inspect the Git status and review the changes in scope. Account for pre-existing changes separately; do not assume they belong to the current request.
2. Tell the user whether this is a useful commit checkpoint and why. A completed feature, fix, self-contained UI change, documentation change, or stable end-of-session state usually is. Small related edits may be grouped; incomplete work can use a clearly labeled `wip:` checkpoint if the user wants one.
3. If a checkpoint is appropriate, propose a commit message and the specific files or changes to include, then ask the user to confirm before staging or committing. Do not include unrelated work, secrets, local environment files, or generated files. If changes in one file are mixed, review and stage only the intended portions.
4. If a checkpoint is not yet useful, briefly say what milestone would make one useful. Do not interrupt the requested work just to ask about a commit.

Explicit user instructions to commit or stage the identified work count as confirmation; do not ask again. If the user declines, leave the changes in place and continue normally.

## Branches

Keep the existing main development branch as the stable line. For substantial work that is expected to take a long time—such as developing a feature, refactoring a feature, a redesign, or a risky experiment—always start in an isolated Git worktree with its own short-lived branch. Do this before implementation; do not merely recommend a worktree or ask whether isolation is wanted. Check the current branch and working tree first. Leave existing uncommitted changes in the original checkout, and do not copy them into the worktree unless they are explicitly part of the task. If the worktree or branch cannot be created safely, explain the blocker and continue only with work that does not depend on it. Small, low-risk edits such as changing colors or wording can stay in the current checkout.

Name branches for the changes they contain, using a short, descriptive name such as `feat/accounts-transactions-categories` or `fix/session-retry`. Before pushing a branch created by a tool, rename it if its name describes the tool or run rather than the work.

## Commit messages

Use a short, outcome-focused subject such as `feat: add transaction filters`, `fix: preserve transaction kind`, `docs: document local setup`, or `wip: checkpoint recurring form`. Prefer one coherent change per commit. Review the proposed diff and run checks appropriate to the change before committing; report any checks that could not run.
