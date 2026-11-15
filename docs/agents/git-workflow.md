# Local Git workflow

Use Git locally for checkpoints by default. Publishing the repository later is an option, but configuring a remote, pushing, or publishing requires the user's explicit request or authorization. Before publishing, review the files and commit history for secrets and other content the user does not intend to share.

## After each requested change

1. Finish the requested work and relevant checks, then inspect the Git status and review the changes in scope. Account for pre-existing changes separately; do not assume they belong to the current request.
2. Tell the user whether this is a useful commit checkpoint and why. A completed feature, fix, self-contained UI change, documentation change, or stable end-of-session state usually is. Small related edits may be grouped; incomplete work can use a clearly labeled `wip:` checkpoint if the user wants one.
3. If a checkpoint is appropriate, propose a commit message and the specific files or changes to include, then ask the user to confirm before staging or committing. Do not include unrelated work, secrets, local environment files, or generated files. If changes in one file are mixed, review and stage only the intended portions.
4. If a checkpoint is not yet useful, briefly say what milestone would make one useful. Do not interrupt the requested work just to ask about a commit.

Explicit user instructions to commit or stage the identified work count as confirmation; do not ask again. If the user declines, leave the changes in place and continue normally.

## Branches

Keep the existing main development branch as the stable line. Before a substantial feature, redesign, or risky experiment, check the current branch and working tree, then recommend a short-lived local branch if it would help isolate the work. Explain any existing uncommitted changes that would follow a branch switch and ask for confirmation before creating or switching branches. Continue work that does not depend on the branch decision while waiting. Small, low-risk changes can stay on the current branch.

## Commit messages

Use a short, outcome-focused subject such as `feat: add transaction filters`, `fix: preserve transaction kind`, `docs: document local setup`, or `wip: checkpoint recurring form`. Prefer one coherent change per commit. Review the proposed diff and run checks appropriate to the change before committing; report any checks that could not run.
