# PR screenshots (Phase 8, UI-visible changes only)

Neither `gh` nor the REST API can attach an image — Markdown needs a URL, and a
local path renders as nothing. This repo commits them and links by raw URL
(convention established by PR #90).

## Procedure

Order matters: the raw URL needs the **pushed** sha, so commit and push *before*
writing the body.

```bash
mkdir -p docs/screenshots/<feature>                    # NN-name.png, reading order
git add docs/screenshots/<feature>                     # explicit path, never -A
git commit -m "Add PR screenshots (#<n>)"
git push
sha=$(git rev-parse HEAD)
# https://raw.githubusercontent.com/<owner>/<repo>/$sha/docs/screenshots/<feature>/01-….png
```

Verify every URL before publishing — a typo'd path renders as a broken image, not
an error:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "<raw-url>"
```

If screenshots are added after the PR exists, `gh pr edit --body-file` with a body
regenerated against the new sha.

## What to include

The states that carry the change — desktop, mobile, and any opened / focused /
empty / error state the diff touches. Prefer a **before/after pair** when
modifying existing UI rather than adding new UI.

Pair mobile shots side by side with `<img width="300">`; plain `![]()` for the
rest.

**Refresh every screenshot a change invalidates**, not just the obvious one. A
mobile shot once advertised stale copy in a PR for a commit and a half. `git log
-1 -- <file>` per image shows which predate the change.

## Keep them small

They live in git forever. A full-bleed hero shot is ~2 MB of PNG.

```bash
sips -Z 900 <file>                                     # downscale
sips -s format jpeg -s formatOptions 80 <file>         # photo-heavy shots
```

That took 1.2 MB to 187 KB, in line with the 17–400 KB range already on `master`.
UI-chrome shots (drawers, nav bars, flat color) stay PNG. `check:images` only
gates `public/images`, so nothing enforces this for you.

**Downscale (`-Z`); don't crop.** `sips -c H W --cropOffset 0 0` center-crops —
it does not anchor to the top. Cropping a full-page shot down to "just the nav
bar" returns a strip from the middle of the page with no nav in it, which looks
like a real screenshot and says nothing. A 1000px-wide downscale keeps a nav bar
legible.

## Not available

Uploading through the GitHub web UI (canonical `user-attachments` URLs, zero repo
footprint) needs the Claude browser extension; `tabs_context_mcp` reported it
disconnected on 2026-07-27. Don't plan on it without checking first.
