/* ============================================================================
 * Time Intelligence — Time-Based NPS Analysis (single-page module)
 * Reuses NpsUI helpers (filter bar, card, selects, toggles, pager) and Charts
 * builders. Aggregation goes through MockApi.TimeIntel (swappable for a real
 * backend). Settings (slot config, weekend days) live in modal overlays so
 * adding more module settings later doesn't touch the layout.
 *
 * Page sections (top → bottom):
 *  1. Header: title · ⚙ Slot Settings · Export
 *  2. Module filter bar (drives sections 3–5 below)
 *  3. NPS by Time Slot  — Table ⇄ Chart switcher (same data, two views)
 *  4. NPS Heatmap        — slots × days, click-to-drill-down
 *  5. Weekday vs Weekend — ⚙ weekend days · INDEPENDENT filter bar +
 *                          comparison table + trend chart
 *  6. Peak Insights
 * ========================================================================== */
(function (global) {
  'use strict';

  function render(root) {
    const U = global.NpsUI, el = U.el, $ = U.$;
    const TI = global.MockApi.TimeIntel;
    const fmt = n => (n || 0).toLocaleString();
    const npsColor = v => v >= 50 ? '#16a34a' : v >= 1 ? '#fb923c' : v >= -100 ? '#ef4444' : '#8b91a0';
    const trendArrow = t => t > 1 ? `<span style="color:#16a34a">▲ ${t}</span>` : t < -1 ? `<span style="color:#ef4444">▼ ${Math.abs(t)}</span>` : `<span style="color:#8b91a0">– 0</span>`;

    let slots = TI.getSlots();
    // Two INDEPENDENT filter states — main (drives slot table/chart, heatmap)
    // and ww (drives weekday-vs-weekend table). Settings (slot, weekend) are
    // separate global config, not filter state.
    const mainFilter = { scope: 'Overall', entity: null, channel: 'All', period: U.DATE_LABEL };
    const wwFilter   = { scope: 'Overall', entity: null, channel: 'All', period: U.DATE_LABEL };
    const view = { slotView: 'table', sortKey: 'nps', sortDir: -1, loading: false, wwLoading: false };

    // ---- 1. Header row (title + ⚙ slots + export) -------------------------
    const headCard = U.card('');
    const headRow = el(`<div class="card-head" style="margin-bottom:0">
      <div class="card-title">⏰ Time Intelligence <span class="muted" style="font-weight:500">· Time-Based NPS Analysis</span></div>
      <div class="right"></div></div>`);
    const headRight = headRow.querySelector('.right');
    const slotsBtn = el(`<button class="ti-gear" title="Configure time slots" aria-label="Configure time slots">⚙ Slots <span class="muted">(${slots.length})</span></button>`);
    slotsBtn.addEventListener('click', openSlotSettings);
    headRight.appendChild(slotsBtn);
    headRight.appendChild(exportMenu());
    headCard.appendChild(headRow);
    headCard.appendChild(U.filterBar({ granularity: true, onChange: st => { mainFilter.scope = st.scope; mainFilter.entity = st.entity; mainFilter.channel = st.channel; mainFilter.period = st.period; debouncedMain(); } }));
    root.appendChild(headCard);

    // ---- 2. NPS by Time Slot (Table ⇄ Chart switcher) ---------------------
    const slotCard = U.card('NPS by Time Slot', { right: [viewToggle()] });
    const slotPlaceholder = el('<div></div>');
    slotCard.appendChild(slotPlaceholder);
    root.appendChild(slotCard);

    // ---- 3. Heatmap -------------------------------------------------------
    const hmCard = U.card('NPS Heatmap — Slots × Day of Week');
    hmCard.appendChild(el('<div class="muted" style="margin:-6px 0 10px">Click any cell to drill down. Cells below the 30-response threshold show "–".</div>'));
    const hmBoxWrap = el('<div></div>');
    hmCard.appendChild(hmBoxWrap);
    root.appendChild(hmCard);

    // ---- 4. Weekday vs Weekend (own filter + ⚙ weekend days) --------------
    const wwCard = U.card('Weekday vs Weekend', { right: [(function () {
      const b = el('<button class="ti-gear" title="Configure weekend days" aria-label="Configure weekend days">⚙ Weekend days</button>');
      b.addEventListener('click', openWeekendSettings); return b;
    })()] });
    wwCard.appendChild(el('<div class="muted" style="margin:-6px 0 10px">Uses its own filters — independent of the section above.</div>'));
    wwCard.appendChild(U.filterBar({ granularity: true, onChange: st => { wwFilter.scope = st.scope; wwFilter.entity = st.entity; wwFilter.channel = st.channel; wwFilter.period = st.period; debouncedWW(); } }));
    const wwTable = el('<div></div>');
    const wwTrendHead = el('<div class="ti-subtitle" style="margin-top:18px">Comparison trend over time</div>');
    const wwTrendBox = U.chartBox();
    wwCard.appendChild(wwTable);
    wwCard.appendChild(wwTrendHead);
    wwCard.appendChild(wwTrendBox);
    root.appendChild(wwCard);

    // ---- 5. Peak Insights -------------------------------------------------
    const insCard = U.card('Peak Insights');
    insCard.appendChild(el('<div class="muted" style="margin:-6px 0 12px">Generated from the aggregated data for the section above\'s filters.</div>'));
    const insWrap = el('<div class="ti-insights"></div>');
    insCard.appendChild(insWrap);
    root.appendChild(insCard);

    // ===== Section renderers ================================================
    function renderMainSections() {
      if (!slots.length) { slotPlaceholder.innerHTML = ''; slotPlaceholder.appendChild(noSlots()); hmBoxWrap.innerHTML = ''; hmBoxWrap.appendChild(noSlots()); insWrap.innerHTML = '<div class="muted">Configure slots to see insights.</div>'; return; }
      const d = TI.aggregateAll(slots, mainFilter);
      if (!d || d.empty || d.overview.totalVolume === 0) {
        slotPlaceholder.innerHTML = ''; slotPlaceholder.appendChild(noData());
        hmBoxWrap.innerHTML = ''; hmBoxWrap.appendChild(noData());
        insWrap.innerHTML = '<div class="muted">No data for current filters.</div>';
        return;
      }
      // Slot card (table or chart)
      slotPlaceholder.innerHTML = '';
      if (view.slotView === 'table') slotPlaceholder.appendChild(slotTable(d.overview.metrics));
      else { const box = U.chartBox('tall'); slotPlaceholder.appendChild(box); Charts.npsVolume(box, d.overview.metrics); }
      // Heatmap
      hmBoxWrap.innerHTML = '';
      const hmBox = el('<div class="chart" style="height:' + Math.max(280, d.heatmap.length * 54 + 90) + 'px"></div>');
      hmBoxWrap.appendChild(hmBox);
      Charts.heatmap(hmBox, d.heatmap, (row, day) => openDrill(row.id, day));
      // Insights
      insWrap.innerHTML = '';
      d.peakInsights.forEach(ins => insWrap.appendChild(el(`<div class="ti-insight ${ins.kind}"><div class="ti-ins-icon">${ins.icon}</div><div><div class="ti-ins-title">${ins.title}</div><div class="muted">${ins.body}</div></div></div>`)));
      if (!d.peakInsights.length) insWrap.appendChild(el('<div class="muted">No insights for the current selection.</div>'));
    }

    function renderWW() {
      if (!slots.length) { wwTable.innerHTML = ''; wwTable.appendChild(noSlots()); return; }
      // Build a per-slot weekday/weekend table using the WW filter
      const wkDays = TI.getWeekendDays();
      const metrics = TI.slotMetrics(slots, wwFilter);
      const table = el(`<table class="table"><thead><tr>
        <th>Time Slot</th>
        <th colspan="2" class="ti-grouphead">Weekday</th>
        <th colspan="2" class="ti-grouphead">Weekend</th>
        <th>Δ (Wk-end − Wk-day)</th></tr>
        <tr class="ti-subhead"><th></th><th>NPS</th><th>Responses</th><th>NPS</th><th>Responses</th><th></th></tr>
        </thead><tbody></tbody></table>`);
      const tb = $('tbody', table);
      let totWd = { n: 0, p: 0, pa: 0, d: 0 }, totWe = { n: 0, p: 0, pa: 0, d: 0 };
      metrics.forEach(m => {
        let wd = { n: 0, p: 0, pa: 0, d: 0 }, we = { n: 0, p: 0, pa: 0, d: 0 };
        m.perDay.forEach((agg, day) => {
          const target = wkDays.indexOf(day) >= 0 ? we : wd;
          target.n += agg.n; target.p += agg.p; target.pa += agg.pa; target.d += agg.d;
        });
        const wdNps = wd.n ? Math.round(wd.p / wd.n * 100) - Math.round(wd.d / wd.n * 100) : 0;
        const weNps = we.n ? Math.round(we.p / we.n * 100) - Math.round(we.d / we.n * 100) : 0;
        const dlt = (we.n && wd.n) ? (weNps - wdNps) : 0;
        ['n','p','pa','d'].forEach(k => { totWd[k] += wd[k]; totWe[k] += we[k]; });
        const cell = (nps, lowSample) => lowSample ? '<span class="pill">Low sample</span>' : `<span class="score-badge" style="background:${npsColor(nps)}1a;color:${npsColor(nps)}">${nps}</span>`;
        const lowWd = wd.n < TI.MIN_SAMPLE, lowWe = we.n < TI.MIN_SAMPLE;
        const dltCell = (lowWd || lowWe) ? '—' : `<span style="color:${dlt >= 0 ? '#16a34a' : '#ef4444'};font-weight:700">${dlt > 0 ? '+' : ''}${dlt}</span>`;
        tb.appendChild(el(`<tr><td><b>${m.name}</b><div class="muted" style="font-size:12px">${m.start}–${m.end}</div></td>
          <td>${cell(wdNps, lowWd)}</td><td>${fmt(wd.n)}</td>
          <td>${cell(weNps, lowWe)}</td><td>${fmt(we.n)}</td>
          <td>${dltCell}</td></tr>`));
      });
      const tWdNps = totWd.n ? Math.round(totWd.p / totWd.n * 100) - Math.round(totWd.d / totWd.n * 100) : 0;
      const tWeNps = totWe.n ? Math.round(totWe.p / totWe.n * 100) - Math.round(totWe.d / totWe.n * 100) : 0;
      const tDlt = (totWd.n && totWe.n) ? (tWeNps - tWdNps) : 0;
      tb.appendChild(el(`<tr class="ti-totalrow"><td><b>All slots</b></td>
        <td><span class="score-badge" style="background:${npsColor(tWdNps)}1a;color:${npsColor(tWdNps)}">${tWdNps}</span></td><td><b>${fmt(totWd.n)}</b></td>
        <td><span class="score-badge" style="background:${npsColor(tWeNps)}1a;color:${npsColor(tWeNps)}">${tWeNps}</span></td><td><b>${fmt(totWe.n)}</b></td>
        <td><span style="color:${tDlt >= 0 ? '#16a34a' : '#ef4444'};font-weight:700">${tDlt > 0 ? '+' : ''}${tDlt}</span></td></tr>`));
      wwTable.innerHTML = ''; wwTable.appendChild(table);
      // Trend chart (kept) — also uses WW filter
      const ww = TI.weekdayWeekend(slots, wwFilter);
      Charts.wwTrend(wwTrendBox, ww.trend);
    }

    function viewToggle() {
      const g = el('<div class="toolgrp"></div>');
      [['table', 'Table'], ['chart', 'Chart']].forEach(([k, lbl]) => {
        const b = el(`<button class="t ${view.slotView === k ? 'active' : ''}" data-k="${k}">${lbl}</button>`);
        b.addEventListener('click', () => { view.slotView = k; g.querySelectorAll('.t').forEach(x => x.classList.toggle('active', x.dataset.k === k)); renderMainSections(); requestAnimationFrame(() => Charts.resizeAll()); });
        g.appendChild(b);
      });
      return g;
    }

    function slotTable(metrics) {
      const rows = metrics.slice().sort((a, b) => (a[view.sortKey] - b[view.sortKey]) * view.sortDir);
      const th = (k, lbl) => `<th class="sortable" data-k="${k}">${lbl}${view.sortKey === k ? (view.sortDir < 0 ? ' ▾' : ' ▴') : ''}</th>`;
      const table = el(`<table class="table"><thead><tr>
        <th>Time Slot</th><th>Window</th>${th('nps', 'NPS')}${th('volume', 'Responses')}<th>vs prev</th><th>Detractor %</th></tr></thead><tbody></tbody></table>`);
      const tb = $('tbody', table);
      rows.forEach(m => {
        const cell = m.lowSample ? '<span class="pill">Low sample</span>' : `<span class="score-badge" style="background:${npsColor(m.nps)}1a;color:${npsColor(m.nps)}">${m.nps}</span>`;
        const tr = el(`<tr class="ti-rowlink" tabindex="0"><td><b>${m.name}</b></td><td class="muted">${m.start}–${m.end}</td><td>${cell}</td><td>${fmt(m.volume)}</td><td>${m.lowSample ? '—' : trendArrow(m.trend)}</td><td>${m.lowSample ? '—' : m.detractorPct + '%'}</td></tr>`);
        tr.addEventListener('click', () => openDrill(m.id));
        tr.addEventListener('keydown', e => { if (e.key === 'Enter') openDrill(m.id); });
        tb.appendChild(tr);
      });
      table.querySelectorAll('.sortable').forEach(h => h.addEventListener('click', () => {
        const k = h.dataset.k;
        if (view.sortKey === k) view.sortDir *= -1; else { view.sortKey = k; view.sortDir = -1; }
        renderMainSections();
      }));
      return table;
    }

    // ===== Debounced single fetch per section ===============================
    let mainTimer = null, wwTimer = null;
    function debouncedMain() { clearTimeout(mainTimer); slotPlaceholder.innerHTML = ''; slotPlaceholder.appendChild(skeleton(280)); hmBoxWrap.innerHTML = ''; hmBoxWrap.appendChild(skeleton(360)); mainTimer = setTimeout(() => { renderMainSections(); requestAnimationFrame(() => Charts.resizeAll()); }, 280); }
    function debouncedWW() { clearTimeout(wwTimer); wwTable.innerHTML = ''; wwTable.appendChild(skeleton(220)); wwTimer = setTimeout(() => { renderWW(); requestAnimationFrame(() => Charts.resizeAll()); }, 280); }

    // ===== Empty / loading states ===========================================
    function skeleton(h) { return el(`<div class="card skeleton" style="height:${h}px;margin:0"></div>`); }
    function noSlots() {
      const e = el(`<div class="empty"><div class="big">No time slots configured</div><div>Open ⚙ Slots to create time slots.</div><div style="margin-top:14px"><button class="btn-primary" id="ti-cfg">⚙ Configure slots</button></div></div>`);
      e.querySelector('#ti-cfg').addEventListener('click', openSlotSettings);
      return e;
    }
    function noData() { return el(`<div class="empty"><div class="big">No responses for the current filters</div><div>Try widening the date range or clearing a filter.</div></div>`); }

    // ===== Settings overlays ================================================
    function openSlotSettings() {
      const close = () => { ov.remove(); modal.remove(); document.removeEventListener('keydown', esc); };
      const esc = e => { if (e.key === 'Escape') close(); };
      const ov = el('<div class="ti-drawer-overlay"></div>');
      const modal = el('<div class="ti-modal" role="dialog" aria-label="Slot configuration"></div>');
      modal.appendChild(el(`<div class="card-head"><div class="card-title">⚙ Slot Configuration</div><div class="right"><button class="ti-link ti-close" aria-label="Close">✕ Close</button></div></div>`));
      modal.appendChild(el('<div class="muted" style="margin:-6px 0 12px">Define custom time slots (persisted). Editing re-maps all historical data and refreshes every view.</div>'));
      const tlWrap = el('<div></div>'); modal.appendChild(tlWrap);
      const list = el('<div class="ti-slotlist"></div>'); modal.appendChild(list);
      const err = el('<div class="ti-err" style="display:none"></div>'); modal.appendChild(err);
      const addRow = el(`<div class="ti-add"><input class="text-input" id="ti-name" placeholder="Slot name" style="min-width:160px"/>
        <input class="text-input" id="ti-start" type="time" value="08:00"/><span class="muted">to</span><input class="text-input" id="ti-end" type="time" value="12:00"/>
        <button class="btn-primary" id="ti-addbtn">Add slot</button></div>`);
      modal.appendChild(addRow);

      function redrawSettings() {
        tlWrap.innerHTML = ''; tlWrap.appendChild(timeline(slots));
        list.innerHTML = ''; slots.forEach(s => list.appendChild(slotRow(s, err, redrawSettings)));
      }
      $('#ti-addbtn', addRow).addEventListener('click', () => {
        const name = $('#ti-name', addRow).value.trim() || 'New slot';
        const start = $('#ti-start', addRow).value, end = $('#ti-end', addRow).value;
        const e = validate(slots, { start, end });
        if (e) { err.textContent = e; err.style.display = ''; return; }
        slots = slots.concat([{ id: 's' + Date.now(), name, start, end }]);
        TI.saveSlots(slots);
        err.style.display = 'none'; $('#ti-name', addRow).value = '';
        slotsBtn.innerHTML = `⚙ Slots <span class="muted">(${slots.length})</span>`;
        redrawSettings(); renderMainSections(); renderWW();
      });
      $('.ti-close', modal).addEventListener('click', close);
      ov.addEventListener('click', close);
      document.addEventListener('keydown', esc);
      document.body.appendChild(ov); document.body.appendChild(modal);
      redrawSettings();
    }

    function slotRow(s, sharedErr, redraw) {
      const row = el(`<div class="ti-slotrow">
        <input class="text-input ti-f-name" value="${s.name}" aria-label="Slot name"/>
        <input class="text-input ti-f-start" type="time" value="${s.start}" aria-label="Start"/><span class="muted">–</span>
        <input class="text-input ti-f-end" type="time" value="${s.end}" aria-label="End"/>
        <span class="muted ti-dur"></span>
        <span style="flex:1"></span>
        <button class="ti-link ti-save">Save</button><button class="ti-link ti-del" style="color:#ef4444">Delete</button>
        <div class="ti-err ti-rowerr" style="display:none;flex-basis:100%"></div></div>`);
      const dur = $('.ti-dur', row), errEl = $('.ti-rowerr', row);
      const upd = () => { dur.textContent = durationLabel($('.ti-f-start', row).value, $('.ti-f-end', row).value); };
      upd();
      ['.ti-f-start', '.ti-f-end'].forEach(sel => $(sel, row).addEventListener('input', upd));
      $('.ti-save', row).addEventListener('click', () => {
        const next = { id: s.id, name: $('.ti-f-name', row).value.trim() || s.name, start: $('.ti-f-start', row).value, end: $('.ti-f-end', row).value };
        const e = validate(slots.filter(x => x.id !== s.id), next);
        if (e) { errEl.textContent = e; errEl.style.display = ''; return; }
        errEl.style.display = 'none';
        slots = slots.map(x => x.id === s.id ? next : x); TI.saveSlots(slots);
        redraw(); renderMainSections(); renderWW();
      });
      $('.ti-del', row).addEventListener('click', () => {
        slots = slots.filter(x => x.id !== s.id); TI.saveSlots(slots);
        slotsBtn.innerHTML = `⚙ Slots <span class="muted">(${slots.length})</span>`;
        redraw(); renderMainSections(); renderWW();
      });
      return row;
    }

    function openWeekendSettings() {
      const close = () => { ov.remove(); modal.remove(); document.removeEventListener('keydown', esc); };
      const esc = e => { if (e.key === 'Escape') close(); };
      const ov = el('<div class="ti-drawer-overlay"></div>');
      const modal = el('<div class="ti-modal ti-modal-sm" role="dialog" aria-label="Weekend days"></div>');
      modal.appendChild(el(`<div class="card-head"><div class="card-title">⚙ Weekend Days</div><div class="right"><button class="ti-link ti-close" aria-label="Close">✕ Close</button></div></div>`));
      modal.appendChild(el('<div class="muted" style="margin:-6px 0 14px">Select which days count as weekend in the comparison above.</div>'));
      const grid = el('<div class="row" style="gap:8px;flex-wrap:wrap"></div>');
      function paint() {
        grid.innerHTML = '';
        const wk = TI.getWeekendDays();
        TI.DOW.forEach((dn, i) => {
          const on = wk.indexOf(i) >= 0;
          const chip = el(`<button class="chip ${on ? 'brand' : 'neutral'}" aria-pressed="${on}">${dn}</button>`);
          chip.addEventListener('click', () => {
            const cur = TI.getWeekendDays().slice();
            const idx = cur.indexOf(i); if (idx >= 0) cur.splice(idx, 1); else cur.push(i);
            TI.saveWeekendDays(cur); paint(); renderWW(); requestAnimationFrame(() => Charts.resizeAll());
          });
          grid.appendChild(chip);
        });
      }
      paint();
      modal.appendChild(grid);
      $('.ti-close', modal).addEventListener('click', close);
      ov.addEventListener('click', close);
      document.addEventListener('keydown', esc);
      document.body.appendChild(ov); document.body.appendChild(modal);
    }

    // ===== Slot timeline preview ============================================
    function timeline(slots) {
      const wrap = el('<div class="ti-timeline" aria-label="24-hour slot coverage"></div>');
      const colors = ['#7C3AED', '#fb923c', '#16a34a', '#06b6d4', '#a855f7', '#ef4444', '#5B21B6'];
      slots.forEach((s, i) => {
        const blocks = coverage(s);
        blocks.forEach(b => { const seg = el('<div class="ti-tl-seg"></div>'); seg.style.left = (b / 48 * 100) + '%'; seg.style.width = (1 / 48 * 100) + '%'; seg.style.background = colors[i % colors.length]; seg.title = s.name; wrap.appendChild(seg); });
      });
      [0, 6, 12, 18, 24].forEach(h => wrap.appendChild(el(`<div class="ti-tl-tick" style="left:${h / 24 * 100}%">${h}:00</div>`)));
      return wrap;
    }

    // ===== Drill-down drawer (unchanged) ====================================
    function openDrill(slotId, dayName) {
      const dd = TI.drilldown(slots, mainFilter, slotId, dayName);
      if (!dd) return;
      const ov = el('<div class="ti-drawer-overlay"></div>');
      const panel = el(`<div class="ti-drawer" role="dialog" aria-label="Drill-down">
        <div class="card-head"><div class="card-title">${dd.scope}</div><div class="right"><button class="ti-link ti-close" aria-label="Close">✕ Close</button></div></div></div>`);
      if (dd.lowSample) {
        panel.appendChild(el(`<div class="empty"><div class="big">Low sample (${dd.n})</div><div>Below the ${TI.MIN_SAMPLE}-response threshold.</div></div>`));
      } else {
        panel.appendChild(el(`<div class="ti-kpis"><div class="ti-kpi"><div class="ti-kpi-label">NPS</div><div class="ti-kpi-val" style="color:${npsColor(dd.nps)}">${dd.nps}</div></div>
          <div class="ti-kpi"><div class="ti-kpi-label">Responses</div><div class="ti-kpi-val">${fmt(dd.n)}</div></div></div>`));
        panel.appendChild(el(`<div class="ti-ppd"><span class="dot" style="background:#16a34a"></span>Promoters ${dd.promoterPct}% (${dd.promoter})
          <span class="dot" style="background:#fb923c;margin-left:14px"></span>Passives ${dd.passivePct}% (${dd.passive})
          <span class="dot" style="background:#ef4444;margin-left:14px"></span>Detractors ${dd.detractorPct}% (${dd.detractor})</div>`));
        const tBox = el('<div class="chart short" style="height:180px"></div>'); panel.appendChild(el('<div class="ti-subtitle">NPS by day</div>')); panel.appendChild(tBox);
        const themes = el('<div class="ti-themes"></div>');
        dd.themes.forEach(t => themes.appendChild(el(`<div class="ti-theme"><span>${t.theme}</span><span class="ti-theme-bar"><i style="width:${t.pct * 2}px"></i> ${t.pct}%</span></div>`)));
        panel.appendChild(el('<div class="ti-subtitle">Top feedback themes</div>')); panel.appendChild(themes);
        const cm = el('<div class="verbatim"></div>');
        dd.comments.forEach(v => cm.appendChild(el(`<div class="vb"><div class="vb-top"><span class="vb-name">${v.name}</span>${v.sentiment ? `<span class="sentiment ${v.sentiment.label}">${v.sentiment.label.toLowerCase()}</span>` : ''}<span class="vb-date">NPS ${v.rating}</span></div><div class="vb-comment">"${v.comment}"</div></div>`)));
        panel.appendChild(el('<div class="ti-subtitle">Customer comments</div>')); panel.appendChild(cm);
        const st = el(`<table class="table"><thead><tr><th>Store</th><th>Responses</th><th>NPS</th></tr></thead><tbody>${dd.storeBreakdown.map(s => `<tr><td>${s.store}</td><td>${fmt(s.n)}</td><td><span class="score-badge" style="background:${npsColor(s.nps)}1a;color:${npsColor(s.nps)}">${s.nps}</span></td></tr>`).join('')}</tbody></table>`);
        panel.appendChild(el('<div class="ti-subtitle">Store-wise breakdown</div>')); panel.appendChild(st);
        setTimeout(() => Charts.trendLines(tBox, { nps_level_stat: { NPS: { day_of_month_stats: dd.trend.map((x, i) => ({ day_of_month: i + 1, month: x.day, year: 2026, count: x.nps })) } }, days: dd.trend.map((x, i) => ({ day_of_month: i + 1, month: x.day, year: 2026 })) }, false), 30);
      }
      document.body.appendChild(ov); document.body.appendChild(panel);
      const close = () => { ov.remove(); panel.remove(); };
      ov.addEventListener('click', close); $('.ti-close', panel).addEventListener('click', close);
      document.addEventListener('keydown', function escD(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escD); } });
    }

    // ===== Export ===========================================================
    function exportMenu() {
      const g = el('<div class="toolgrp"></div>');
      const csv = el('<button class="t" title="Export current view to CSV">⤓ Excel</button>');
      const pdf = el('<button class="t" title="Print / save as PDF">⤓ PDF</button>');
      csv.addEventListener('click', exportCsv);
      pdf.addEventListener('click', () => window.print());
      g.appendChild(csv); g.appendChild(pdf);
      return g;
    }
    function exportCsv() {
      const metrics = TI.slotMetrics(slots, mainFilter);
      const rows = [['Slot', 'Start', 'End', 'NPS', 'Responses', 'vs prev', 'Detractor %', 'Low sample']]
        .concat(metrics.map(m => [m.name, m.start, m.end, m.nps, m.volume, m.trend, m.detractorPct, m.lowSample]));
      const csv = rows.map(r => r.map(x => `"${x}"`).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'time-intelligence-slots.csv'; a.click();
    }

    // ===== Helpers (validation, geometry) ===================================
    function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
    function coverage(s) {
      let a = Math.floor(toMin(s.start) / 30), b = Math.floor(toMin(s.end) / 30); const out = [];
      if (b > a) { for (let i = a; i < b; i++) out.push(i); }
      else { for (let i = a; i < 48; i++) out.push(i); for (let i = 0; i < b; i++) out.push(i); }
      return out;
    }
    function durationLabel(start, end) { let d = toMin(end) - toMin(start); if (d <= 0) d += 1440; return Math.floor(d / 60) + 'h ' + (d % 60) + 'm'; }
    function validate(others, s) {
      if (!s.start || !s.end) return 'Start and end are required.';
      let dur = toMin(s.end) - toMin(s.start); if (dur <= 0) dur += 1440;
      if (toMin(s.start) === toMin(s.end)) return 'End must differ from start.';
      if (dur < 30) return 'Slot must be at least 30 minutes.';
      const mine = new Set(coverage(s));
      for (const o of others) { const oc = coverage(o); if (oc.some(b => mine.has(b))) return `Overlaps with "${o.name}" (${o.start}–${o.end}).`; }
      return null;
    }

    // ---- initial render ---------------------------------------------------
    renderMainSections();
    renderWW();
  }

  global.TimeIntelModule = { render: render };
})(window);
