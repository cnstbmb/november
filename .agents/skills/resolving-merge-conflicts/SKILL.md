---
name: resolving-merge-conflicts
description: Work through an in-progress git merge or rebase conflict hunk by hunk, resolving by intent traced to each side's primary source, then finish the operation — never abort.
---

1. **See the current state** of the merge/rebase. Check git history, conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made and the original intent. Read commit messages, PRs, original issues.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal. Do not invent new behaviour. Always resolve; never `--abort`.

4. **Run automated checks** — typecheck, tests, format. Fix anything the merge broke.

5. **Finish the merge/rebase.** Stage everything and commit. If rebasing, continue until all commits are rebased.
