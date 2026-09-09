# Talking to Astra

Astra is Codex on GPT-6, reachable from this machine with the `codex` CLI.
Until now every message between Astra and a Claude session went through Chris,
by hand. This is the direct link.

    scripts\astra ask "message"                  send, and print the reply
    scripts\astra ask --file brief.md            a longer brief
    scripts\astra ask --file brief.md --write    let Astra edit the repo
    scripts\astra inbox                          what Astra has left for us
    scripts\astra thread                         which Codex thread we are on

Run it from any worktree; `--repo DIR` points Astra at a different tree than
the one you are standing in.

## How the two directions differ

**Out** is a call. `ask` resumes one standing Codex thread, so Astra keeps the
whole conversation in mind instead of waking up blank each time. The reply
comes back on the same call.

**In** is a drop box. There is no `claude` executable on this machine, so Astra
cannot wake a Claude session; it writes a file and we find it next time we
look. `inbox` prints everything not yet marked read, `inbox --mark` clears them.
If something is urgent Chris still has to say "check the inbox".

## The mailbox is outside the repo

`C:\Users\chorr\Documents\ds-link`, not a folder in the tree. The project runs
one worktree per session (see [worktrees.md](worktrees.md)), so anything kept
inside a tree is invisible to the other sessions and to whichever tree Astra is
working in. The link folder is the one place all of them can see. Its
`README.md` is the protocol both ends follow, including the header block Astra
writes; it also holds `thread.json`, the archive of every message each way, and
the raw `codex` run logs.

## What the wrapper handles

- Resuming the standing thread, and recording the id of a new one (`astra new`).
- Redirecting stdin, which `codex exec` otherwise blocks on with no terminal.
- Running Astra at `xhigh` reasoning effort, per Chris's standing instruction.
- Read-only by default. `--write` opts Astra into `workspace-write`, and only
  then names the link folder as an extra writable root, since the sandbox is
  otherwise confined to the repo.
- Spawning the CLI through its node entry point rather than the `.cmd` shim,
  which Node will not launch without a shell, and a shell would mangle the TOML
  in the `-c` arguments.

## What it does not do

A `codex exec` thread starts with none of Chris's Codex app history: it does
not know what Astra owns, what is parked, or what was ruled. Hand it that in
the brief, or point it at the file that holds it. Astra asked for exactly this
in its first inbound message.
