#!/usr/bin/env node
'use strict';
// GH 2948 — THE EXTERNAL PROBE. Run by .github/workflows/probe.yml in the PUBLIC status repository (see
// README.md beside this file), on GitHub's runners: nothing here runs on Railway, so it does not go down
// with what it reports. Each run asks every target once and appends one entry to history.json, which the
// status page (index.html + status.js) reads. Node stdlib only; no secret is read and none is needed.
//
//   node probe.js history.json                  probe once, append, keep KEEP_DAYS of entries
//   node probe.js --fail-if-down history.json   exit 1 when the newest entry has a target down
//                                               (a failed scheduled run is GitHub's own email)
const fs = require('fs');

// `json: true` reads the server's one-word body (server/utils/dbHealth.js#publicHealthHandler): ok | degraded | down.
const TARGETS = [
    { key: 'console', name: 'Console and its database', url: 'https://gridable.ai/healthz', json: true },
    { key: 'site', name: 'Website', url: 'https://getgridable.com/' },
    { key: 'signin', name: 'Sign-in service', url: 'https://logto.gridable.ai/oidc/.well-known/openid-configuration' },
];
const KEEP_DAYS = 30;

/** One target, once: `s` is up | degraded | down, `c` the HTTP status (0 when none came back), `ms` the wait. */
async function check(target, { timeoutMs = 10000, fetchImpl = fetch } = {}) {
    const t0 = Date.now();
    try {
        const res = await fetchImpl(target.url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'gridable-status-probe' } });
        const text = await res.text();
        let s = res.status === 200 ? 'up' : 'down';
        if (s === 'up' && target.json) {
            let word = null;
            try { word = JSON.parse(text).status; } catch (_) { /* not the expected body: down */ }
            s = word === 'ok' ? 'up' : word === 'degraded' ? 'degraded' : 'down';
        }
        return { s, c: res.status, ms: Date.now() - t0 };
    } catch (_) {
        return { s: 'down', c: 0, ms: Date.now() - t0 };
    }
}

function readHistory(file) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return { targets: [], entries: [] }; throw e; }
    const h = JSON.parse(raw);
    return { targets: Array.isArray(h.targets) ? h.targets : [], entries: Array.isArray(h.entries) ? h.entries : [] };
}

/** One line per entry, so each run's commit is a one-line diff. */
function writeHistory(file, history) {
    const lines = history.entries.map((e) => JSON.stringify(e)).join(',\n');
    fs.writeFileSync(file, `{"targets":${JSON.stringify(history.targets)},\n"entries":[\n${lines}\n]}\n`);
}

async function probeOnce(file, { targets = TARGETS, now = () => Date.now(), ...opts } = {}) {
    const history = readHistory(file);
    const checks = {};
    for (const t of targets) checks[t.key] = await check(t, opts);
    const at = now();
    const cutoff = at - KEEP_DAYS * 864e5;
    history.targets = targets.map(({ key, name }) => ({ key, name }));
    history.entries = history.entries.filter((e) => Date.parse(e.at) >= cutoff);
    history.entries.push({ at: new Date(at).toISOString(), checks });
    writeHistory(file, history);
    return history.entries[history.entries.length - 1];
}

module.exports = { TARGETS, KEEP_DAYS, check, probeOnce, readHistory };

if (require.main === module) {
    const args = process.argv.slice(2);
    const file = args.filter((a) => !a.startsWith('--'))[0];
    if (!file) { console.error('usage: node probe.js [--fail-if-down] <history.json>'); process.exit(2); }
    if (args.includes('--fail-if-down')) {
        const last = readHistory(file).entries.slice(-1)[0];
        const down = last ? Object.entries(last.checks).filter(([, r]) => r.s === 'down').map(([k]) => k) : [];
        if (down.length) { console.error(`down at ${last.at}: ${down.join(', ')}`); process.exit(1); }
        process.exit(0);
    }
    probeOnce(file).then((e) => console.log(JSON.stringify(e))).catch((e) => { console.error(e); process.exit(1); });
}
