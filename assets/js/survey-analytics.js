/* ============================================================================
 * Survey Analytics — full replication of the live Karnival module
 * (dashboard.karnival.in/#/survey-analytics), scoped to the 5 Haldiram brands.
 * Charts: ECharts (via Charts.*). Data: SurveyApi.* (swappable for a backend).
 *
 * Progressive Drilldown  → NPS · CSAT · CES · RATING
 *      Aggregate gauge + Distribution of Responses
 *      Business Units: bar (Load More / Show All) ⇄ table (7 cols + pagination)
 *      click any row/bar → Country → Zone → State → City → Store (stacked levels)
 * AI Sentiment Analysis  → Executive Pulse (Score Trend · Sentiment
 *      Contribution · Top 5 Aspects) | Voice Of Customer (theme cloud + feed)
 * Area Of Improvements   → Things To Improve | Appreciation (stacked + total)
 * Metrics Comparison     → metric + brand chips + trends + band legend
 * Channel Analysis       → Channel Overview · Communication Journey ·
 *      Submissions by Channel
 * ========================================================================== */
(function (global) {
  'use strict';

  function render(root) {
    const U = global.NpsUI, el = U.el, $ = U.$;
    const API = global.SurveyApi;
    const fmt = n => typeof n === 'number' ? n.toLocaleString() : n;

    const state = { top: 'drill', drill: 'NPS', senti: 'exec', improve: 'improve' };

    root.appendChild(el(`<div class="sa-head"><button class="sa-back" aria-label="Back">←</button><h2>Survey Analytics</h2></div>`));
    const shell = el('<div class="sa-shell"></div>');
    const topBar = el('<div class="sa-toptabs" role="tablist"></div>');
    shell.appendChild(topBar);
    const body = el('<div class="sa-body"></div>');
    shell.appendChild(body);
    root.appendChild(shell);

    const TOPS = [
      { k: 'drill',     label: 'Progressive Drilldown', fn: renderDrilldown },
      { k: 'sentiment', label: 'AI Sentiment Analysis', fn: renderSentiment },
      { k: 'improve',   label: 'Area Of Improvements',  fn: renderImprove },
      { k: 'compare',   label: 'Metrics Comparison',    fn: renderCompare },
      { k: 'channel',   label: 'Channel Analysis',      fn: renderChannel },
      { k: 'time',      label: 'Time Intelligence',     fn: renderTimeIntel }
    ];
    TOPS.forEach(t => {
      const tab = el(`<button class="sa-toptab ${t.k === state.top ? 'active' : ''}" role="tab" data-k="${t.k}">${t.label}</button>`);
      tab.addEventListener('click', () => { state.top = t.k; topBar.querySelectorAll('.sa-toptab').forEach(x => x.classList.toggle('active', x.dataset.k === t.k)); paint(); });
      topBar.appendChild(tab);
    });
    function paint() { body.innerHTML = ''; TOPS.find(t => t.k === state.top).fn(body); requestAnimationFrame(() => Charts.resizeAll()); }

    // ---------- shared bits -------------------------------------------------
    function subTabs(items, active, onSelect) {
      const w = el('<div class="sa-subtabs" role="tablist"></div>');
      items.forEach(it => {
        const b = el(`<button class="sa-subtab ${it.k === active ? 'active' : ''}" data-k="${it.k}" role="tab">${it.label}</button>`);
        b.addEventListener('click', () => { w.querySelectorAll('.sa-subtab').forEach(x => x.classList.toggle('active', x.dataset.k === it.k)); onSelect(it.k); });
        w.appendChild(b);
      });
      return w;
    }
    function filterRow(opts) {
      opts = opts || {};
      const st = { period: opts.period || 'This Month', range: opts.range || '01 Jul 2026 - 28 Jul 2026',
        channels: 'Sms, Email, Whatsapp, Other', brands: opts.brand ? API.brandNames[3] : 'All Brands', search: '' };
      const bar = el('<div class="sa-filters"></div>');
      if (opts.search) {
        const s = el('<input class="sa-search" placeholder="Search" />');
        s.addEventListener('input', () => { st.search = s.value; opts.onChange && opts.onChange(st); });
        bar.appendChild(s);
        const sortBtn = el('<button class="sa-tool" title="Sort">⇅</button>');
        sortBtn.addEventListener('click', () => { st.sortFlip = !st.sortFlip; opts.onChange && opts.onChange(st); });
        bar.appendChild(sortBtn);
      }
      bar.appendChild(el('<span style="flex:1"></span>'));
      bar.appendChild(U.selectEl(st.period, ['Today', 'Yesterday', 'This Week', 'This Month', 'Last 7 Days', 'Last 28 Days', 'Custom'], st.period, v => { st.period = v; opts.onChange && opts.onChange(st); }));
      bar.appendChild(el(`<div class="sa-daterange">${st.range}</div>`));
      if (opts.channel) bar.appendChild(U.selectEl(st.channels, ['Sms, Email, Whatsapp, Other', 'Sms', 'Email', 'Whatsapp', 'Other'], st.channels, v => { st.channels = v; opts.onChange && opts.onChange(st); }));
      if (opts.brand) bar.appendChild(U.selectEl(st.brands, ['All Brands'].concat(API.brandNames), st.brands, v => { st.brands = v; opts.onChange && opts.onChange(st); }));
      return { bar: bar, st: st };
    }
    const bandLegend = () => el(`<div class="sa-legend">${API.BAND_COLORS.map(b => `<span class="sa-legend-item"><i class="sa-dot" style="background:${b.color}"></i>${b.label}</span>`).join('')}</div>`);

    // =========================================================================
    // 1. Progressive Drilldown
    // =========================================================================
    function renderDrilldown(host) {
      host.appendChild(subTabs([{ k: 'NPS', label: 'NPS' }, { k: 'CSAT', label: 'CSAT' }, { k: 'CES', label: 'CES' }, { k: 'RATING', label: 'RATING' }],
        state.drill, k => { state.drill = k; draw(); }));
      const holder = el('<div></div>'); host.appendChild(holder);
      draw();

      function draw() {
        holder.innerHTML = '';
        const metric = state.drill;
        const fr = filterRow({ onChange: () => draw() });
        holder.appendChild(fr.bar);

        // ---- Aggregate + distribution
        const agg = API.aggregate(metric);
        const c1 = el('<section class="sa-card"></section>');
        const grid = el('<div class="sa-agg-grid"></div>');
        const gcol = el(`<div><h4 class="sa-h4">Aggregate ${metric} <span class="sa-info" title="Score across all responses">ⓘ</span></h4><div class="sa-gauge"></div></div>`);
        const dcol = el(`<div><h4 class="sa-h4">Distribution of Responses</h4>
          <div class="muted sa-sub">Total Surveys Generated : ${agg.totalSurveys}&nbsp;&nbsp;Responses Received : ${agg.responses}</div></div>`);
        const rows = el('<div class="sa-dist-rows"></div>');
        agg.rows.forEach(r => rows.appendChild(el(`<div class="sa-dist-row">
          <div class="sa-dist-lbl">${r.key} ${r.range ? `<span class="muted">${r.range}</span>` : ''} <span class="sa-star" title="Favourite">☆</span></div>
          <div class="sa-dist-bar"><div class="sa-dist-fill" style="width:${r.pct}%;background:${r.color}">${r.pct >= 6 ? r.pct + '%' : ''}</div></div>
          <div class="sa-dist-n">${r.users} Users</div></div>`)));
        dcol.appendChild(rows);
        grid.appendChild(gcol); grid.appendChild(dcol); c1.appendChild(grid);
        holder.appendChild(c1);
        Charts.surveyGauge($('.sa-gauge', gcol), agg.value, agg.min, agg.max);

        // ---- Business Units + progressive drilldown levels
        const c2 = el('<section class="sa-card"></section>');
        c2.appendChild(el(`<div class="sa-info-banner"><span class="sa-i">ⓘ</span> Click on any brand to drill down to countries, zones, states, cities and stores.</div>`));
        const levels = el('<div></div>');
        c2.appendChild(levels);
        holder.appendChild(c2);
        const path = [];
        renderLevels();

        function renderLevels() {
          levels.innerHTML = '';
          for (let d = 0; d <= path.length; d++) {
            const p = path.slice(0, d);
            levels.appendChild(levelBlock(metric, p, d, path[d] || null, picked => {
              path.length = d; path.push(picked); renderLevels(); requestAnimationFrame(() => Charts.resizeAll());
            }));
          }
          requestAnimationFrame(() => Charts.resizeAll());
        }
      }
    }

    // one drilldown level (bar with Load More/Show All  ⇄  table with pagination)
    function levelBlock(metric, path, depth, selected, onPick) {
      const all = API.drilldown(metric, path);
      const wrap = el('<div class="sa-level"></div>');
      const vs = { view: 'bar', shown: depth === 0 ? 5 : all.length, page: 0, per: 10, search: '', dir: -1 };
      const totalResp = all.reduce((a, r) => a + r.responses, 0);

      const title = depth === 0
        ? `<b>Business Units</b>`
        : `<span class="muted">${['Business Units'].concat(path.slice(0, -1)).join(' › ')} › </span><b>${path[path.length - 1]}</b> <span class="muted">›</span> <b>${API.levelName(depth)}</b>`;
      const agg0 = API.aggregate(metric);
      const respLabel = depth === 0 ? agg0.responses : fmt(totalResp);
      const head = el(`<div class="sa-level-head"><div class="sa-level-title">${title}
        <div class="muted sa-sub">Total Surveys Generated: ${agg0.totalSurveys}&nbsp;&nbsp;Responses Received: ${respLabel}</div></div>
        <div class="sa-level-tools"></div></div>`);
      const tools = $('.sa-level-tools', head);
      const searchEl = el('<input class="sa-search" placeholder="Search" />');
      const sortEl = el('<button class="sa-tool" title="Sort">⇅</button>');
      const barBtn = el('<button class="sa-tool sa-tool-active" title="Bar view">▥</button>');
      const tblBtn = el('<button class="sa-tool" title="Table view">☰</button>');
      if (depth === 0) tools.appendChild(searchEl);
      tools.appendChild(sortEl); tools.appendChild(barBtn); tools.appendChild(tblBtn);
      wrap.appendChild(head);
      wrap.appendChild(bandLegend());
      const canvas = el('<div></div>');
      wrap.appendChild(canvas);

      searchEl.addEventListener('input', () => { vs.search = searchEl.value; vs.shown = depth === 0 ? 5 : all.length; vs.page = 0; paintLevel(); });
      sortEl.addEventListener('click', () => { vs.dir *= -1; paintLevel(); });
      barBtn.addEventListener('click', () => { vs.view = 'bar'; barBtn.classList.add('sa-tool-active'); tblBtn.classList.remove('sa-tool-active'); paintLevel(); });
      tblBtn.addEventListener('click', () => { vs.view = 'tbl'; tblBtn.classList.add('sa-tool-active'); barBtn.classList.remove('sa-tool-active'); paintLevel(); });
      paintLevel();
      return wrap;

      function filtered() {
        let rows = vs.search ? all.filter(r => r.name.toLowerCase().indexOf(vs.search.toLowerCase()) >= 0) : all.slice();
        rows.sort((a, b) => (Number(a.value) - Number(b.value)) * vs.dir);
        return rows;
      }
      function paintLevel() {
        canvas.innerHTML = '';
        const rows = filtered();
        if (vs.view === 'bar') {
          const show = rows.slice(0, vs.shown);
          const box = el(`<div class="chart" style="height:${Math.max(180, show.length * 34 + 80)}px"></div>`);
          canvas.appendChild(box);
          Charts.divergingBars(box, show, { colorFor: API.colorFor, metricLabel: metric,
            tag: metric === 'RATING' ? '' : metric, faded: selected ? [selected] : [],
            onClick: r => { if (API.canDrill(depth)) onPick(r.name); } });
          if (rows.length > vs.shown) {
            const remaining = rows.length - vs.shown;
            const more = el(`<div class="sa-loadmore">
              <button class="sa-outline sa-more">Load More (${Math.min(5, remaining)} more)</button>
              <button class="sa-linkbtn sa-all">Show All (${remaining} remaining)</button>
              <div class="muted sa-sub sa-count">${vs.shown} of ${rows.length} entries shown</div></div>`);
            $('.sa-more', more).addEventListener('click', () => { vs.shown = Math.min(rows.length, vs.shown + 5); paintLevel(); requestAnimationFrame(() => Charts.resizeAll()); });
            $('.sa-all', more).addEventListener('click', () => { vs.shown = rows.length; paintLevel(); requestAnimationFrame(() => Charts.resizeAll()); });
            canvas.appendChild(more);
          }
        } else {
          const start = vs.page * vs.per, pageRows = rows.slice(start, start + vs.per);
          const table = el(`<table class="table sa-table"><thead><tr>
            <th>Name</th><th class="ta-r">Score</th><th class="ta-r">Promoter</th><th class="ta-r">Passive</th>
            <th class="ta-r">Detractor</th><th class="ta-r">Responses</th><th class="ta-r">Trend</th></tr></thead><tbody></tbody></table>`);
          const tb = $('tbody', table);
          pageRows.forEach(r => {
            const col = API.colorFor(Number(r.value));
            const tr = el(`<tr class="sa-rowlink" tabindex="0">
              <td>${r.name}</td>
              <td class="ta-r" style="color:${col};font-weight:600">${r.value}</td>
              <td class="ta-r" style="color:#22c55e">${r.promoter}%</td>
              <td class="ta-r" style="color:#f59e0b">${r.passive}%</td>
              <td class="ta-r" style="color:#ef4444">${r.detractor}%</td>
              <td class="ta-r">${fmt(r.responses)}</td>
              <td class="ta-r" style="color:${r.trend > 0 ? '#22c55e' : r.trend < 0 ? '#ef4444' : '#8b91a0'}">${r.trend > 0 ? '+' : ''}${r.trend}% ${r.trend > 0 ? '↗' : r.trend < 0 ? '↘' : ''}</td></tr>`);
            tr.addEventListener('click', () => { if (API.canDrill(depth)) onPick(r.name); });
            tr.addEventListener('keydown', e => { if (e.key === 'Enter' && API.canDrill(depth)) onPick(r.name); });
            tb.appendChild(tr);
          });
          canvas.appendChild(table);
          // pagination footer
          const pages = Math.max(1, Math.ceil(rows.length / vs.per));
          const foot = el(`<div class="sa-pager">
            <div class="sa-pager-l">${'' }<span class="sa-perpage"></span> <span class="muted">per page</span></div>
            <div class="muted">Showing <b>${rows.length ? start + 1 : 0}</b> to <b>${Math.min(start + vs.per, rows.length)}</b> of <b>${rows.length}</b> entries</div>
            <div class="sa-pager-r"><button class="sa-outline sa-prev" ${vs.page === 0 ? 'disabled' : ''}>Previous</button>
              <span class="muted">Page</span> <span class="sa-pagebox">${vs.page + 1}</span> <span class="muted">of ${pages}</span>
              <button class="sa-outline sa-next" ${vs.page >= pages - 1 ? 'disabled' : ''}>Next</button></div></div>`);
          $('.sa-perpage', foot).appendChild(U.selectEl(String(vs.per), ['10', '25', '50', '100'], String(vs.per), v => { vs.per = +v; vs.page = 0; paintLevel(); }));
          $('.sa-prev', foot).addEventListener('click', () => { if (vs.page > 0) { vs.page--; paintLevel(); } });
          $('.sa-next', foot).addEventListener('click', () => { if (vs.page < pages - 1) { vs.page++; paintLevel(); } });
          canvas.appendChild(foot);
        }
      }
    }

    // =========================================================================
    // 2. AI Sentiment Analysis
    // =========================================================================
    function renderSentiment(host) {
      host.appendChild(subTabs([{ k: 'exec', label: 'Executive Pulse' }, { k: 'voc', label: 'Voice Of Customer' }],
        state.senti, k => { state.senti = k; draw(); }));
      const holder = el('<div></div>'); host.appendChild(holder);
      draw();

      function draw() {
        holder.innerHTML = '';
        const fr = filterRow({ brand: true, period: 'This Week', range: '27 Jul 2026 - 28 Jul 2026', onChange: () => draw() });
        holder.appendChild(fr.bar);

        if (state.senti === 'exec') {
          const d = API.sentimentExecutivePulse();
          // Card 1 — Sentiment Score Trend
          const c1 = el('<section class="sa-card"></section>');
          c1.appendChild(el(`<h4 class="sa-h4">Sentiment Score Trend <span class="sa-info" title="Aggregated sentiment score">ⓘ</span></h4>`));
          const g1 = el('<div class="sa-agg-grid"></div>');
          g1.appendChild(el(`<div class="sa-senti-col">
            <div class="sa-huge">${d.score.toFixed(1)}</div>
            <div class="sa-neutral-chip">${d.label} <span class="muted">☺</span></div>
            <div class="sa-delta">↗ ${d.delta}</div>
            <div class="muted sa-sub">${d.vsLabel}</div></div>`));
          const b1 = el('<div class="chart" style="height:340px"></div>'); g1.appendChild(b1);
          c1.appendChild(g1); holder.appendChild(c1);
          Charts.sentimentBands(b1, d.trend, d.bands);

          // Card 2 — Customer Sentiment Contribution
          const c2 = el('<section class="sa-card"></section>');
          c2.appendChild(el('<h4 class="sa-h4">Customer Sentiment Contribution</h4>'));
          const g2 = el('<div class="sa-agg-grid"></div>');
          const pieBox = el('<div class="chart" style="height:300px"></div>');
          const stkBox = el('<div class="chart" style="height:300px"></div>');
          g2.appendChild(pieBox); g2.appendChild(stkBox);
          c2.appendChild(g2); holder.appendChild(c2);
          Charts.contributionPie(pieBox, d.contribution.pie);
          Charts.contributionStacked(stkBox, d.contribution);

          // Card 3 — Top 5 Aspects Driving Sentiment
          const c3 = el('<section class="sa-card"></section>');
          c3.appendChild(el('<h4 class="sa-h4">Top 5 Aspects Driving Sentiment</h4>'));
          const g3 = el('<div class="sa-aspects"></div>');
          g3.appendChild(aspectCol('Most Negative Aspects', 'neg', d.aspects.negative, '#ef4444'));
          g3.appendChild(aspectCol('Most Positive Aspects', 'pos', d.aspects.positive, '#22c55e'));
          c3.appendChild(g3); holder.appendChild(c3);
        } else {
          const d = API.sentimentVoiceOfCustomer();
          const c = el('<section class="sa-card"></section>');
          c.appendChild(el('<h4 class="sa-h4">Customer Feedback</h4>'));
          const cloud = el('<div class="sa-themes"></div>');
          d.themes.forEach(t => cloud.appendChild(el(`<span class="sa-theme" style="font-size:${t.size}px">${t.theme}<span class="sa-theme-n">${t.count}</span></span>`)));
          c.appendChild(cloud); holder.appendChild(c);
          d.feedback.forEach(f => {
            const col = f.score >= 81 ? '#16a34a' : f.score >= 61 ? '#22c55e' : f.score >= 41 ? '#f59e0b' : f.score >= 21 ? '#ef4444' : '#991b1b';
            holder.appendChild(el(`<section class="sa-card sa-fb">
              <div class="sa-fb-score">${f.score}</div>
              <div>
                <span class="sa-fb-label" style="background:${col}1f;color:${col}">${f.label} ☺</span>
                <div class="sa-fb-q"><b>Comment:</b> ${f.question}</div>
                <div class="muted sa-fb-a">${f.body}</div>
                <button class="sa-ai">✨ AI Summary</button>
              </div>
              <div class="sa-fb-side"><button class="sa-outline">View Survey</button>
                <div class="muted sa-sub" style="margin-top:18px">Created: <b>${f.date}</b></div></div></section>`));
          });
        }
      }
    }
    function aspectCol(title, cls, items, color) {
      const c = el(`<div><div class="sa-aspect-head ${cls}">${cls === 'neg' ? '👎' : '👍'} ${title}</div></div>`);
      const max = Math.max.apply(null, items.map(i => i.score)) || 100;
      items.forEach(i => c.appendChild(el(`<div class="sa-aspect">
        <div class="sa-aspect-top"><span>${i.aspect}</span><span><b style="color:${color}">${i.score}</b> <span class="muted">• ${i.label}</span></span></div>
        <div class="sa-aspect-bar"><i style="width:${Math.max(3, i.score / max * 100)}%;background:${color}"></i></div>
        <div class="sa-aspect-n muted">${i.n}</div></div>`)));
      return c;
    }

    // =========================================================================
    // 3. Area Of Improvements
    // =========================================================================
    function renderImprove(host) {
      host.appendChild(subTabs([{ k: 'improve', label: 'Things To Improve' }, { k: 'appreciation', label: 'Appreciation' }],
        state.improve, k => { state.improve = k; draw(); }));
      const holder = el('<div></div>'); host.appendChild(holder);
      draw();

      function draw() {
        holder.innerHTML = '';
        const vs = { shown: 5, search: '', dir: -1 };
        const fr = filterRow({ search: true, onChange: st => { vs.search = st.search || ''; vs.shown = 5; paintCard(); } });
        holder.appendChild(fr.bar);
        const d = API.improvements(state.improve);
        const c = el('<section class="sa-card"></section>');
        c.appendChild(el(`<div class="sa-info-banner"><span class="sa-i">ⓘ</span> Click on any brand to drill down to countries, zones, states, cities and stores.</div>`));
        c.appendChild(el(`<div><b>Business Units</b><div class="muted sa-sub">Total Surveys Generated: ${d.totalSurveys}&nbsp;&nbsp;Responses Received: ${d.responses}</div></div>`));
        c.appendChild(el(`<div class="sa-legend">${d.categories.map(([n, col]) => `<span class="sa-legend-item"><i class="sa-dot" style="background:${col}"></i>${n}</span>`).join('')}</div>`));
        const canvas = el('<div></div>');
        c.appendChild(canvas); holder.appendChild(c);
        paintCard();

        function paintCard() {
          canvas.innerHTML = '';
          let rows = vs.search ? d.rows.filter(r => r.name.toLowerCase().indexOf(vs.search.toLowerCase()) >= 0) : d.rows.slice();
          rows.sort((a, b) => (a.total - b.total) * vs.dir);
          const show = rows.slice(0, vs.shown);
          const box = el(`<div class="chart" style="height:${Math.max(200, show.length * 34 + 90)}px"></div>`);
          canvas.appendChild(box);
          Charts.stackedH(box, { categories: d.categories, brands: show.map(r => r.name),
            values: show.reduce((m, r) => { m[r.name] = r.values; return m; }, {}), totals: show.map(r => r.total) });
          if (rows.length > vs.shown) {
            const remaining = rows.length - vs.shown;
            const more = el(`<div class="sa-loadmore">
              <button class="sa-outline sa-more">Load More (${Math.min(5, remaining)} more)</button>
              <button class="sa-linkbtn sa-all">Show All (${remaining} remaining)</button>
              <div class="muted sa-sub">${vs.shown} of ${rows.length} entries shown</div></div>`);
            $('.sa-more', more).addEventListener('click', () => { vs.shown = Math.min(rows.length, vs.shown + 5); paintCard(); requestAnimationFrame(() => Charts.resizeAll()); });
            $('.sa-all', more).addEventListener('click', () => { vs.shown = rows.length; paintCard(); requestAnimationFrame(() => Charts.resizeAll()); });
            canvas.appendChild(more);
          }
          requestAnimationFrame(() => Charts.resizeAll());
        }
      }
    }

    // =========================================================================
    // 4. Metrics Comparison
    // =========================================================================
    function renderCompare(host) {
      const METRICS = { 'NPS (Net Promoter Score)': 'NPS', 'CSAT (Customer Satisfaction)': 'CSAT', 'CES (Customer Effort Score)': 'CES', 'RATING (Overall Rating)': 'RATING' };
      const cmp = { metricLabel: 'NPS (Net Promoter Score)', brands: ['HALDIRAM MARKETING PVT. LTD. - HEFPL', 'Haldiram UAE'] };
      const holder = el('<div></div>'); host.appendChild(holder);
      draw();
      function draw() {
        holder.innerHTML = '';
        const fr = filterRow({ onChange: () => draw() });
        holder.appendChild(fr.bar);
        const pick = el('<div class="sa-picker-grid"></div>');
        const l = el('<div><label class="sa-plabel">Select Matric</label></div>');
        l.appendChild(U.selectEl(cmp.metricLabel, Object.keys(METRICS), cmp.metricLabel, v => { cmp.metricLabel = v; draw(); }));
        const r = el('<div><label class="sa-plabel">Select Brands to Compare (max 10)</label></div>');
        r.appendChild(U.selectEl(cmp.brands.join(', '), API.brandNames.slice(0, 20), cmp.brands[0], v => {
          const i = cmp.brands.indexOf(v);
          if (i >= 0) { if (cmp.brands.length > 1) cmp.brands.splice(i, 1); }
          else if (cmp.brands.length < 10) cmp.brands.push(v);
          draw();
        }));
        pick.appendChild(l); pick.appendChild(r); holder.appendChild(pick);

        const palette = ['#2563eb', '#22c55e', '#a855f7', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#14b8a6', '#8b5cf6', '#f97316'];
        const chips = el(`<div><div class="sa-sub" style="font-weight:600">Selected Brands (${cmp.brands.length})</div><div class="sa-chip-row"></div></div>`);
        const cr = $('.sa-chip-row', chips);
        cmp.brands.forEach((b, i) => {
          const chip = el(`<span class="sa-brandchip" style="background:${palette[i % palette.length]}">${b} <span class="sa-brandchip-x">⊗</span></span>`);
          chip.querySelector('.sa-brandchip-x').addEventListener('click', () => { if (cmp.brands.length > 1) { cmp.brands.splice(i, 1); draw(); } });
          cr.appendChild(chip);
        });
        holder.appendChild(chips);

        const key = METRICS[cmp.metricLabel];
        const md = API.metricsComparison(key, cmp.brands);
        const c = el('<section class="sa-card"></section>');
        c.appendChild(el(`<div class="sa-cmp-title">${key} Trends Comparison</div>`));
        c.appendChild(el(`<div class="muted sa-sub">Comparing ${cmp.brands.length} brands over ${fr.st.period}</div>`));
        const box = el('<div class="chart" style="height:380px"></div>');
        c.appendChild(box);
        // band legend footer
        c.appendChild(el(`<div class="sa-bandfoot">${API.BAND_COLORS.map(b => `<div class="sa-bandfoot-i"><div class="muted">${b.short}</div><div><i class="sa-dot" style="background:${b.color}"></i> <b>${b.range}</b></div></div>`).join('')}</div>`));
        holder.appendChild(c);
        Charts.compareLines(box, md.dates, md.series, md.min, md.max);
      }
    }

    // =========================================================================
    // 5. Channel Analysis — 3 cards
    // =========================================================================
    function renderChannel(host) {
      const vs = { view: 'bar' };
      const holder = el('<div></div>'); host.appendChild(holder);
      draw();
      function draw() {
        holder.innerHTML = '';
        const fr = filterRow({ channel: true, brand: true, onChange: () => draw() });
        holder.appendChild(fr.bar);
        const d = API.channelAnalysis();

        // Card 1 — Channel Overview
        const c1 = el('<section class="sa-card"></section>');
        const h1 = el(`<div class="card-head" style="margin-bottom:8px"><div class="sa-h4" style="margin:0">Channel Overview</div><div class="right"></div></div>`);
        const barT = el('<button class="sa-tool sa-tool-active" title="Bar">▥</button>');
        const lineT = el('<button class="sa-tool" title="Line">📈</button>');
        $('.right', h1).appendChild(barT); $('.right', h1).appendChild(lineT);
        c1.appendChild(h1);
        const b1 = el('<div class="chart" style="height:420px"></div>');
        c1.appendChild(b1); holder.appendChild(c1);
        const paint1 = () => Charts.channelStacked(b1, d.dates, d.overview, vs.view === 'line');
        barT.addEventListener('click', () => { vs.view = 'bar'; barT.classList.add('sa-tool-active'); lineT.classList.remove('sa-tool-active'); paint1(); });
        lineT.addEventListener('click', () => { vs.view = 'line'; lineT.classList.add('sa-tool-active'); barT.classList.remove('sa-tool-active'); paint1(); });
        paint1();

        // Card 2 — Survey Channel Communication Journey
        const c2 = el('<section class="sa-card"></section>');
        c2.appendChild(el('<div class="sa-h4">Survey Channel Communication Journey</div>'));
        const b2 = el('<div class="chart" style="height:360px"></div>');
        c2.appendChild(b2); holder.appendChild(c2);
        Charts.journeyBars(b2, d.journey);

        // Card 3 — Survey Submissions by Channel
        const c3 = el('<section class="sa-card"></section>');
        c3.appendChild(el('<div class="sa-h4">Survey Submissions by Channel</div>'));
        const b3 = el('<div class="chart" style="height:320px"></div>');
        c3.appendChild(b3); holder.appendChild(c3);
        Charts.submissionsDonut(b3, d.submissions);
      }
    }

    // =========================================================================
    // 6. Time Intelligence — time-of-day / day-of-week analysis
    //    Same data engine (MockApi.TimeIntel) rendered in Survey Analytics'
    //    visual language: sa-card / sa-h4 / sa-filters / sa-tool / sa-modal.
    // =========================================================================
    function renderTimeIntel(host) {
      const TI = API.TimeIntel;
      if (!TI) { host.appendChild(el('<section class="sa-card"><div class="empty"><div class="big">Time Intelligence engine not loaded.</div></div></section>')); return; }
      let slots = TI.getSlots();
      // Default scope is Brand with every brand selected — mathematically the
      // same aggregate the old "Overall" scope produced (tiMatrixFor sums the
      // exact same brands either way), just expressed as "all brands picked"
      // instead of a separate mode, so there's one fewer concept to explain.
      const mainF = { scope: 'Brand', entity: API.brandNames.slice(), period: 'This Month' };
      const wwF = { scope: 'Brand', entity: API.brandNames.slice(), period: 'This Month' };
      const vs = { slotView: 'table', wwView: 'table', sortKey: 'nps', sortDir: -1 };
      const npsCol = v => v >= 50 ? '#22c55e' : v >= 1 ? '#f59e0b' : '#ef4444';
      const arrow = t => t > 1 ? `<span style="color:#22c55e">+${t}% ↗</span>` : t < -1 ? `<span style="color:#ef4444">${t}% ↘</span>` : `<span class="muted">0%</span>`;
      const fmtHour = h => String(h).padStart(2, '0') + ':00';
      // A hidden-by-low-sample cell — the dash needs a reason, not just a dash.
      const dashTip = () => `<span class="muted" title="Hidden — below the ${TI.MIN_SAMPLE}-response threshold.">—</span>`;
      // Drill sections (NPS by Time Slot, NPS by Order Type) are each built
      // by makeDrillSection() further below — same stacked-levels UI, same
      // toggle-close behavior, parameterized by how to open/continue a
      // session so the rendering code is written once and shared.

      // Scope + Entity filter: Overall | Brand | Country. Picking Brand/Country
      // reveals a second dropdown listing that dimension's options. Both
      // Brand and Country are multi-select: entity is always an array;
      // clicking an option in the dropdown toggles its membership (matches
      // the existing brand-chip picker in Metrics Comparison).
      function brandEntityLabel(sel) {
        if (sel.length === API.brandNames.length) return 'All Brands';
        if (sel.length === 1) return sel[0];
        return sel.length + ' brands';
      }
      function countryEntityLabel(sel) {
        if (sel.length === TI.countryList.length) return 'All Countries';
        if (sel.length === 1) return sel[0];
        return sel.length + ' countries';
      }
      // Returns { row, chips } as two SEPARATE elements — row is a single-line
      // control meant to sit inline with the other filters (never taller than
      // them); chips is a full-width pill row meant to be placed below the
      // whole filter bar, so selecting multiple brands/countries never
      // distorts the filter row's alignment.
      // Brand picker: button shows "All Brands" (or "N brands" / a single
      // name) and opens a searchable checklist with a Select All/Deselect
      // All toggle — replaces the old plain "Overall" mode entirely, since
      // "every brand selected" already sums to the exact same numbers.
      function brandMultiSelect(state, onChange) {
        const btn = el('<div class="select" tabindex="0"></div>');
        const paintBtn = () => { btn.textContent = brandEntityLabel(state.entity); };
        paintBtn();
        btn.addEventListener('click', e => {
          e.stopPropagation();
          U.closeMenus();
          let q = '';
          const menu = el('<div class="menu sa-brand-menu"></div>');
          menu.addEventListener('click', e2 => e2.stopPropagation());
          const searchRow = el('<div class="sa-brand-search"><input type="text" placeholder="Search Brands…"/><span class="sa-brand-search-ic">🔍</span></div>');
          const bulkRow = el('<div></div>');
          const listWrap = el('<div></div>');
          const hintRow = el('<div class="sa-brand-hint" style="display:none">At least one brand must stay selected.</div>');
          menu.appendChild(searchRow); menu.appendChild(bulkRow); menu.appendChild(listWrap); menu.appendChild(hintRow);
          let hintTimer = null;
          function flashHint() { hintRow.style.display = ''; clearTimeout(hintTimer); hintTimer = setTimeout(() => { hintRow.style.display = 'none'; }, 2200); }
          function paintMenu() {
            const names = API.brandNames.filter(n => !q.trim() || n.toLowerCase().indexOf(q.trim().toLowerCase()) >= 0);
            const allOn = names.length > 0 && names.every(n => state.entity.indexOf(n) >= 0);
            bulkRow.innerHTML = '';
            const bulkBtn = el(`<div class="mi"><b>${allOn ? 'Deselect All' : 'Select All'}</b></div>`);
            bulkBtn.addEventListener('click', () => {
              if (allOn) {
                const remaining = state.entity.filter(n => names.indexOf(n) < 0);
                if (!remaining.length) { flashHint(); state.entity = [names[0]]; }
                else state.entity = remaining;
              } else { const set = new Set(state.entity); names.forEach(n => set.add(n)); state.entity = Array.from(set); }
              paintBtn(); paintMenu(); onChange();
            });
            bulkRow.appendChild(bulkBtn);
            listWrap.innerHTML = '';
            if (!names.length) { listWrap.appendChild(el('<div class="mi muted">No brands match.</div>')); }
            names.forEach(n => {
              const on = state.entity.indexOf(n) >= 0;
              const item = el(`<div class="mi ${on ? 'checked' : ''}">${n}${on ? '<span class="ck">✓</span>' : ''}</div>`);
              item.addEventListener('click', () => {
                const i = state.entity.indexOf(n);
                if (i >= 0) { if (state.entity.length > 1) state.entity.splice(i, 1); else { flashHint(); return; } }
                else state.entity.push(n);
                paintBtn(); paintMenu(); onChange();
              });
              listWrap.appendChild(item);
            });
          }
          $('input', searchRow).addEventListener('input', ev => { q = ev.target.value; paintMenu(); });
          paintMenu();
          document.body.appendChild(menu);
          const r = btn.getBoundingClientRect();
          const left = Math.min(r.left, window.innerWidth - 260);
          menu.style.left = left + 'px'; menu.style.top = (r.bottom + 6) + 'px';
          $('input', searchRow).focus();
        });
        return btn;
      }
      // No Scope selector, no Country option — just the one brand picker.
      // state.scope stays fixed at 'Brand' (every TI.* function still keys
      // off it); state.entity is always an array of brand names.
      function scopeEntityControl(state, onChange) {
        state.scope = 'Brand';
        return { row: brandMultiSelect(state, onChange), chips: el('<div></div>') };
      }
      // "Custom" is encoded as 'Custom:<days>' so every TI.* call that takes a
      // single period string keeps working unchanged.
      function effectivePeriod(state) { return state.period === 'Custom' ? 'Custom:' + TI.daysBetween(state.customFrom, state.customTo) : state.period; }
      // Period filter + its date-range readout; picking Custom swaps the
      // readout for two date inputs.
      function periodRangeControl(state, onChange) {
        const wrap = el('<div style="position:relative;display:inline-flex;"></div>');
        const row = el('<div style="display:flex;align-items:center;gap:8px;"></div>');
        const note = el('<div class="sa-field-note" style="display:none"></div>');
        wrap.appendChild(row); wrap.appendChild(note);
        function showNote(text, kind) { note.textContent = text; note.className = 'sa-field-note' + (kind ? ' ' + kind : ''); note.style.display = ''; }
        function hideNote() { note.style.display = 'none'; }
        function paint() {
          row.innerHTML = ''; hideNote();
          row.appendChild(U.selectEl(state.period, TI.PERIODS, state.period, v => {
            state.period = v;
            if (v === 'Custom' && !state.customFrom) {
              const r = TI.periodRange('Last 7 Days'); state.customFrom = TI.fmtISO(r[0]); state.customTo = TI.fmtISO(r[1]);
              paint(); onChange(); showNote('Defaulted to the last 7 days — adjust below.', 'sa-field-note-info'); return;
            }
            paint(); onChange();
          }));
          if (state.period === 'Custom') {
            const fromI = el(`<input type="date" class="sa-search" style="min-width:0" value="${state.customFrom}"/>`);
            const toI = el(`<input type="date" class="sa-search" style="min-width:0" value="${state.customTo}"/>`);
            function validateRange() {
              if (toI.value && fromI.value && toI.value < fromI.value) { showNote('"To" date is before "From" — pick a "To" date on or after it.', 'sa-field-note-error'); return false; }
              const days = TI.daysBetween(fromI.value, toI.value);
              if (days > 150) { showNote(`${days}-day range — estimates beyond ~5 months use a capped volume model.`, 'sa-field-note-info'); return true; }
              hideNote(); return true;
            }
            fromI.addEventListener('change', () => { state.customFrom = fromI.value; validateRange(); onChange(); });
            toI.addEventListener('change', () => { state.customTo = toI.value; validateRange(); onChange(); });
            row.appendChild(fromI); row.appendChild(el('<span class="muted">to</span>')); row.appendChild(toI);
            validateRange();
          } else {
            const [from, to] = TI.periodRange(state.period);
            row.appendChild(el(`<div class="sa-daterange">${TI.formatRange(from, to)}</div>`));
          }
        }
        paint();
        return wrap;
      }

      // ---- header: title + ⚙ Slots + filters, all in one row --------------
      const hdr = el('<section class="sa-card sa-ti-hdr"></section>');
      const gearBtn = el(`<button class="sa-tool sa-gear-btn" title="Configure time slots">⚙ Slots <span class="muted">(${slots.length})</span></button>`);
      gearBtn.addEventListener('click', openSlotModal);
      const mainFilters = el(`<div class="sa-filters" style="margin-top:0"><div class="sa-h4" style="margin:0;white-space:nowrap">⏰ Time-Based Analysis</div></div>`);
      mainFilters.appendChild(el('<span style="flex:1"></span>'));
      mainFilters.appendChild(gearBtn);
      mainFilters.appendChild(periodRangeControl(mainF, () => { slotDrill.reset(); debounceMain(); }));
      const mainScopeEntity = scopeEntityControl(mainF, () => { slotDrill.reset(); debounceMain(); });
      mainFilters.appendChild(mainScopeEntity.row);
      hdr.appendChild(mainFilters);
      hdr.appendChild(mainScopeEntity.chips);
      host.appendChild(hdr);

      // ---- KPI strip -------------------------------------------------------
      const kpiCard = el('<section class="sa-card"></section>');
      const kpis = el('<div class="sa-ti-kpis"></div>');
      kpiCard.appendChild(kpis);
      host.appendChild(kpiCard);

      // ---- NPS by Time Slot (Table ⇄ Chart) --------------------------------
      const slotCard = el('<section class="sa-card"></section>');
      const sHead = el(`<div class="card-head" style="margin-bottom:8px"><div class="sa-h4" style="margin:0">NPS by Time Slot</div><div class="right"></div></div>`);
      const tblT = el('<button class="sa-tool sa-tool-active" title="Table">☰</button>');
      const chtT = el('<button class="sa-tool" title="Chart">▥</button>');
      tblT.addEventListener('click', () => { vs.slotView = 'table'; tblT.classList.add('sa-tool-active'); chtT.classList.remove('sa-tool-active'); drawSlots(); });
      chtT.addEventListener('click', () => { vs.slotView = 'chart'; chtT.classList.add('sa-tool-active'); tblT.classList.remove('sa-tool-active'); drawSlots(); });
      $('.right', sHead).appendChild(tblT); $('.right', sHead).appendChild(chtT);
      slotCard.appendChild(sHead);
      slotCard.appendChild(el(`<div class="sa-info-banner"><span class="sa-i">ⓘ</span> Click on any time slot to drill down to brands, countries, zones, states, cities and stores.</div>`));
      const slotBody = el('<div></div>');
      slotCard.appendChild(slotBody);
      host.appendChild(slotCard);

      // Drilldown renders in its OWN card, separate from the slot table above
      // — hidden entirely until a slot is selected, so no empty box lingers.
      const drillCard = el('<section class="sa-card"></section>');
      drillCard.style.display = 'none';
      const levelsContainer = el('<div></div>');
      drillCard.appendChild(levelsContainer);
      host.appendChild(drillCard);
      const slotDrill = makeDrillSection(levelsContainer, drillCard,
        id => TI.drilldown(slots, mainF.scope, mainF.entity, effectivePeriod(mainF), id, null),
        (dd, path) => TI.drillAt(dd.effScope, dd.effEntity, path, dd.hours, dd.dayIdx, effectivePeriod(mainF)));

      // ---- NPS by Order Type (own independent filter, own drilldown) ------
      // A standalone "Dimension" card, not a time cut — Dine-in vs Takeaway,
      // fixed rows (no ⚙ config, since order type is a bill field, not
      // something an admin defines). Sits right after NPS by Time Slot: both
      // support the full drilldown, Weekday vs Weekend (no drilldown) closes
      // the page out.
      const otF = { entity: API.brandNames.slice(), period: 'This Month' };
      const otVs = { view: 'table' };
      const otCard = el('<section class="sa-card"></section>');
      const otHead = el(`<div class="card-head" style="margin-bottom:8px"><div class="sa-h4" style="margin:0">NPS by Order Type</div><div class="right"></div></div>`);
      const otTblT = el('<button class="sa-tool sa-tool-active" title="Table">☰</button>');
      const otChtT = el('<button class="sa-tool" title="Chart">▥</button>');
      otTblT.addEventListener('click', () => { otVs.view = 'table'; otTblT.classList.add('sa-tool-active'); otChtT.classList.remove('sa-tool-active'); drawOT(); });
      otChtT.addEventListener('click', () => { otVs.view = 'chart'; otChtT.classList.add('sa-tool-active'); otTblT.classList.remove('sa-tool-active'); drawOT(); });
      $('.right', otHead).appendChild(otTblT); $('.right', otHead).appendChild(otChtT);
      otCard.appendChild(otHead);
      const otFilters = el('<div class="sa-filters" style="margin-top:0"></div>');
      otFilters.appendChild(el('<span style="flex:1"></span>'));
      otFilters.appendChild(periodRangeControl(otF, () => { otDrill.reset(); debounceOT(); }));
      const otScopeEntity = scopeEntityControl(otF, () => { otDrill.reset(); debounceOT(); });
      otFilters.appendChild(otScopeEntity.row);
      otCard.appendChild(otFilters);
      otCard.appendChild(otScopeEntity.chips);
      otCard.appendChild(el('<div class="muted sa-sub" style="margin-bottom:10px">Uses its own filters — independent of the section above.</div>'));
      otCard.appendChild(el(`<div class="sa-info-banner"><span class="sa-i">ⓘ</span> Click on Dine-in or Takeaway to drill down to brands, countries, zones, states, cities and stores.</div>`));
      const otBody = el('<div></div>');
      otCard.appendChild(otBody);
      host.appendChild(otCard);
      const otDrillCard = el('<section class="sa-card"></section>');
      otDrillCard.style.display = 'none';
      const otLevelsContainer = el('<div></div>');
      otDrillCard.appendChild(otLevelsContainer);
      host.appendChild(otDrillCard);
      const otDrill = makeDrillSection(otLevelsContainer, otDrillCard,
        id => TI.orderTypeDrilldown(otF.entity, id, effectivePeriod(otF)),
        // dd.scope is just the order type string itself here (tiOrderTypeDrilldown
        // sets it to the metric's own name, with no "· Day" suffix like slots get).
        (dd, path) => TI.orderTypeDrillAt(otF.entity, path, dd.scope, effectivePeriod(otF)));

      // ---- Weekday vs Weekend (own filter + ⚙, all in one row) ------------
      const wwCard = el('<section class="sa-card"></section>');
      const wTblT = el('<button class="sa-tool sa-tool-active" title="Table">☰</button>');
      const wChtT = el('<button class="sa-tool" title="Chart">▥</button>');
      wTblT.addEventListener('click', () => { vs.wwView = 'table'; wTblT.classList.add('sa-tool-active'); wChtT.classList.remove('sa-tool-active'); drawWW(); });
      wChtT.addEventListener('click', () => { vs.wwView = 'chart'; wChtT.classList.add('sa-tool-active'); wTblT.classList.remove('sa-tool-active'); drawWW(); });
      const wGear = el('<button class="sa-tool" title="Configure weekend days">⚙ Weekend days</button>');
      wGear.addEventListener('click', openWeekendModal);
      const wwFilters = el(`<div class="sa-filters" style="margin-top:0"><div class="sa-h4" style="margin:0;white-space:nowrap">Weekday vs Weekend</div></div>`);
      wwFilters.appendChild(el('<span style="flex:1"></span>'));
      wwFilters.appendChild(wTblT); wwFilters.appendChild(wChtT); wwFilters.appendChild(wGear);
      wwFilters.appendChild(periodRangeControl(wwF, () => debounceWW()));
      const wwScopeEntity = scopeEntityControl(wwF, () => debounceWW());
      wwFilters.appendChild(wwScopeEntity.row);
      wwCard.appendChild(wwFilters);
      wwCard.appendChild(wwScopeEntity.chips);
      wwCard.appendChild(el('<div class="muted sa-sub" style="margin-bottom:10px">Uses its own filters — independent of the section above.</div>'));
      const wwBody = el('<div></div>');
      wwCard.appendChild(wwBody);
      host.appendChild(wwCard);

      // ---- render pipeline -------------------------------------------------
      let mt = null, wt = null, ot = null;
      function debounceMain() { clearTimeout(mt); slotBody.innerHTML = ''; slotBody.appendChild(skel(240)); mt = setTimeout(drawMain, 260); }
      function debounceWW() { clearTimeout(wt); wwBody.innerHTML = ''; wwBody.appendChild(skel(200)); wt = setTimeout(drawWW, 260); }
      function debounceOT() { clearTimeout(ot); otBody.innerHTML = ''; otBody.appendChild(skel(160)); ot = setTimeout(drawOT, 260); }
      const skel = h => el(`<div class="sa-skel" style="height:${h}px"></div>`);

      function drawMain() {
        if (!slots.length) { kpis.innerHTML = ''; slotBody.innerHTML = ''; slotBody.appendChild(noSlots()); return; }
        const d = TI.aggregateAll(slots, mainF.scope, mainF.entity, effectivePeriod(mainF));
        const ov = d.overview;
        kpis.innerHTML = '';
        [['Overall NPS', ov.overallNps, npsCol(ov.overallNps)], ['Total Responses', fmt(ov.totalVolume), null],
         ['Best Slot', ov.best ? ov.best.name : '—', '#22c55e', ov.best ? 'NPS ' + ov.best.nps : ''],
         ['Lowest Slot', ov.worst ? ov.worst.name : '—', '#ef4444', ov.worst ? 'NPS ' + ov.worst.nps : '']]
          .forEach(([l, v, c, sub]) => kpis.appendChild(el(`<div class="sa-ti-kpi"><div class="sa-ti-kpi-l">${l}</div><div class="sa-ti-kpi-v" ${c ? `style="color:${c}"` : ''}>${v}</div>${sub ? `<div class="muted sa-sub">${sub}</div>` : ''}</div>`)));
        drawSlots(ov.metrics);
        requestAnimationFrame(() => Charts.resizeAll());
      }

      function drawSlots(metrics) {
        metrics = metrics || TI.slotMetrics(slots, mainF.scope, mainF.entity, effectivePeriod(mainF));
        slotBody.innerHTML = '';
        if (vs.slotView === 'chart') {
          const b = el('<div class="chart" style="height:360px"></div>');
          slotBody.appendChild(b);
          const sel = metrics.find(m => slotDrill.isSelected(m.id));
          Charts.npsVolume(b, metrics, { selectedId: sel ? sel.id : null, onClick: m => { slotDrill.toggle(m.id); drawSlots(metrics); } });
        } else {
          const rows = metrics.slice().sort((a, b) => (a[vs.sortKey] - b[vs.sortKey]) * vs.sortDir);
          const th = (k, l) => `<th class="ta-r sa-sortable" data-k="${k}">${l}${vs.sortKey === k ? (vs.sortDir < 0 ? ' ▾' : ' ▴') : ''}</th>`;
          const t = el(`<table class="table sa-table"><thead><tr><th>Time Slot</th><th>Window</th>${th('nps', 'NPS')}${th('volume', 'Responses')}<th class="ta-r">vs prev</th><th class="ta-r">Detractor %</th></tr></thead><tbody></tbody></table>`);
          const tb = $('tbody', t);
          rows.forEach(m => {
            const cell = m.lowSample ? '<span class="sa-lowpill">Low sample</span>' : `<span style="color:${npsCol(m.nps)};font-weight:600">${m.nps}</span>`;
            const isSel = slotDrill.isSelected(m.id);
            const tr = el(`<tr class="sa-rowlink" tabindex="0" ${isSel ? 'style="background:var(--hover)"' : ''}><td><b>${m.name}</b></td><td class="muted">${fmtHour(m.start)}–${fmtHour(m.end)}</td>
              <td class="ta-r">${cell}</td><td class="ta-r">${fmt(m.volume)}</td>
              <td class="ta-r">${m.lowSample ? dashTip() : arrow(m.trend)}</td><td class="ta-r">${m.lowSample ? dashTip() : m.detractorPct + '%'}</td></tr>`);
            const toggle = () => { slotDrill.toggle(m.id); drawSlots(metrics); };
            tr.addEventListener('click', toggle);
            tr.addEventListener('keydown', e => { if (e.key === 'Enter') toggle(); });
            tb.appendChild(tr);
          });
          t.querySelectorAll('.sa-sortable').forEach(h => h.addEventListener('click', () => {
            const k = h.dataset.k; if (vs.sortKey === k) vs.sortDir *= -1; else { vs.sortKey = k; vs.sortDir = -1; }
            drawSlots(metrics);
          }));
          slotBody.appendChild(t);
        }
        slotDrill.render();
        requestAnimationFrame(() => Charts.resizeAll());
      }

      function drawOT() {
        const metrics = TI.orderTypeMetrics(otF.entity, effectivePeriod(otF));
        otBody.innerHTML = '';
        if (otVs.view === 'chart') {
          const b = el('<div class="chart" style="height:280px"></div>');
          otBody.appendChild(b);
          const sel = metrics.find(m => otDrill.isSelected(m.id));
          Charts.npsVolume(b, metrics, { selectedId: sel ? sel.id : null, onClick: m => { otDrill.toggle(m.id); drawOT(); } });
        } else {
          const t = el(`<table class="table sa-table"><thead><tr><th>Order Type</th><th class="ta-r">NPS</th><th class="ta-r">Responses</th><th class="ta-r">vs prev</th><th class="ta-r">Detractor %</th></tr></thead><tbody></tbody></table>`);
          const tb = $('tbody', t);
          metrics.forEach(m => {
            const cell = m.lowSample ? '<span class="sa-lowpill">Low sample</span>' : `<span style="color:${npsCol(m.nps)};font-weight:600">${m.nps}</span>`;
            const isSel = otDrill.isSelected(m.id);
            const tr = el(`<tr class="sa-rowlink" tabindex="0" ${isSel ? 'style="background:var(--hover)"' : ''}><td><b>${m.name}</b></td>
              <td class="ta-r">${cell}</td><td class="ta-r">${fmt(m.volume)}</td>
              <td class="ta-r">${m.lowSample ? dashTip() : arrow(m.trend)}</td><td class="ta-r">${m.lowSample ? dashTip() : m.detractorPct + '%'}</td></tr>`);
            const toggle = () => { otDrill.toggle(m.id); drawOT(); };
            tr.addEventListener('click', toggle);
            tr.addEventListener('keydown', e => { if (e.key === 'Enter') toggle(); });
            tb.appendChild(tr);
          });
          otBody.appendChild(t);
        }
        otDrill.render();
        requestAnimationFrame(() => Charts.resizeAll());
      }

      function drawWW() {
        if (!slots.length) { wwBody.innerHTML = ''; wwBody.appendChild(noSlots()); return; }
        const wk = TI.getWeekendDays();
        const metrics = TI.slotMetrics(slots, wwF.scope, wwF.entity, effectivePeriod(wwF));
        const npsA = a => a.n ? Math.round(a.p / a.n * 100) - Math.round(a.d / a.n * 100) : 0;
        const rows = metrics.map(m => {
          const wd = { n: 0, p: 0, d: 0 }, we = { n: 0, p: 0, d: 0 };
          m.perDay.forEach((a, day) => { const t2 = wk.indexOf(day) >= 0 ? we : wd; t2.n += a.n; t2.p += a.p; t2.d += a.d; });
          return { name: m.name, start: m.start, end: m.end, wd, we,
            lowWeekday: wd.n < TI.MIN_SAMPLE, lowWeekend: we.n < TI.MIN_SAMPLE,
            weekdayNps: wd.n ? npsA(wd) : null, weekendNps: we.n ? npsA(we) : null };
        });
        wwBody.innerHTML = '';
        if (vs.wwView === 'chart') {
          const b = el('<div class="chart" style="height:320px"></div>');
          wwBody.appendChild(b);
          Charts.wwBars(b, rows);
        } else {
          const t = el(`<table class="table sa-table"><thead>
            <tr><th rowspan="2">Time Slot</th><th colspan="2" class="sa-grp">Weekday</th><th colspan="2" class="sa-grp">Weekend</th><th rowspan="2" class="ta-r">Δ</th></tr>
            <tr><th class="ta-r sa-sub2">NPS</th><th class="ta-r sa-sub2">Responses</th><th class="ta-r sa-sub2">NPS</th><th class="ta-r sa-sub2">Responses</th></tr>
            </thead><tbody></tbody></table>`);
          const tb = $('tbody', t);
          const tot = { wd: { n: 0, p: 0, d: 0 }, we: { n: 0, p: 0, d: 0 } };
          rows.forEach(r => {
            ['n', 'p', 'd'].forEach(k => { tot.wd[k] += r.wd[k]; tot.we[k] += r.we[k]; });
            const dl = (r.lowWeekday || r.lowWeekend) ? null : r.weekendNps - r.weekdayNps;
            const c = (nps, low) => low ? '<span class="sa-lowpill">Low sample</span>' : `<span style="color:${npsCol(nps)};font-weight:600">${nps}</span>`;
            tb.appendChild(el(`<tr><td><b>${r.name}</b><div class="muted sa-sub">${fmtHour(r.start)}–${fmtHour(r.end)}</div></td>
              <td class="ta-r">${c(r.weekdayNps, r.lowWeekday)}</td><td class="ta-r">${fmt(r.wd.n)}</td>
              <td class="ta-r">${c(r.weekendNps, r.lowWeekend)}</td><td class="ta-r">${fmt(r.we.n)}</td>
              <td class="ta-r">${dl === null ? dashTip() : `<b style="color:${dl >= 0 ? '#22c55e' : '#ef4444'}">${dl > 0 ? '+' : ''}${dl}</b>`}</td></tr>`));
          });
          const dT = (tot.wd.n && tot.we.n) ? npsA(tot.we) - npsA(tot.wd) : 0;
          tb.appendChild(el(`<tr class="sa-totalrow"><td><b>All slots</b></td>
            <td class="ta-r"><b style="color:${npsCol(npsA(tot.wd))}">${npsA(tot.wd)}</b></td><td class="ta-r"><b>${fmt(tot.wd.n)}</b></td>
            <td class="ta-r"><b style="color:${npsCol(npsA(tot.we))}">${npsA(tot.we)}</b></td><td class="ta-r"><b>${fmt(tot.we.n)}</b></td>
            <td class="ta-r"><b style="color:${dT >= 0 ? '#22c55e' : '#ef4444'}">${dT > 0 ? '+' : ''}${dT}</b></td></tr>`));
          wwBody.appendChild(t);
        }
        requestAnimationFrame(() => Charts.resizeAll());
      }

      function noSlots() {
        const e = el(`<div class="empty"><div class="big">No time slots configured</div><div>Open ⚙ Slots to create time slots.</div>
          <div style="margin-top:14px"><button class="sa-outline sa-cfg">⚙ Configure slots</button></div></div>`);
        $('.sa-cfg', e).addEventListener('click', openSlotModal);
        return e;
      }

      // ---- settings modals (sa-styled) -------------------------------------
      function modal(title, width) {
        const ov = el('<div class="sa-overlay"></div>');
        const m = el(`<div class="sa-modal" ${width ? `style="width:${width}px"` : ''} role="dialog" aria-label="${title}"></div>`);
        m.appendChild(el(`<div class="card-head"><div class="sa-h4" style="margin:0">${title}</div><div class="right"><button class="sa-tool sa-x" aria-label="Close">✕</button></div></div>`));
        const close = () => { ov.remove(); m.remove(); document.removeEventListener('keydown', esc); };
        const esc = e => { if (e.key === 'Escape') close(); };
        ov.addEventListener('click', close); $('.sa-x', m).addEventListener('click', close);
        document.addEventListener('keydown', esc);
        document.body.appendChild(ov); document.body.appendChild(m);
        return { m, close };
      }
      // Whole-hour <select> (0-23) and market <select> ("All markets" + each
      // TI.MARKETS entry) — shared by the add-row and every existing slot's
      // edit row.
      function hourOptions(sel) {
        let html = '';
        for (let h = 0; h < 24; h++) html += `<option value="${h}" ${+sel === h ? 'selected' : ''}>${fmtHour(h)}</option>`;
        return html;
      }
      // Display name for a market: its real IANA zone. Every slot belongs to
      // exactly one market — there is no "all markets" catch-all.
      function marketDisplay(key) { const m = TI.MARKETS.find(mk => mk.key === key); return m ? m.iana : key; }
      function openSlotModal() {
        const { m } = modal('⚙ Slot Configuration', 820);
        m.appendChild(el('<div class="muted sa-sub" style="margin-bottom:12px">Define custom time slots (persisted). Editing re-maps all data and refreshes every view. Time Zone picks which market you\'re viewing and editing below — every slot belongs to exactly one market, so switching it never edits another market\'s slots.</div>'));
        // One Time Zone selector for the whole modal — it decides which
        // market's slot list is shown/edited below, it does NOT translate
        // times between zones. Each market's slots are fully independent;
        // there is no unrestricted/"all markets" bucket.
        let viewMarket = TI.MARKETS[0].key;
        const tzRow = el(`<div class="sa-tz-row"><div class="sa-tz-label">Time Zone</div></div>`);
        const tzSelectHolder = el('<div></div>');
        const tzNote = el('<div class="muted sa-sub" style="margin:0">Shows this market\'s slot list only.</div>');
        tzRow.appendChild(tzSelectHolder); tzRow.appendChild(tzNote);
        m.appendChild(tzRow);
        const status = el('<div class="sa-status-note" style="display:none"></div>');
        const countWarn = el('<div class="sa-field-note sa-field-note-info" style="display:none;margin-bottom:10px"></div>');
        m.appendChild(status); m.appendChild(countWarn);
        const tl = el('<div></div>'), list = el('<div class="sa-slotlist"></div>'), err = el('<div class="sa-err" style="display:none"></div>');
        m.appendChild(tl); m.appendChild(list); m.appendChild(err);
        const add = el(`<div class="sa-addrow"><input class="sa-search" id="sn" placeholder="Slot name" style="min-width:130px"/>
          <select class="sa-search" id="ss">${hourOptions(8)}</select><span class="muted">to</span><select class="sa-search" id="se">${hourOptions(12)}</select>
          <span class="muted sa-slot-tz"></span>
          <button class="sa-outline" id="sa-add">Add slot</button></div>`);
        m.appendChild(add);
        function paintTzSelect() {
          tzSelectHolder.innerHTML = '';
          const options = TI.MARKETS.map(mk => mk.iana);
          tzSelectHolder.appendChild(U.selectEl(marketDisplay(viewMarket), options, marketDisplay(viewMarket), v => {
            viewMarket = TI.MARKETS.find(mk => mk.iana === v).key;
            paintTzSelect(); redraw();
          }));
        }
        let statusTimer = null;
        function flashStatus(text) { status.textContent = text; status.style.display = ''; clearTimeout(statusTimer); statusTimer = setTimeout(() => { status.style.display = 'none'; }, 2500); }
        const SLOT_COUNT_WARNING = 10;
        function updateCountWarning() {
          if (slots.length > SLOT_COUNT_WARNING) { countWarn.textContent = `You have ${slots.length} slots across all markets — consider consolidating for readability.`; countWarn.style.display = ''; }
          else countWarn.style.display = 'none';
        }
        function redraw() {
          updateCountWarning();
          $('.sa-slot-tz', add).textContent = marketDisplay(viewMarket);
          // Every slot belongs to exactly one market, so this is a plain
          // exact match — switching Time Zone only changes which market's
          // own slots are shown; it never hides, edits, or deletes any slot.
          const visible = slots.filter(s => s.market === viewMarket);
          tl.innerHTML = ''; tl.appendChild(timeline(visible));
          list.innerHTML = '';
          visible.forEach(s => {
            const row = el(`<div class="sa-slotrow"><input class="sa-search f-n" value="${s.name}" style="min-width:110px"/>
              <select class="sa-search f-s">${hourOptions(s.start)}</select><span class="muted">–</span><select class="sa-search f-e">${hourOptions(s.end)}</select>
              <span class="muted sa-slot-tz">${marketDisplay(s.market)}</span>
              <span class="muted sa-dur"></span><span style="flex:1"></span>
              <button class="sa-linkbtn f-save">Save</button><button class="sa-linkbtn f-del" style="color:#ef4444">Delete</button>
              <div class="sa-err f-err" style="display:none;flex-basis:100%"></div></div>`);
            const upd = () => $('.sa-dur', row).textContent = dur($('.f-s', row).value, $('.f-e', row).value);
            upd(); ['.f-s', '.f-e'].forEach(q => $(q, row).addEventListener('change', upd));
            $('.f-save', row).addEventListener('click', () => {
              const nameVal = $('.f-n', row).value.trim();
              const nx = { id: s.id, name: nameVal || s.name, start: +$('.f-s', row).value, end: +$('.f-e', row).value, market: s.market };
              const e2 = validate(slots.filter(x => x.id !== s.id), nx);
              if (e2) { $('.f-err', row).className = 'sa-err f-err'; $('.f-err', row).textContent = e2; $('.f-err', row).style.display = ''; return; }
              slots = slots.map(x => x.id === s.id ? nx : x); TI.saveSlots(slots); redraw(); refreshAll();
              flashStatus(nameVal ? 'Changes saved.' : `Name left blank — kept "${s.name}".`);
            });
            // Delete needs a confirm step: first click arms it (button turns
            // red and says "Confirm delete?"), second click within 4s deletes.
            // Clicking anything else, or letting it time out, disarms it.
            let armed = false, armTimer = null;
            $('.f-del', row).addEventListener('click', () => {
              if (!armed) {
                armed = true; $('.f-del', row).textContent = 'Confirm delete?'; $('.f-del', row).style.fontWeight = '700';
                clearTimeout(armTimer);
                armTimer = setTimeout(() => { armed = false; $('.f-del', row).textContent = 'Delete'; $('.f-del', row).style.fontWeight = ''; }, 4000);
                return;
              }
              clearTimeout(armTimer);
              slots = slots.filter(x => x.id !== s.id); TI.saveSlots(slots); redraw(); refreshAll();
              flashStatus(`"${s.name}" deleted.`);
            });
            list.appendChild(row);
          });
        }
        $('#sa-add', add).addEventListener('click', () => {
          const nameVal = $('#sn', add).value.trim();
          const nx = { id: 's' + Date.now(), name: nameVal || 'New slot', start: +$('#ss', add).value, end: +$('#se', add).value, market: viewMarket };
          const e2 = validate(slots, nx);
          if (e2) { err.className = 'sa-err'; err.textContent = e2; err.style.display = ''; return; }
          err.style.display = 'none'; $('#sn', add).value = '';
          slots = slots.concat([nx]); TI.saveSlots(slots); redraw(); refreshAll();
          flashStatus(nameVal ? `"${nx.name}" added.` : 'Name left blank — added as "New slot".');
        });
        paintTzSelect();
        redraw();
      }
      function openWeekendModal() {
        const { m } = modal('⚙ Weekend Days', 440);
        m.appendChild(el('<div class="muted sa-sub" style="margin-bottom:14px">Select which days count as weekend.</div>'));
        const g = el('<div class="sa-chip-row"></div>');
        const warn = el('<div class="sa-field-note sa-field-note-warning" style="display:none;margin-top:12px"></div>');
        m.appendChild(g); m.appendChild(warn);
        (function paintChips() {
          g.innerHTML = '';
          const wkd = TI.getWeekendDays();
          if (!wkd.length) { warn.textContent = 'No days marked as weekend — the Weekend column will be empty.'; warn.style.display = ''; }
          else if (wkd.length === TI.DOW.length) { warn.textContent = 'All seven days marked as weekend — the Weekday column will be empty.'; warn.style.display = ''; }
          else warn.style.display = 'none';
          TI.DOW.forEach((dn, i) => {
            const on = wkd.indexOf(i) >= 0;
            const c = el(`<button class="sa-daychip ${on ? 'on' : ''}" aria-pressed="${on}">${dn}</button>`);
            c.addEventListener('click', () => { const cur = TI.getWeekendDays().slice(); const ix = cur.indexOf(i); if (ix >= 0) cur.splice(ix, 1); else cur.push(i); TI.saveWeekendDays(cur); paintChips(); drawWW(); });
            g.appendChild(c);
          });
        })();
      }
      function refreshAll() { gearBtn.innerHTML = `⚙ Slots <span class="muted">(${slots.length})</span>`; drawMain(); drawWW(); }

      function timeline(sl) {
        const w = el('<div class="sa-timeline"></div>');
        const cols = ['#7C3AED', '#f59e0b', '#22c55e', '#06b6d4', '#a855f7', '#ef4444', '#5B21B6'];
        sl.forEach((s, i) => cover(s).forEach(h => { const g = el('<div class="sa-tl-seg"></div>'); g.style.left = (h / 24 * 100) + '%'; g.style.width = (1 / 24 * 100) + '%'; g.style.background = cols[i % cols.length]; g.title = s.name + (s.market ? ' — ' + s.market : ''); w.appendChild(g); }));
        [0, 6, 12, 18, 24].forEach(h => w.appendChild(el(`<div class="sa-tl-tick" style="left:${h / 24 * 100}%">${h}:00</div>`)));
        return w;
      }
      // Slot boundaries are whole hours (0-23) — see TI_DEFAULT_SLOTS in
      // survey-mock.js for why. `s.start`/`s.end` can legitimately be 0
      // (midnight), so checks below use `== null` rather than a truthy test.
      function cover(s) { const a = +s.start, b = +s.end, o = []; if (b > a) { for (let i = a; i < b; i++) o.push(i); } else { for (let i = a; i < 24; i++) o.push(i); for (let i = 0; i < b; i++) o.push(i); } return o; }
      function dur(a, b) { let d = (+b) - (+a); if (d <= 0) d += 24; return d + 'h'; }
      function validate(others, s) {
        if (s.start == null || s.end == null || s.start === '' || s.end === '') return 'Start and end are required.';
        if (+s.start === +s.end) return 'End must differ from start.';
        const mine = new Set(cover(s));
        // Two market-restricted slots for DIFFERENT markets never compete for
        // the same brand's data, so they're allowed to share hours (e.g. an
        // IST "Lunch" and a UK "Lunch" at the same wall-clock window). A slot
        // with no market restriction applies to everyone, so it still
        // conflicts with any market-specific slot at overlapping hours.
        for (const o of others) {
          const marketsCanClash = !s.market || !o.market || s.market === o.market;
          if (marketsCanClash && cover(o).some(h => mine.has(h))) return `Overlaps with “${o.name}” (${fmtHour(o.start)}–${fmtHour(o.end)}).`;
        }
        return null;
      }

      // ---- inline drilldown (same interaction as Progressive Drilldown) -----
      // Full hierarchy: Brand -> Country -> Zone -> State -> City -> Store,
      // anchored to whichever bucket (time slot, order type, ...) is
      // selected. Each level renders as its own stacked block (never a side
      // drawer); clicking a row in level d truncates the path to d and
      // appends the picked child, like Progressive Drilldown's levelBlock
      // loop. Generic over how a session opens/continues so every "pick a
      // bucket, then drill Brand->Store underneath it" card — NPS by Time
      // Slot today, NPS by Order Type, any future one — shares this exact
      // rendering instead of re-implementing it.
      //   openFn(id)        -> dd session shape, same as TI.drilldown/orderTypeDrilldown
      //   continueFn(dd, path) -> {node, children}, same as TI.drillAt/orderTypeDrillAt
      function makeDrillSection(container, cardEl, openFn, continueFn) {
        let selectedId = null, drillPath = [];
        function reset() { selectedId = null; drillPath = []; }
        function isSelected(id) { return selectedId === id; }
        function toggle(id) { selectedId = selectedId === id ? null : id; drillPath = []; render(); }
        function levelCrumb(dd, path) {
          // Use the drill session's EFFECTIVE scope/entity, not the top-level
          // filter directly — a market-restricted slot narrows to just that
          // market's brands (see tiDrilldown), and the breadcrumb has to
          // reflect that narrowing, not the unrestricted top-level selection.
          const scope = dd.effScope, entity = dd.effEntity;
          if (scope === 'Country' && entity && entity.length > 1) {
            // Multi-country: root is the mix; path[0] is a country until a brand
            // is also picked, at which point path becomes [brand, country, ...]
            // (matching the single-country shape below) for the rest of the walk.
            const items = [{ label: countryEntityLabel(entity), path: [] }];
            if (path.length === 1) { items.push({ label: path[0], path: path.slice(0, 1) }); return items; }
            if (path.length >= 2) {
              items.push({ label: path[1], path: path.slice(0, 2) });
              items.push({ label: path[0], path: path.slice(0, 2) });
              for (let i = 2; i < path.length; i++) items.push({ label: path[i], path: path.slice(0, i + 1) });
            }
            return items;
          }
          if (scope === 'Country' && entity) {
            const items = [{ label: entity[0], path: [] }];
            if (path.length >= 2) items.push({ label: path[0], path: path.slice(0, 2) });
            for (let i = 2; i < path.length; i++) items.push({ label: path[i], path: path.slice(0, i + 1) });
            return items;
          }
          if (scope === 'Brand' && entity && entity.length > 1) {
            const items = [{ label: brandEntityLabel(entity), path: [] }];
            for (let i = 0; i < path.length; i++) items.push({ label: path[i], path: path.slice(0, i + 1) });
            return items;
          }
          if (scope === 'Brand' && entity) {
            const items = [{ label: entity[0], path: [] }];
            for (let i = 1; i < path.length; i++) items.push({ label: path[i], path: path.slice(0, i + 1) });
            return items;
          }
          const items = [{ label: 'All Brands', path: [] }];
          for (let i = 0; i < path.length; i++) items.push({ label: path[i], path: path.slice(0, i + 1) });
          return items;
        }
        function levelBlock(dd, path, depth) {
          const at = depth === 0 ? { node: dd.node, children: dd.children } : continueFn(dd, path);
          const wrap = el('<div class="sa-level"></div>');
          const crumbItems = levelCrumb(dd, path).concat({ label: at.children.level, path: null });
          const activeCount = path.length > 0 ? 2 : 1;
          const crumb = el('<div class="sa-dl-crumb"></div>');
          crumbItems.forEach((it, i) => {
            if (i > 0) crumb.appendChild(el('<span class="sa-dl-chip-sep">›</span>'));
            const chip = el(`<span class="sa-dl-chip${i >= crumbItems.length - activeCount ? ' sa-dl-chip-active' : ''}">${it.label}</span>`);
            crumb.appendChild(chip);
          });
          wrap.appendChild(crumb);
          if (at.node.lowSample) {
            wrap.appendChild(el(`<div class="empty"><div class="big">Low sample (${fmt(at.node.n)})</div><div>Below the ${TI.MIN_SAMPLE}-response threshold.</div></div>`));
            return wrap;
          }
          const barRows = at.children.rows.map(r => Object.assign({}, r, { value: r.nps, responses: r.n }));
          if (!barRows.length) {
            wrap.appendChild(el('<div class="empty"><div class="big">No data to show at this level.</div></div>'));
            return wrap;
          }
          wrap.appendChild(bandLegend());
          const selectedHere = drillPath[depth] || null;
          const canDrillHere = barRows.length && !barRows[0].leaf;
          const box = el(`<div class="chart" style="height:${Math.max(160, barRows.length * 38 + 60)}px"></div>`);
          wrap.appendChild(box);
          Charts.divergingBars(box, barRows, {
            colorFor: API.colorFor, metricLabel: 'NPS',
            faded: selectedHere ? [selectedHere] : [],
            onClick: canDrillHere ? r => {
              const isCurrent = selectedHere && r.path[r.path.length - 1] === selectedHere;
              drillPath = isCurrent ? drillPath.slice(0, depth) : r.path.slice();
              render();
            } : undefined
          });
          requestAnimationFrame(() => Charts.resizeAll());
          return wrap;
        }
        function render() {
          container.innerHTML = '';
          if (!selectedId) { cardEl.style.display = 'none'; return; }
          const dd = openFn(selectedId);
          if (!dd) { cardEl.style.display = 'none'; return; }
          cardEl.style.display = '';
          for (let d = 0; d <= drillPath.length; d++) {
            container.appendChild(levelBlock(dd, drillPath.slice(0, d), d));
          }
        }
        return { toggle, reset, render, isSelected };
      }

      drawMain(); drawWW(); drawOT();
    }

    paint();
  }

  global.SurveyAnalyticsModule = { render: render };
})(window);
