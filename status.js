// GH 2948 — what the status page shows, from history.json (written by probe.js). summarize() is pure so
// server/tests/t2948-gh2948-an-external-probe-and-a-public-health-check.test.js can hold it; render() only
// builds DOM from its result, with textContent throughout.
(function (root) {
    'use strict';
    var DAY = 864e5;

    function pct(entries, key, since) {
        var n = 0, up = 0;
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i], r = e.checks && e.checks[key];
            if (!r || Date.parse(e.at) < since) continue;
            n++; if (r.s === 'up') up++;
        }
        return n ? Math.floor((up / n) * 10000) / 100 : null;
    }

    /** Per target: its latest state, uptime over 24 hours / 7 / 30 days (null when unprobed), and 30 UTC days, oldest first. */
    function summarize(history, nowMs) {
        var entries = (history && history.entries) || [];
        var targets = (history && history.targets) || [];
        var today = Math.floor(nowMs / DAY);
        return targets.map(function (t) {
            var latest = null;
            for (var i = entries.length - 1; i >= 0 && !latest; i--) if (entries[i].checks && entries[i].checks[t.key]) latest = { at: entries[i].at, s: entries[i].checks[t.key].s };
            var days = [];
            for (var d = today - 29; d <= today; d++) {
                var worst = 'none';
                for (var j = 0; j < entries.length; j++) {
                    var r = entries[j].checks && entries[j].checks[t.key];
                    if (!r || Math.floor(Date.parse(entries[j].at) / DAY) !== d) continue;
                    if (r.s === 'down') worst = 'down';
                    else if (r.s === 'degraded' && worst !== 'down') worst = 'degraded';
                    else if (worst === 'none') worst = 'up';
                }
                days.push({ day: new Date(d * DAY).toISOString().slice(0, 10), s: worst });
            }
            return {
                key: t.key, name: t.name, latest: latest,
                uptime: { day: pct(entries, t.key, nowMs - DAY), week: pct(entries, t.key, nowMs - 7 * DAY), month: pct(entries, t.key, nowMs - 30 * DAY) },
                days: days,
            };
        });
    }

    var WORD = { up: 'Operational', degraded: 'Degraded', down: 'Down', none: 'No data' };

    function render(doc, mount, history, nowMs) {
        var rows = summarize(history, nowMs);
        var el = function (tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
        mount.textContent = '';
        if (!rows.length) { mount.appendChild(el('p', 'empty', 'No probe has run yet.')); return rows; }
        rows.forEach(function (r) {
            var card = el('section', 'target');
            card.setAttribute('data-target', r.key);
            var head = el('div', 'head');
            head.appendChild(el('h2', null, r.name));
            var s = r.latest ? r.latest.s : 'none';
            var badge = el('span', 'badge s-' + s, WORD[s]);
            head.appendChild(badge);
            card.appendChild(head);
            var bars = el('div', 'bars');
            r.days.forEach(function (d) { var b = el('span', 'bar s-' + d.s); b.title = d.day + ': ' + WORD[d.s]; bars.appendChild(b); });
            card.appendChild(bars);
            var f = function (v) { return v === null ? 'no data' : v + '%'; };
            card.appendChild(el('p', 'meta', 'Uptime: ' + f(r.uptime.day) + ' (24 hours), ' + f(r.uptime.week) + ' (7 days), ' + f(r.uptime.month) + ' (30 days).'
                + (r.latest ? ' Last checked ' + r.latest.at.replace('T', ' ').slice(0, 16) + ' UTC.' : '')));
            mount.appendChild(card);
        });
        return rows;
    }

    var api = { summarize: summarize, render: render };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.GridableStatus = api;
})(this);
