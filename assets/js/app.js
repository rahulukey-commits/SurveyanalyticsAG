/* ============================================================================
 * Karnival NPS Analytics — App shell + tab rendering
 * Routes the 9 tabs, draws the Karnival chrome, and "fetches" each chart's
 * data from MockApi (the §4 payloads) → Charts (ECharts).
 * Structure mirrors the legacy screen recording section-for-section.
 * ========================================================================== */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const COLORS = { promoter: '#16a34a', passive: '#fb923c', detractor: '#ef4444', brand: '#8e1b5b' };

  // ---- inline icons -------------------------------------------------------
  const IC = {
    bar:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    pie:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v9l7 5A9 9 0 1 0 12 3Z"/><path d="M12 3a9 9 0 0 1 8.6 6.4L12 12"/></svg>',
    line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l5-5 4 3 8-9"/><circle cx="8" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/></svg>'
  };

  // ---- decorative filter bar ---------------------------------------------
  // Product default date filter is "Last 28 Days" (selected); data renders for that window.
  const DATE_LABEL = (window.MockApi && MockApi.META && MockApi.META.date_label) || 'Last 28 Days';
  const PRESETS = ['Last 7 Days','Last 28 Days','This Month','Previous Month','Last 3 Months','Last 6 Months','Last 12 Months','Custom Date'];
  function selectEl(label, opts, active, onChange) {
    const s = el(`<div class="select" tabindex="0">${label}</div>`);
    const options = opts || [];
    active = active || label;
    s.addEventListener('click', (e) => {
      e.stopPropagation(); closeMenus();
      if (!options.length) return;
      const r = s.getBoundingClientRect();
      const menu = el('<div class="menu"></div>');
      options.forEach(o => {
        const mi = el(`<div class="mi ${o === active ? 'checked' : ''}">${o}${o === active ? '<span class="ck">✓</span>' : ''}</div>`);
        mi.addEventListener('click', () => { s.firstChild.textContent = o; active = o; closeMenus(); if (onChange) onChange(o); });
        menu.appendChild(mi);
      });
      document.body.appendChild(menu);
      const left = Math.min(r.left, window.innerWidth - 210);
      menu.style.left = left + 'px'; menu.style.top = (r.bottom + 6) + 'px';
    });
    return s;
  }
  function closeMenus() { document.querySelectorAll('.menu').forEach(m => m.remove()); }
  document.addEventListener('click', closeMenus);
  window.addEventListener('scroll', closeMenus, true); // close (don't detach) on scroll

  // Per-instance filter bar — each chart owns its own filter state (independent).
  // First dropdown = geo-scope (Overall / Store / Zone / City / Country); when a
  // scope is chosen a dependent "Filter" entity dropdown appears. opts.onChange(state)
  // fires on any change so the owning card can re-render just its own chart.
  function filterBar(opts) {
    opts = opts || {};
    const state = { scope: 'Overall', entity: null, channel: opts.secondLabel || 'All',
      dateField: 'Actual Date', gran: opts.gran || 'Daily', period: opts.preset || DATE_LABEL };
    const bar = el('<div class="filters"></div>');
    const fire = () => { if (opts.onChange) opts.onChange(state); };
    function build() {
      bar.innerHTML = '';
      bar.appendChild(selectEl(state.scope, ['Overall', 'Store', 'Zone', 'City', 'Country'], state.scope, v => { state.scope = v; state.entity = null; build(); fire(); }));
      if (state.scope !== 'Overall') {
        const ents = MockApi.scopeEntities(state.scope);
        const cur = state.entity ? ((ents.find(e => e.key === state.entity) || {}).label || 'Filter') : 'Filter';
        bar.appendChild(selectEl(cur, ['All'].concat(ents.map(e => e.label)), cur, lbl => { const e = ents.find(x => x.label === lbl); state.entity = e ? e.key : null; fire(); }));
      }
      if (opts.multiType) {
        ['promoter PROMOTER', 'passive PASSIVE', 'detractor DETRACTOR'].forEach(t => {
          const [cls, name] = t.split(' ');
          bar.appendChild(el(`<span class="chip ${cls}">${name}<span class="x">✕</span></span>`));
        });
      } else if (!opts.noType) {
        bar.appendChild(selectEl(state.channel, ['All', 'Email', 'SMS', 'WhatsApp'], state.channel, v => { state.channel = v; fire(); }));
      }
      if (opts.dateField !== false) bar.appendChild(selectEl(state.dateField, ['Actual Date', 'Trigger Date'], state.dateField, v => { state.dateField = v; fire(); }));
      if (opts.granularity) bar.appendChild(selectEl(state.gran, ['Daily', 'Weekly', 'Monthly'], state.gran, v => { state.gran = v; fire(); }));
      bar.appendChild(selectEl(state.period, PRESETS, state.period, v => { state.period = v; fire(); }));
      const clr = el('<span class="clear" title="Clear filters">✕</span>');
      clr.addEventListener('click', () => { state.scope = 'Overall'; state.entity = null; state.channel = opts.secondLabel || 'All'; build(); fire(); });
      bar.appendChild(clr);
    }
    build();
    return bar;
  }

  function toggleGroup(kinds, onChange) {
    const g = el('<div class="toolgrp"></div>');
    kinds.forEach((k, i) => {
      const b = el(`<button class="t ${i===0?'active':''}" data-k="${k}">${IC[k] || k}</button>`);
      b.addEventListener('click', () => { g.querySelectorAll('.t').forEach(x => x.classList.remove('active')); b.classList.add('active'); onChange && onChange(k); });
      g.appendChild(b);
    });
    return g;
  }
  function valueModeGroup(onChange) {
    const g = el('<div class="toolgrp"></div>');
    [['123','count'],['%','pct']].forEach(([label, k], i) => {
      const b = el(`<button class="t ${i===0?'active':''}">${label}</button>`);
      b.addEventListener('click', () => { g.querySelectorAll('.t').forEach(x => x.classList.remove('active')); b.classList.add('active'); onChange && onChange(k); });
      g.appendChild(b);
    });
    return g;
  }

  // Soft filter factor: compresses small shares upward so charts shrink
  // visibly without rounding tiny daily counts down to an empty chart.
  function sf(state) { const f = MockApi.factorFor(state).factor; return f >= 1 ? 1 : 0.45 + 0.55 * f; }

  // Scale a category-trend dataset's daily counts by a filter factor.
  function scaleTrend(data, f) {
    if (!f || f === 1) return data;
    const stat = {};
    Object.keys(data.nps_level_stat).forEach(k => {
      const s = data.nps_level_stat[k];
      stat[k] = { total_count: Math.round(s.total_count * f),
        day_of_month_stats: (s.day_of_month_stats || []).map(d => ({ day_of_month: d.day_of_month, month: d.month, year: d.year, count: Math.max(0, Math.round(d.count * f)) })),
        monthly_stats: s.monthly_stats };
    });
    return { nps_level_stat: stat, days: data.days, months: data.months, categories: data.categories };
  }

  function scaleStatus(d, f) {
    if (!f || f === 1) return d;
    const o = { days: d.days, months: d.months };
    ['sent_trend', 'delivered_trend', 'clicked_trend', 'responded_trend', 'completed_trend'].forEach(k => {
      const t = d[k];
      o[k] = { total_count: Math.round(t.total_count * f), monthly_stats: t.monthly_stats.map(m => ({ month: m.month, year: m.year, count: Math.max(0, Math.round(m.count * f)) })), day_of_month_stats: [] };
    });
    return o;
  }

  // Bind a graph-type switcher + value(123/%) switcher to one render(mode, pct) fn.
  // Returns the two control groups; caller calls render() once after the chart box exists.
  function chartCtl(render, kinds) {
    kinds = kinds || ['line', 'bar'];
    const st = { mode: kinds[0], pct: false };
    const tg = toggleGroup(kinds, k => { st.mode = k; render(st.mode, st.pct); });
    const vg = valueModeGroup(v => { st.pct = (v === 'pct'); render(st.mode, st.pct); });
    return [tg, vg, kebab()];
  }

  function card(title, opts) {
    opts = opts || {};
    const c = el('<section class="card fade-in"></section>');
    if (title || opts.right) {
      const head = el('<div class="card-head"></div>');
      if (title) head.appendChild(el(`<div class="card-title">${title}</div>`));
      const right = el('<div class="right"></div>');
      (opts.right || []).forEach(r => right.appendChild(r));
      head.appendChild(right);
      c.appendChild(head);
    }
    return c;
  }
  const chartBox = (cls) => el(`<div class="chart ${cls||''}"></div>`);
  const emptyState = (msg) => el(`<div class="empty"><div class="big">${msg || "Looks like there's currently no data to display."}</div><div>Check back later to visualise your data</div></div>`);
  const sub = (html) => el(`<div class="section-sub">${html}</div>`);
  const kebab = () => el('<span class="kebab">⋮</span>');

  // =========================================================================
  // TAB RENDERERS
  // =========================================================================
  const Tabs = {};

  // ---- 0. Overview --------------------------------------------------------
  Tabs.overview = async function (root) {
    const pctOf = (v, t) => ((v / (t || 1)) * 100).toFixed(2);

    // NPS Score + Contribution Overview — its own independent scope filter
    const c1 = card('');
    c1.appendChild(filterBar({ onChange: st => renderGauge(st) }));
    const top = el('<div class="overview-top"></div>');
    const gaugeWrap = el('<div class="gauge-wrap"></div>');
    gaugeWrap.appendChild(el('<div class="muted" style="text-align:left;font-weight:700;margin-bottom:4px">NPS Score</div>'));
    const gaugeChart = el('<div class="chart" style="height:190px"></div>');
    gaugeWrap.appendChild(gaugeChart);
    const gaugeMeta = el('<div class="gauge-meta"></div>');
    gaugeWrap.appendChild(gaugeMeta);
    const splitWrap = el('<div></div>');
    splitWrap.appendChild(el('<div class="muted" style="font-weight:700;margin-bottom:14px">NPS Contribution Overview</div>'));
    const splitChart = el('<div class="chart" style="height:90px"></div>');
    splitWrap.appendChild(splitChart);
    const splitLegend = el('<div class="split-legend"></div>');
    splitWrap.appendChild(splitLegend);
    top.appendChild(gaugeWrap); top.appendChild(splitWrap);
    c1.appendChild(top);
    root.appendChild(c1);

    function renderGauge(st) {
      const g = MockApi.graphByScope(st.scope, st.entity);
      const t = g.total_responses || 1;
      gaugeMeta.innerHTML = `<div class="gauge-score" style="color:${g.nps_score >= 0 ? COLORS.promoter : COLORS.detractor}">${g.nps_score}</div>
        <div class="gauge-sub">Avg Rating of <b>${g.average_rating}/10</b></div>
        <div class="gauge-resp">👤 ${g.total_responses} Responses</div>`;
      splitLegend.innerHTML = `<span class="li"><span class="dot" style="background:${COLORS.promoter}"></span>Promoter ${g.promoter_contribution} (${pctOf(g.promoter_contribution, t)}%)</span>
        <span class="li"><span class="dot" style="background:${COLORS.passive}"></span>Passive ${g.passive_contribution} (${pctOf(g.passive_contribution, t)}%)</span>
        <span class="li"><span class="dot" style="background:${COLORS.detractor}"></span>Detractor ${g.detractor_contribution} (${pctOf(g.detractor_contribution, t)}%)</span>`;
      Charts.gauge(gaugeChart, g.nps_score);
      Charts.splitBar(splitChart, g);
    }

    // NPS Contribution Trend — its own independent scope filter + 123/% switcher
    let trendSt = { scope: 'Overall', entity: null }, trendPct = false;
    const renderTrend = () => Charts.npsTrend(trendBox, MockApi.graphByScope(trendSt.scope, trendSt.entity), trendPct);
    const c2 = card('NPS Contribution Trend', { right: [valueModeGroup(v => { trendPct = (v === 'pct'); renderTrend(); }), kebab()] });
    c2.appendChild(filterBar({ granularity: true, onChange: st => { trendSt = st; renderTrend(); } }));
    const trendBox = chartBox('tall');
    c2.appendChild(trendBox);
    root.appendChild(c2);

    // NPS By Channel (moved here from Channel Analysis) — own filter + pie/bar
    const cw = (await MockApi.get('channel-wise')).nps_channel_stats;
    let npcMode = 'pie', npcSt = { scope: 'Overall', entity: null, channel: 'All' };
    const renderNpc = () => {
      const f = sf(npcSt);
      const data = MockApi.scaleMap(cw, f);
      npcMode === 'bar' ? Charts.verticalBars(npcBox, data, COLORS.brand) : Charts.pie(npcBox, data, [COLORS.passive, COLORS.promoter, '#6366f1']);
    };
    const c3 = card('NPS By Channel', { right: [toggleGroup(['pie', 'bar'], k => { npcMode = k; renderNpc(); }), kebab()] });
    c3.appendChild(filterBar({ onChange: st => { npcSt = st; renderNpc(); } }));
    const npcBox = chartBox();
    c3.appendChild(npcBox);
    root.appendChild(c3);

    // Feedback Response Rate (filling/completion donut rings) — own filter
    const fr = MockApi.fillingRings();
    const c4 = card('Feedback Response Rate');
    c4.appendChild(el(`<div class="row" style="margin:-6px 0 12px;gap:10px;flex-wrap:wrap">
      <span class="pill">Sent: ${fr.sent}</span><span class="pill">Delivered: ${fr.delivered}</span><span class="pill">Responses: ${fr.responses}</span></div>`));
    c4.appendChild(filterBar({ noType: true, granularity: true }));
    c4.appendChild(ringGrid(fr));
    root.appendChild(c4);

    renderGauge({ scope: 'Overall', entity: null });
    renderTrend();
    renderNpc();
    fr.ringEls.forEach(rc => Charts.donut(rc.el, rc.fill, rc.color, rc.text));
  };

  // donut-ring grid for filling/completion rate
  function ringGrid(fr) {
    const colors = { promoter: COLORS.promoter, passive: COLORS.passive, detractor: COLORS.detractor };
    fr.ringEls = [];
    const wrap = el('<div class="ring-grid"></div>');
    // header row
    wrap.appendChild(el('<div class="ring-corner"></div>'));
    fr.columns.forEach(c => wrap.appendChild(el(`<div class="ring-colhead">${c}</div>`)));
    fr.rows.forEach(row => {
      wrap.appendChild(el(`<div class="ring-rowhead"><span class="chip ${row.cls}">${row.type}</span></div>`));
      row.cells.forEach(cell => {
        const cellWrap = el(`<div class="ring-cell"><div class="ring-title">${row.type} - ${cell.sub}</div><div class="ring-chart"></div></div>`);
        wrap.appendChild(cellWrap);
        fr.ringEls.push({ el: $('.ring-chart', cellWrap), fill: cell.fill, color: colors[row.cls], text: `${cell.pct}%\n(${cell.count})` });
      });
    });
    return wrap;
  }

  // ---- 1. Channel Analysis ------------------------------------------------
  Tabs.channel = async function (root) {
    const co = MockApi.channelOverview();
    const cards = MockApi.channelCards();
    const fmtK = n => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);

    // Channel Overview — scope/channel/period re-slice the series
    let coSt = { scope: 'Overall', entity: null, channel: 'All' }, coMode = 'bar';
    const renderCO = () => {
      const f = sf(coSt);
      const s = {}; Object.keys(co.series).forEach(k => s[k] = co.series[k].map(v => Math.max(0, Math.round(v * f))));
      Charts.statusOverTime(coBox, s, co.dates, coMode === 'line');
    };
    const c1 = card('Channel Overview', { right: [toggleGroup(['bar', 'line'], k => { coMode = k; renderCO(); }), kebab()] });
    c1.appendChild(filterBar({ secondLabel: 'All', granularity: true, onChange: st => { coSt = st; renderCO(); } }));
    const coBox = chartBox('tall');
    c1.appendChild(coBox);
    root.appendChild(c1);

    // Feedback Response Rate — channel filter shows only the chosen channel's cards
    const c2 = card('Feedback Response Rate');
    const pills = el('<div class="row" style="margin:-6px 0 12px;gap:10px;flex-wrap:wrap"></div>');
    c2.appendChild(pills);
    let frSt = { channel: 'All' };
    const cardsWrap = el('<div></div>');
    function renderCards() {
      cardsWrap.innerHTML = '';
      const chans = (frSt.channel && frSt.channel !== 'All') ? [frSt.channel] : ['Email', 'SMS', 'WhatsApp'];
      let sent = 0, del = 0, resp = 0;
      chans.forEach(ch => { const c = cards[ch].Channel; sent += c.Sent; del += c.Delivered; resp += c.Responded; });
      pills.innerHTML = `<span class="pill">Sent: ${fmtK(sent)}</span><span class="pill">Delivered: ${fmtK(del)}</span><span class="pill">Responses: ${resp}</span>`;
      chans.forEach(ch => cardsWrap.appendChild(channelCard(ch, cards[ch])));
    }
    c2.appendChild(filterBar({ secondLabel: 'All', granularity: true, onChange: st => { frSt = st; renderCards(); } }));
    c2.appendChild(cardsWrap);
    root.appendChild(c2);

    renderCO();
    renderCards();
  };

  function metricGrid(metrics) {
    const grid = el('<div class="metric-grid"></div>');
    Object.entries(metrics).forEach(([k, v]) => grid.appendChild(el(`<div class="metric"><div class="label">${k}</div><div class="value">${v}</div></div>`)));
    return grid;
  }
  // ONE card per channel: main grid always visible; View More expands the SAME
  // card to reveal the Link & Reminder sub-sections inside it (→ View Less).
  function channelCard(name, data) {
    const c = el('<div class="metric-card"></div>');
    c.appendChild(el(`<div class="mc-head"><span class="title">${name} Channel</span><span class="more">View More ▾</span></div>`));
    c.appendChild(metricGrid(data.Channel));
    const sub = el('<div class="mc-sub" style="display:none"></div>');
    sub.appendChild(el(`<div class="mc-subtitle">${name} Link</div>`));
    sub.appendChild(metricGrid(data.Link));
    sub.appendChild(el(`<div class="mc-subtitle">${name} Reminder</div>`));
    sub.appendChild(metricGrid(data.Reminder));
    c.appendChild(sub);
    const more = $('.more', c);
    more.addEventListener('click', () => { const open = sub.style.display === 'none'; sub.style.display = open ? '' : 'none'; more.textContent = open ? 'View Less ▴' : 'View More ▾'; });
    return c;
  }

  // ---- 2. Insights --------------------------------------------------------
  Tabs.insights = async function (root) {
    const l1 = await MockApi.get('nps-level-1-bar');
    const aqs = MockApi.additionalQuestions();

    const c1 = card('');
    // segmented summary strip — clicking a segment filters Level 01 by type
    const total = l1.total_response;
    const seg0 = l1.segments || { detractor: 0, passive: 0, promoter: total };
    let l1Box, l1Pill, l1Chip, l2Pill, l2Box, l1mode = 'bar', l1pct = false, l1type = 'Overall', insFactor = 1;
    function renderL1() {
      const d = MockApi.level1ByType(l1type);
      const cr = MockApi.scaleMap(d.category_responses, insFactor);
      const tot = Object.values(cr).reduce((a, b) => a + b, 0);
      if (l1Pill) l1Pill.textContent = 'Responses: ' + tot;
      if (l1Chip) l1Chip.textContent = l1type;
      if (l1mode === 'pie') Charts.pie(l1Box, cr);
      else Charts.levelBars(l1Box, cr, { total: tot, percent: l1pct });
      // Level 02 follows the selected type (drill into Store staff)
      const ss = cr['Store staff'] || 0;
      if (l2Pill) l2Pill.textContent = 'Responses: ' + ss;
      Charts.levelBars(l2Box, { 'Helpfulness': Math.round(ss * 0.5), 'Product Knowledge': Math.round(ss * 0.3), 'Friendliness': Math.max(0, ss - Math.round(ss * 0.5) - Math.round(ss * 0.3)) }, { total: ss, percent: l1pct });
    }
    const strip = el('<div class="seg-strip"></div>');
    [['Overall', total, '', 'Overall'], ['Detractor (0-6)', seg0.detractor, 's-detractor', 'Detractor'], ['Passive (7-8)', seg0.passive, 's-passive', 'Passive'], ['Promoter (9-10)', seg0.promoter, 's-promoter', 'Promoter']].forEach(([label, v, cls, typeKey], i) => {
      const seg = el(`<div class="seg ${cls||''} ${i===0?'active':''}"><div class="seg-label">${label}</div><div class="seg-val">${v}<span class="seg-pct">${((v/total)*100).toFixed(0)}%</span></div></div>`);
      seg.addEventListener('click', () => { strip.querySelectorAll('.seg').forEach(s => s.classList.remove('active')); seg.classList.add('active'); l1type = typeKey; renderL1(); });
      strip.appendChild(seg);
    });
    c1.appendChild(strip);
    const ratingData = await MockApi.get('get-levelBar-overAll-rating');
    const renderRating = () => Charts.ratingDist(rdBox, { category_responses: MockApi.scaleMap(ratingData.category_responses, insFactor) });
    c1.appendChild(filterBar({ noType: true, onChange: st => { insFactor = sf(st); renderRating(); renderL1(); } }));

    // Rating distribution
    c1.appendChild(sub('<b>Rating</b>'));
    const rdBox = chartBox();
    c1.appendChild(rdBox);
    root.appendChild(c1);

    // Level 01 (driven by the segment strip + bar/pie + count/% toggles)
    const c2 = card('', { right: [toggleGroup(['bar','pie'], k => { l1mode = k; renderL1(); }), valueModeGroup(m => { l1pct = (m === 'pct'); renderL1(); }), kebab()] });
    const l1head = el('<div class="lvl-head"><b>Level 01</b> <span class="muted">|</span> <span class="chip neutral">Overall</span></div>');
    l1Chip = $('.chip', l1head); c2.appendChild(l1head);
    const pillWrap = el(`<div style="margin:2px 0 8px"><span class="pill">Responses: ${total}</span></div>`);
    l1Pill = $('.pill', pillWrap); c2.appendChild(pillWrap);
    l1Box = chartBox('tall');
    c2.appendChild(l1Box);

    // Level 02 (follows the selected type)
    c2.appendChild(el(`<div class="lvl-head"><b>Level 02</b> <span class="muted">|</span> <span class="chip neutral">Overall</span> <span class="arrow-r">→</span> ${selectChip('Store staff')}</div>`));
    const l2pillWrap = el(`<div style="margin:2px 0 8px;color:var(--ink-2)"><b>Question:</b> What stood out about our Store staff? <span class="pill">Responses: ${l1.category_responses['Store staff'] || 0}</span></div>`);
    l2Pill = $('.pill', l2pillWrap); c2.appendChild(l2pillWrap);
    l2Box = chartBox();
    c2.appendChild(l2Box);
    root.appendChild(c2);

    // Additional questions
    aqs.forEach(aq => {
      const c = card('');
      c.appendChild(el(`<div class="lvl-head"><b>${aq.title}</b> <span class="muted">|</span> <span class="chip neutral">${aq.type}</span></div>`));
      c.appendChild(el(`<div style="margin:4px 0 12px;color:var(--ink-2)"><b>Question:</b> ${aq.question} <span class="pill">Responses: ${aq.responses}</span></div>`));
      const grid = el('<div class="grid-2"></div>');
      const wc = el('<div class="chart col-chart"></div>');
      grid.appendChild(wc);
      grid.appendChild(verbatimTable(aq.verbatim));
      c.appendChild(grid);
      root.appendChild(c);
      Charts.wordCloud(wc, aq.word_cloud_map);
    });

    // Overall verbatim
    const vb = await MockApi.get('customer-verbatim');
    const c5 = card('Overall Verbatim & Word Cloud');
    const wcBox = el('<div class="chart tall"></div>');
    c5.appendChild(wcBox);
    c5.appendChild(verbatimTable(vb.customer_verbatim));
    root.appendChild(c5);

    renderRating();
    renderL1();
    Charts.wordCloud(wcBox, vb.word_cloud_map);
  };
  function selectChip(label) { return `<span class="chip brand">${label} ▾</span>`; }

  // ---- 3. Store Analysis (fully functional: view selector + period cols) --
  Tabs.store = async function (root) {
    const npsCol = v => v >= 50 ? COLORS.promoter : v >= 1 ? COLORS.passive : COLORS.detractor;
    const scoreBadge = v => `<span class="score-badge" style="background:${npsCol(v)}1a;color:${npsCol(v)}">${v}</span>`;

    /* ---- Card 1: Store Wise NPS Summary (two comparable periods) ---- */
    const c1 = card('Store Wise NPS Summary', { right: [el('<span class="export-link">Export as CSV</span>')] });
    const state1 = { view: 'Store View', periodA: 'Custom Date', periodB: 'Previous Month', page: 0 };
    const PAGE = 10;

    const filters1 = el('<div class="filters"></div>');
    filters1.appendChild(selectEl('Overall', ['Overall', 'Promoter', 'Passive', 'Detractor'], 'Overall'));
    filters1.appendChild(selectEl('All', ['All', 'Email', 'SMS', 'WhatsApp'], 'All'));
    filters1.appendChild(selectEl('Actual Date', ['Actual Date', 'Trigger Date'], 'Actual Date'));
    filters1.appendChild(selectEl(state1.view, MockApi.VIEWS, state1.view, v => { state1.view = v; state1.page = 0; render1(); }));
    c1.appendChild(filters1);
    const tableWrap1 = el('<div></div>');
    c1.appendChild(tableWrap1);
    root.appendChild(c1);

    function render1() {
      const data = MockApi.storeSummary(state1.view, state1.periodA, state1.periodB);
      tableWrap1.innerHTML = '';
      const table = el(`<table class="table"><thead>
        <tr><th rowspan="2">${state1.view.replace(' View', '')} Name</th><th colspan="1" class="th-score">Score</th><th colspan="1" class="th-score">Score</th><th rowspan="2">Responses</th></tr>
        <tr><th class="th-period"></th><th class="th-period"></th></tr></thead><tbody></tbody></table>`);
      // period dropdowns live inside the header score cells
      const periodHeads = table.querySelectorAll('.th-period');
      periodHeads[0].appendChild(periodSelect(state1.periodA, p => { state1.periodA = p; render1(); }));
      periodHeads[1].appendChild(periodSelect(state1.periodB, p => { state1.periodB = p; render1(); }));
      const tb = $('tbody', table);
      const rows = data.rows.slice(state1.page * PAGE, state1.page * PAGE + PAGE);
      rows.forEach(s => tb.appendChild(el(`<tr>
        <td><div class="store-name">${s.name}${s.code ? ' (' + s.code + ')' : ''}</div><div class="store-city">${s.sublabel}</div></td>
        <td>${s.responses ? scoreBadge(s.scoreA) : '<span class="muted">-</span>'}</td>
        <td>${s.responses ? scoreBadge(s.scoreB) : '<span class="muted">-</span>'}</td>
        <td>${s.responses}</td></tr>`)));
      tableWrap1.appendChild(table);
      tableWrap1.appendChild(pager(data.rows.length, state1.page, PAGE, p => { state1.page = p; render1(); }));
    }
    function periodSelect(val, onChange) {
      const w = el('<div class="period-select"></div>');
      w.appendChild(el('<div class="muted" style="font-size:11px">Time Period</div>'));
      w.appendChild(selectEl(val, MockApi.PERIODS, val, onChange));
      return w;
    }
    render1();

    /* ---- Card 2: Feedback Overview (own view selector) ---- */
    const c2 = card('Feedback Overview');
    const state2 = { view: 'City View', page: 0 };
    const filters2 = el('<div class="filters"></div>');
    filters2.appendChild(selectEl('Overall', ['Overall', 'Promoter', 'Passive', 'Detractor'], 'Overall'));
    filters2.appendChild(selectEl('Actual Date', ['Actual Date', 'Trigger Date'], 'Actual Date'));
    filters2.appendChild(selectEl(state2.view, MockApi.VIEWS, state2.view, v => { state2.view = v; state2.page = 0; render2(); }));
    c2.appendChild(filters2);
    const tableWrap2 = el('<div></div>');
    c2.appendChild(tableWrap2);
    root.appendChild(c2);

    function render2() {
      const rows = MockApi.feedbackOverview(state2.view);
      tableWrap2.innerHTML = '';
      const t2 = el(`<table class="table"><thead><tr><th>${state2.view.replace(' View', '')} Name</th><th>NPS</th><th>Responses</th><th>Detractor most rated</th><th>Promoter most rated</th></tr></thead><tbody></tbody></table>`);
      const tb2 = $('tbody', t2);
      rows.slice(state2.page * PAGE, state2.page * PAGE + PAGE).forEach(s => tb2.appendChild(el(`<tr>
        <td><div class="store-name">${s.name}</div><div class="store-city">${s.sublabel}</div></td>
        <td>${scoreBadge(s.nps)}</td><td>${s.responses}</td><td>${s.detractor}</td><td>${s.promoter}</td></tr>`)));
      tableWrap2.appendChild(t2);
      tableWrap2.appendChild(pager(rows.length, state2.page, PAGE, p => { state2.page = p; render2(); }));
    }
    render2();
  };

  // ---- 4. Area of Improvements --------------------------------------------
  Tabs.improvements = async function (root) {
    await reasonTab(root, 'Area of Improvements', [
      { key: 'Overall', cls: 'neutral', text: '' },
      { key: 'Passive', cls: 'passive', text: 'Thanks for your feedback. What would have made your visit better?' },
      { key: 'Detractor', cls: 'detractor', text: "We're sorry to hear that you had a less than satisfactory experience. Please let us know how we can improve." }
    ]);
    // Weekwise trends — daily category bars across the date range (matches video:
    // bars per L1 category, bar default, 123/% toggle, own filter)
    function weekCard(title, cats) {
      const st = { mode: 'bar', pct: false, fstate: {} };
      const box = chartBox('tall');
      const render = () => Charts.trendLines(box, MockApi.trendFor(cats, st.fstate), st.mode === 'bar', st.pct);
      const c = card(title, { right: [toggleGroup(['bar', 'line'], k => { st.mode = k; render(); }), valueModeGroup(v => { st.pct = (v === 'pct'); render(); }), kebab()] });
      c.appendChild(filterBar({ noType: true, granularity: true, gran: 'Weekly', onChange: s => { st.fstate = s; render(); } }));
      c.appendChild(box);
      root.appendChild(c);
      render();
    }
    weekCard('Weekwise L1 Category Trend', ['Club Apparel', 'Store Experience', 'Product', 'Store staff', 'Checkout Experience']);
    weekCard('Weekwise Sub Category Trend', ['Helpfulness', 'Wait Time', 'Quality', 'Ambience']);
  };

  // ---- 5. Appreciations ---------------------------------------------------
  Tabs.appreciations = async function (root) {
    await reasonTab(root, 'Appreciations', [
      { key: 'Overall', cls: 'neutral', text: '' },
      { key: 'Promoter', cls: 'promoter', text: "We're so thrilled to hear that you had a great experience! What did you like the most about your visit?" }
    ]);
    const atSt = { mode: 'line', pct: false, fstate: {} };
    const ra = () => Charts.trendLines(trendBox, MockApi.trendFor(['Store staff', 'Product', 'Store Experience', 'Club Apparel'], atSt.fstate), atSt.mode === 'bar', atSt.pct);
    const c2 = card('Appreciation Trend', { right: [toggleGroup(['line', 'bar'], k => { atSt.mode = k; ra(); }), valueModeGroup(v => { atSt.pct = (v === 'pct'); ra(); }), kebab()] });
    c2.appendChild(filterBar({ noType: true, granularity: true, onChange: s => { atSt.fstate = s; ra(); } }));
    const trendBox = chartBox('tall');
    c2.appendChild(trendBox);
    root.appendChild(c2);
    ra();
  };

  // shared reason-category tab (improvements / appreciations): per-type L1+L2
  async function reasonTab(root, title, sections) {
    const boxes = [];
    const st = { mode: 'bar', pct: false, factor: 1 };
    const redraw = () => boxes.forEach(b => drawReason(b, st.mode, st.pct, st.factor));
    const c = card(title, { right: [
      toggleGroup(['bar', 'pie'], k => { st.mode = k; redraw(); }),
      valueModeGroup(v => { st.pct = (v === 'pct'); redraw(); }), kebab()
    ] });
    c.appendChild(filterBar({ noType: true, secondLabel: 'All', onChange: s => { st.factor = sf(s); redraw(); } }));
    sections.forEach(sec => {
      const s = el('<div class="ct-section"></div>');
      s.appendChild(el(`<div class="ct-head"><span class="chip ${sec.cls}">${sec.key}</span></div>`));
      if (sec.text) s.appendChild(el(`<div class="ct-text">${sec.text}</div>`));
      const grid = el('<div class="ct-grid"></div>');
      const l1c = el('<div><div class="lv-title">Level 01</div><div class="chart"></div></div>');
      const l2c = el('<div><div class="lv-title">Level 02</div><div class="chart"></div></div>');
      grid.appendChild(l1c); grid.appendChild(l2c);
      s.appendChild(grid);
      c.appendChild(s);
      const typeKey = sec.key === 'Overall' ? 'Overall' : sec.key;
      const l1data = MockApi.level1ByType(typeKey).category_responses;
      const ss = l1data['Store staff'] || 0;
      const l2data = { 'Helpfulness': Math.round(ss * 0.5), 'Product Knowledge': Math.round(ss * 0.3), 'Friendliness': Math.max(0, ss - Math.round(ss * 0.5) - Math.round(ss * 0.3)) };
      boxes.push({ l1: $('.chart', l1c), l2: $('.chart', l2c), l1data, l2data });
    });
    root.appendChild(c);
    redraw();
  }
  function drawReason(b, mode, pct, factor) {
    const d1 = MockApi.scaleMap(b.l1data, factor || 1), d2 = MockApi.scaleMap(b.l2data, factor || 1);
    if (mode === 'pie') { Charts.pie(b.l1, d1); Charts.pie(b.l2, d2); }
    else { Charts.verticalBars(b.l1, d1, COLORS.brand, pct); Charts.verticalBars(b.l2, d2, '#6366f1', pct); }
  }

  // ---- 6. Trend Analysis --------------------------------------------------
  Tabs.trend = async function (root) {
    // each trend card: graph switcher + 123/% + its own scope/channel/period filter.
    // trendFor() regenerates the series from the active filter so it visibly changes.
    function trendCard(title, cats, headHtml, kinds) {
      const st = { mode: kinds[0], pct: false, fstate: {} };
      const box = chartBox('tall');
      const render = () => Charts.trendLines(box, MockApi.trendFor(cats, st.fstate), st.mode === 'bar', st.pct);
      const c = card(title, { right: [toggleGroup(kinds, k => { st.mode = k; render(); }), valueModeGroup(v => { st.pct = (v === 'pct'); render(); }), kebab()] });
      if (headHtml) c.appendChild(el(`<div class="lvl-head">${headHtml}</div>`));
      c.appendChild(filterBar({ multiType: true, granularity: true, onChange: s => { st.fstate = s; render(); } }));
      c.appendChild(box);
      root.appendChild(c);
      render();
    }
    trendCard('Level 1 Trend', ['Store staff', 'Product', 'Store Experience', 'Checkout Experience', 'Club Apparel'], null, ['line', 'bar']);
    trendCard('Level 2 Trend', ['Ambience', 'Cleanliness', 'Layout'], selectChip('Store Experience') + ' ' + selectChip('Sub Category'), ['line', 'bar']);
    trendCard('Subcategory Trend', ['Helpfulness', 'Product Knowledge', 'Friendliness'], selectChip('Store staff') + ' ' + selectChip('Sub Category'), ['line', 'bar']);

    // Status Trend Funnel — own filter scales the funnel
    const statusData = await MockApi.get('get-status-trend');
    const sSt = { mode: 'bar', factor: 1 };
    const sBox = chartBox('tall');
    const rS = () => Charts.statusTrend(sBox, scaleStatus(statusData, sSt.factor), sSt.mode === 'line');
    const c4 = card('Status Trend Funnel', { right: [toggleGroup(['bar', 'line'], k => { sSt.mode = k; rS(); }), kebab()] });
    c4.appendChild(filterBar({ secondLabel: 'All', granularity: true, onChange: s => { sSt.factor = sf(s); rS(); } }));
    c4.appendChild(sBox);
    root.appendChild(c4);
    rS();
  };

  // ---- 7. Inbox (master–detail split view) --------------------------------
  Tabs.inbox = async function (root) {
    const PAGE = 8; const state = { page: 0, status: 'All', selected: 0, mobile: '' };
    const c = card('Inbox');
    const filters = el('<div class="filters"></div>');
    const mobileInput = el('<input class="text-input" placeholder="Search by Mobile" />');
    const billInput = el('<input class="text-input" placeholder="Bill Number" />');
    filters.appendChild(mobileInput);
    filters.appendChild(billInput);
    filters.appendChild(selectEl('All', ['All', 'Responded', 'Un-responded'], 'All', v => { state.status = v; state.page = 0; state.selected = 0; draw(); }));
    filters.appendChild(selectEl(DATE_LABEL, PRESETS, DATE_LABEL));
    c.appendChild(filters);
    const split = el('<div class="inbox-split"></div>');
    const listPane = el('<div class="inbox-list"></div>');
    const detailPane = el('<div class="inbox-detail"></div>');
    split.appendChild(listPane); split.appendChild(detailPane);
    c.appendChild(split);
    root.appendChild(c);
    mobileInput.addEventListener('input', () => { state.mobile = mobileInput.value.trim(); state.page = 0; state.selected = 0; draw(); });

    // fetch the full list once so row edits (notes / status) persist across redraws
    const all = (await MockApi.get('nps-inboxes', { pageNo: 0, pageSize: 999 })).auditing;
    let pageRows = [];
    function draw() {
      let rowsAll = all.filter(r => (state.status === 'All' || r.status === state.status) && (!state.mobile || r.customer_ph_no.includes(state.mobile)));
      const total = rowsAll.length;
      pageRows = rowsAll.slice(state.page * PAGE, state.page * PAGE + PAGE);
      const data = { total, auditing: pageRows };
      // left list
      listPane.innerHTML = '';
      const head = el(`<div class="inbox-row inbox-head"><div>Customer Name</div><div>LMR ID</div><div>Nps</div><div>Status</div></div>`);
      listPane.appendChild(head);
      if (!pageRows.length) listPane.appendChild(el('<div class="empty"><div class="big">No data found</div></div>'));
      pageRows.forEach((r, i) => {
        const col = +r.nps >= 9 ? COLORS.promoter : +r.nps >= 7 ? COLORS.passive : COLORS.detractor;
        const row = el(`<div class="inbox-row ${i === state.selected ? 'sel' : ''}">
          <div><div class="store-name">${r.customer_name}</div><div class="store-city">${r.submission_date}</div></div>
          <div class="muted">${r.lmr_id || '-'}</div>
          <div><span class="nps-rating-badge sm" style="background:${col}">${r.nps}</span></div>
          <div><span class="status-chip ${r.status === 'Responded' ? 'ok' : 'pending'}">${r.status}</span></div></div>`);
        row.addEventListener('click', () => { state.selected = i; draw(); });
        listPane.appendChild(row);
      });
      listPane.appendChild(pager(data.total, state.page, PAGE, p => { state.page = p; state.selected = 0; draw(); }));
      // right detail
      drawDetail(pageRows[state.selected]);
    }
    function drawDetail(r) {
      detailPane.innerHTML = '';
      if (!r) { detailPane.appendChild(el('<div class="empty"><div class="big">Select a feedback to view details</div></div>')); return; }
      const head = el(`<div class="row" style="justify-content:space-between"><div class="card-title">Feedback Response</div><div class="muted">Store ID: ${r.store_id}</div></div>`);
      detailPane.appendChild(head);
      detailPane.appendChild(el(`<div class="muted" style="margin:6px 0 14px"><b>Customer:</b> (${r.customer_ph_no})</div>`));
      r.answers.forEach(a => detailPane.appendChild(el(`<div style="margin-bottom:12px"><div><b>Question:</b> ${a.question}</div><div class="muted">Answer: ${a.answer}</div></div>`)));
      if (r.feedback_notes && r.feedback_notes.length) detailPane.appendChild(el(`<div class="vb" style="margin:8px 0"><b>📝 ${r.feedback_notes[0].posted_by_name}:</b> ${r.feedback_notes[0].note}</div>`));
      const note = el('<textarea class="text-input" style="width:100%;min-height:90px;resize:vertical;margin-top:6px" placeholder="Add note"></textarea>');
      const submit = el('<div style="text-align:right;margin-top:10px"><button class="btn-primary">Submit</button></div>');
      detailPane.appendChild(note); detailPane.appendChild(submit);
      $('.btn-primary', submit).addEventListener('click', () => {
        if (!note.value.trim()) return;
        r.feedback_notes = [{ posted_by_name: 'You', note: note.value.trim() }];
        r.status = 'Responded';
        draw();
      });
    }
    draw();
  };

  // ---- 8. Sentiment Analysis ----------------------------------------------
  Tabs.sentiment = async function (root) {
    const s = MockApi.sentiment();
    let sFactor = 1;
    const renderSenti = () => {
      Charts.sentimentPie(pieBox, MockApi.scaleMap(s.distribution, sFactor));
      Charts.sentimentTrend(trendBox, { byWeek: s.trend.byWeek.map(w => ({ w: w.w, score: w.score, pos: Math.round(w.pos * sFactor), neu: Math.round(w.neu * sFactor), neg: Math.round(w.neg * sFactor) })) });
    };
    const c1 = card('Customer Sentiment Score and Trend', { right: [el('<div class="row"></div>')] });
    c1.appendChild(filterBar({ noType: true, granularity: true, onChange: st => { sFactor = sf(st); renderSenti(); } }));
    const top = el('<div class="senti-top"></div>');
    const sCol = s.score >= 60 ? COLORS.promoter : s.score >= 40 ? COLORS.passive : COLORS.detractor;
    top.appendChild(el(`<div>
      <div class="senti-score" style="color:${sCol}">${s.score.toFixed(1)}</div>
      <div style="margin-top:10px"><span class="pill">${s.label} ☺</span></div>
      <div class="senti-delta">↗ ${s.delta}</div>
      <div class="senti-vs">vs Month Before That</div></div>`));
    const right = el('<div class="senti-pie-row"></div>');
    const pieBox = el('<div class="chart" style="height:240px"></div>');
    const trendBox = el('<div class="chart" style="height:240px"></div>');
    right.appendChild(pieBox); right.appendChild(trendBox);
    top.appendChild(right);
    c1.appendChild(top);
    root.appendChild(c1);

    const c2 = card('Top 5 Aspects Driving Sentiment');
    const asp = el('<div class="aspects"></div>');
    asp.appendChild(aspectCol('Most Negative Aspects', 'neg', s.negative_aspects, COLORS.detractor));
    asp.appendChild(aspectCol('Most Positive Aspects', 'pos', s.positive_aspects, COLORS.promoter));
    c2.appendChild(asp);
    root.appendChild(c2);

    const c3 = card('Sentiment Word Cloud & Verbatim');
    const wcBox = el('<div class="chart tall"></div>');
    c3.appendChild(wcBox);
    c3.appendChild(verbatimTable(s.verbatim));
    root.appendChild(c3);

    renderSenti();
    Charts.wordCloud(wcBox, s.word_cloud_map);
  };
  function aspectCol(title, cls, items, color) {
    const c = el(`<div class="col"><div class="ahead ${cls}">${cls === 'neg' ? '👎' : '👍'} ${title}</div></div>`);
    if (!items.length) { c.appendChild(el('<div class="empty-a">No aspects</div>')); return c; }
    const max = Math.max.apply(null, items.map(i => i.count));
    items.forEach(i => c.appendChild(el(`<div class="arow"><span>${i.aspect}</span>
      <span class="row"><span class="bar" style="width:${20 + (i.count/max)*90}px;background:${color}"></span> <b>${i.count}</b></span></div>`)));
    return c;
  }

  // ---- shared: verbatim table + pager ------------------------------------
  function verbatimTable(items) {
    const wrap = el('<div></div>');
    const table = el(`<table class="table vtable"><thead><tr>
      <th>Comment</th><th>Sentiment Score</th><th>Submitted Date</th><th>Customer Name</th><th>Customer Number</th></tr></thead><tbody></tbody></table>`);
    const tb = $('tbody', table);
    if (!items.length) { tb.appendChild(el('<tr><td colspan="5"><div class="empty"><div class="big">No Data Available</div></div></td></tr>')); }
    items.forEach(v => {
      const s = v.sentiment;
      const chip = s ? `<span class="senti-score-chip sentiment ${s.label}">${s.label.toLowerCase()} <span class="pctn">${Math.round(s.score*100)}%</span></span>` : '<span class="muted">—</span>';
      tb.appendChild(el(`<tr>
        <td><div class="cmt">"${v.comment}"</div></td>
        <td>${chip}</td><td>${v.date}</td><td>${v.customer_name}</td><td>${v.mobile_no}</td></tr>`));
    });
    wrap.appendChild(table);
    if (items.length > 6) wrap.appendChild(pager(items.length));
    return wrap;
  }
  function pager(total, page, size, onPage) {
    page = page || 0; size = size || 10;
    const pages = Math.max(1, Math.ceil(total / size));
    const from = total ? page * size + 1 : 0;
    const to = Math.min(total, (page + 1) * size);
    const p = el(`<div class="pager">
      <div class="rpp"><div class="select">${size}</div> Rows/Page</div>
      <div class="mid"><b>${from} - ${to}</b> out of <b>${total}</b> entries</div>
      <div class="nav"><span class="arrow prev">‹</span><span class="pg">${page+1}</span> of <b>${pages}</b> pages <span class="arrow next">›</span></div></div>`);
    if (onPage) {
      $('.prev', p).addEventListener('click', () => { if (page > 0) onPage(page - 1); });
      $('.next', p).addEventListener('click', () => { if (page < pages - 1) onPage(page + 1); });
    }
    return p;
  }

  // =========================================================================
  // SHELL
  // =========================================================================
  const TABS = [
    { key: 'overview', label: 'Overview', fn: Tabs.overview },
    { key: 'channel', label: 'Channel Analysis', fn: Tabs.channel },
    { key: 'insights', label: 'Insights', fn: Tabs.insights },
    { key: 'store', label: 'Store Analysis', fn: Tabs.store },
    { key: 'improvements', label: 'Area of Improvements', fn: Tabs.improvements },
    { key: 'appreciations', label: 'Appreciations', fn: Tabs.appreciations },
    { key: 'trend', label: 'Trend Analysis', fn: Tabs.trend },
    { key: 'inbox', label: 'Inbox', fn: Tabs.inbox },
    { key: 'sentiment', label: 'Sentiment Analysis', fn: Tabs.sentiment },
    // Time Intelligence module (defined in time-intel.js, reuses the shared UI below)
    { key: 'time', label: 'Time Intelligence', fn: r => window.TimeIntelModule ? window.TimeIntelModule.render(r) : r.appendChild(emptyState('Time Intelligence module not loaded.')) }
  ];

  // Expose the shared design-system helpers so add-on modules reuse the SAME
  // components (cards, filter bar, selects, toggles, pager) — no parallel set.
  window.NpsUI = { el, $, card, chartBox, filterBar, selectEl, toggleGroup, valueModeGroup, pager, emptyState, closeMenus, COLORS, PRESETS, DATE_LABEL, sf };

  function buildTabs() {
    const bar = $('#tabs');
    TABS.forEach((t, i) => {
      const tab = el(`<div class="tab ${i===0?'active':''}" data-i="${i}">${t.label}</div>`);
      tab.addEventListener('click', () => selectTab(i));
      bar.appendChild(tab);
    });
  }
  let current = -1;
  async function selectTab(i) {
    if (i === current) return;
    current = i;
    document.querySelectorAll('.tab').forEach((t, idx) => t.classList.toggle('active', idx === i));
    const root = $('#tab-content');
    root.innerHTML = '';
    closeMenus();
    try { await TABS[i].fn(root); } catch (e) { console.error(e); root.appendChild(emptyState('Something went wrong rendering this tab.')); }
    requestAnimationFrame(() => Charts.resizeAll());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.addEventListener('resize', () => Charts.resizeAll());
  document.addEventListener('DOMContentLoaded', () => {
    buildTabs();
    selectTab(0);
    document.querySelectorAll('.nav-item.group').forEach(g => g.addEventListener('click', () => {
      const s = g.nextElementSibling;
      if (s && s.classList.contains('subnav')) { g.classList.toggle('open'); s.style.display = g.classList.contains('open') ? '' : 'none'; }
    }));
  });
})();
