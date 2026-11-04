# Gridable status

The public status page for Gridable, and the probe that feeds it (GH 2948). It lives in the public
repository `HBE-NETWORK/gridable-status`, so it runs and is served by GitHub, not by Railway, and keeps
working when Gridable does not. The copy in the Gridable repository, `deploy/status-site/`, is the source;
`server/tests/t2948-gh2948-an-external-probe-and-a-public-health-check.test.js` holds it.

- `probe.js` asks each target once and appends one entry to `history.json` (30 days kept). The console
  target is `gridable.ai/healthz`, which answers only after a database query and says one word.
- `index.html` and `status.js` draw the page from `history.json`. No third-party script.
- `.github/workflows/probe.yml` runs the probe every ten minutes, commits the history, deploys the page
  to GitHub Pages, and fails the run when a target is down.

## Publishing (once)

From the Gridable checkout, with the `gh` CLI logged in as an org owner:

```sh
d=$(mktemp -d) && cp -R deploy/status-site/. "$d" && cd "$d" && git init -q -b main && git add -A \
  && git commit -qm "status site from gridable deploy/status-site" \
  && gh repo create HBE-NETWORK/gridable-status --public --source . --push \
  && gh api -X POST repos/HBE-NETWORK/gridable-status/pages -f build_type=workflow \
  && gh workflow run probe.yml -R HBE-NETWORK/gridable-status
```

The page is then `https://hbe-network.github.io/gridable-status/`. A later change here is published the
same way into a clone of that repository, keeping its `history.json`.
