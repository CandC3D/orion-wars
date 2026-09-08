# Working in parallel: one worktree per session

Several Claude and Codex sessions work on this repository at the same time. Before this document they all edited the same folder, and they collided: on 7 September three sessions touched `src/tactical/resolver.js`, `data/tactical-tuning.json` and the console files within four hours of each other, one session's patch had to be rebased twice against another's live integrations, and an engine slice was postponed because the resolver was occupied.

Git worktrees fix that. This page is the whole convention.

## What a worktree is

One repository, several working folders. Each folder has its own files and its own checked-out branch, and they all share the same history and the same `.git`. Two sessions in two worktrees cannot overwrite each other, because they are different directories on disk.

## The layout

```
C:\Users\chorr\Documents\triangle_campaign      the PLAY tree — always on master
C:\Users\chorr\Documents\ds-work\<name>         one per session, on branch work/<name>
```

**The play tree is Chris's.** It stays on `master`, it is what the server on `127.0.0.1:8642` serves, and it is where the game gets played. Sessions do not edit it directly. Work arrives there by merge.

**Worktrees live beside the repository, never inside it.** A worktree nested in the repo gets swept up by file scans, tests and asset globs, and causes exactly the confusion it was meant to prevent.

## The three commands

Run these from the play tree. `scripts\worktree.cmd` wraps them if you would rather not type git.

```bash
# start a session's workspace
git worktree add ../ds-work/captains -b work/captains

# see what exists
git worktree list

# when the slice is verified, bring it home
git merge --no-ff work/captains
git worktree remove ../ds-work/captains
git branch -d work/captains
```

## Four things that bite people

1. **A new worktree starts from the last commit.** Uncommitted work in the play tree does not travel to it. Commit before branching, or the session starts from yesterday's game.
2. **Two worktrees cannot check out the same branch.** That is the safety feature, not an obstacle.
3. **`node_modules` is not shared.** If a worktree needs to run the npm scripts, run `npm ci` in it once. Playwright lives outside the repository in the Codex runtime cache, so the browser probes work from any folder.
4. **Scratch stays local.** `.gitignore` ignores `/.tmp-*/` at the repository root, so each worktree gets its own scratch space and they never collide.

## Rules for sessions

- **Name the worktree after the job**, not after the model: `console`, `captains`, `campaign-map`.
- **State your worktree at the top of the session** so Chris can see who is where.
- **Stage explicit paths. Never `git add -A`.** More than one session may still be running, and "everything" is never only yours.
- **Do not commit to `master` from a worktree**, and do not push to the GitHub remote unless Chris asks. Merging into master happens in the play tree, deliberately.
- **Merge back only after the slice is verified** — tests run, screenshots looked at, nothing left half-applied.
- **Remove the worktree when the job is done.** A stale worktree on an old branch is how someone ends up building on last week's engine.

## When a merge conflicts

Two sessions changed the same lines. Nothing is broken and nothing is lost. Ask whichever session owns the slice to resolve it in the play tree, rebuild the evidence for its patch, and merge again. Chris should not have to resolve conflicts by hand.

## When not to bother

A single session making a one-file change, with nobody else running, can work in the play tree as before. The convention exists for concurrency; it is not a ceremony to perform when there is none.
