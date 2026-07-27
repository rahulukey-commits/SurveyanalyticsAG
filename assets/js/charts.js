/* ============================================================================
 * Karnival NPS Analytics — ECharts builders
 * Each builder takes a DOM node + the §4 DTO and returns the ECharts instance.
 * Fixed colour semantics (reference §5.3): promoter green, passive orange,
 * detractor red. NPS score gauge mirrors `kp-nps-gauge`.
 * ========================================================================== */
(function (global) {
  'use strict';
  const C = {
    promoter: '#16a34a', passive: '#fb923c', detractor: '#ef4444',
    blue: '#6366f1', ink: '#1f2430', ink2: '#5b6270', ink3: '#8b91a0',
    line: '#eef0f4', grid: '#f1f2f6'
  };
  const FONT = '-apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const registry = []; // for resize

  function make(el) {
    let inst = echarts.getInstanceByDom(el);
    if (inst) inst.dispose();
    inst = echarts.init(el, null, { renderer: 'canvas' });
    if (registry.indexOf(inst) === -1) registry.push(inst);
    return inst;
  }
  const baseTooltip = { backgroundColor: '#fff', borderColor: C.line, borderWidth: 1, textStyle: { color: C.ink }, extraCssText: 'box-shadow:0 8px 24px rgba(20,24,40,.14);border-radius:10px;padding:10px 12px;' };
  const axisLabel = { color: C.ink3, fontFamily: FONT, fontSize: 12 };
  const splitLine = { lineStyle: { color: C.grid } };

  function ratingColor(r) { r = +r; return r >= 9 ? C.promoter : r >= 7 ? C.passive : C.detractor; }

  // X-axis label from a {day_of_month, month, year} bucket
  function dayLabel(d) {
    const mon = (d.month || '').slice(0, 3);
    const m = mon.charAt(0) + mon.slice(1).toLowerCase();
    return String(d.day_of_month).padStart(2, '0') + ' ' + m;
  }

  const Charts = {
    instances: registry,
    resizeAll: function () { registry.forEach(i => { try { i.resize(); } catch (e) {} }); },

    /* ---- NPS gauge (semicircle -100..100) -------------------------------- */
    gauge: function (el, score) {
      const inst = make(el);
      inst.setOption({
        series: [{
          type: 'gauge', min: -100, max: 100, startAngle: 200, endAngle: -20,
          center: ['50%', '74%'], radius: '108%',
          splitNumber: 4,
          axisLine: { lineStyle: { width: 22, color: [
            [0.32, C.detractor], [0.55, C.passive], [1, C.promoter]
          ] } },
          pointer: { width: 5, length: '62%', itemStyle: { color: '#2b2f3a' } },
          anchor: { show: true, size: 14, itemStyle: { color: '#2b2f3a' } },
          axisTick: { distance: -22, length: 5, lineStyle: { color: '#fff', width: 1 } },
          splitLine: { distance: -22, length: 22, lineStyle: { color: '#fff', width: 2 } },
          axisLabel: { distance: -2, color: C.ink3, fontSize: 11, formatter: v => v },
          detail: { show: false },
          data: [{ value: score }]
        }]
      });
      return inst;
    },

    /* ---- P/P/D stacked horizontal split bar ------------------------------ */
    splitBar: function (el, d) {
      const inst = make(el);
      const total = d.total_responses || (d.promoter_contribution + d.passive_contribution + d.detractor_contribution);
      const mk = (name, val, color) => ({ name, type: 'bar', stack: 's', barWidth: 46,
        emphasis: { focus: 'series' }, itemStyle: { color },
        label: { show: val > 0, color: '#fff', fontWeight: 700, formatter: () => val },
        data: [val] });
      inst.setOption({
        grid: { left: 0, right: 0, top: 6, bottom: 0 },
        tooltip: Object.assign({ trigger: 'item', formatter: p => `${p.seriesName}: ${p.value} (${((p.value/total)*100).toFixed(2)}%)` }, baseTooltip),
        xAxis: { type: 'value', max: total, show: false },
        yAxis: { type: 'category', data: [''], show: false },
        series: [
          mk('Promoter', d.promoter_contribution, C.promoter),
          mk('Passive', d.passive_contribution, C.passive),
          mk('Detractor', d.detractor_contribution, C.detractor)
        ]
      });
      return inst;
    },

    /* ---- NPS contribution trend (line + stacked bars) -------------------- */
    npsTrend: function (el, d, pct) {
      const inst = make(el);
      const stat = d.nps_trend.day_of_month_stat || [];
      const cats = stat.map(dayLabel);
      const val = (s, key) => pct ? (s.total_response ? +(s[key] / s.total_response * 100).toFixed(1) : 0) : s[key];
      const bar = (name, key, color) => ({ name, type: 'bar', stack: 'ppd', barWidth: '42%',
        itemStyle: { color }, yAxisIndex: 1, data: stat.map(s => val(s, key)) });
      inst.setOption({
        color: [C.blue, C.promoter, C.passive, C.detractor],
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, baseTooltip),
        legend: { data: ['NPS Score', 'Promoter', 'Passive', 'Detractor'], top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2 } },
        grid: { left: 44, right: 44, top: 44, bottom: 70 },
        xAxis: { type: 'category', data: cats, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: [
          { type: 'value', min: -100, max: 100, axisLabel, splitLine, name: '' },
          { type: 'value', min: 0, max: pct ? 100 : null, axisLabel: Object.assign({ formatter: pct ? '{value}%' : '{value}' }, axisLabel), splitLine: { show: false } }
        ],
        dataZoom: [{ type: 'slider', bottom: 16, height: 18, borderColor: C.line, fillerColor: 'rgba(99,102,241,.12)' }],
        series: [
          { name: 'NPS Score', type: 'line', smooth: false, symbol: 'emptyCircle', symbolSize: 7,
            lineStyle: { color: C.blue, width: 2 }, itemStyle: { color: C.blue }, data: stat.map(s => s.nps_score) },
          bar('Promoter', 'promoter', C.promoter),
          bar('Passive', 'passive', C.passive),
          bar('Detractor', 'detractor', C.detractor)
        ]
      });
      return inst;
    },

    /* ---- Rating distribution (0-10 coloured bars) ------------------------ */
    ratingDist: function (el, d) {
      const inst = make(el);
      const keys = []; for (let i = 0; i <= 10; i++) keys.push(String(i));
      const data = keys.map(k => ({ value: d.category_responses[k] || 0, itemStyle: { color: ratingColor(k), borderRadius: [4,4,0,0] } }));
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, baseTooltip),
        grid: { left: 36, right: 16, top: 18, bottom: 30 },
        xAxis: { type: 'category', data: keys.map(k => k.padStart(2,'0')), axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', minInterval: 1, axisLabel, splitLine },
        series: [{ type: 'bar', barWidth: '58%', data, backgroundStyle: { color: '#f3f4f7' }, showBackground: true }]
      });
      return inst;
    },

    /* ---- Filling / completion rate (grouped bars per type) --------------- */
    filling: function (el, d) {
      const inst = make(el);
      const headings = ['Rating', 'Category', 'Subcategory', 'Detractor Journey', 'Comment'];
      const series = [
        ['Promoter', d.promoters_filling, C.promoter],
        ['Passive', d.passive_filling, C.passive],
        ['Detractor', d.detractor_filling, C.detractor]
      ].map(([name, arr, color]) => ({
        name, type: 'bar', itemStyle: { color, borderRadius: [3,3,0,0] }, barMaxWidth: 26,
        data: headings.map(h => { const f = (arr||[]).find(x => x.level_heading === h); return f ? f.count : 0; })
      }));
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, baseTooltip),
        legend: { top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2 } },
        grid: { left: 36, right: 16, top: 40, bottom: 28 },
        xAxis: { type: 'category', data: headings, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', minInterval: 1, axisLabel, splitLine },
        series
      });
      return inst;
    },

    /* ---- Generic horizontal "level" bars (gray w/ inline labels) --------- */
    levelBars: function (el, mapObj, opts) {
      opts = opts || {};
      const inst = make(el);
      const entries = Object.entries(mapObj).sort((a,b) => b[1]-a[1]);
      const total = opts.total || entries.reduce((s,[,v]) => s+v, 0) || 1;
      const cats = entries.map(e => e[0]);
      const vals = entries.map(e => e[1]);
      const color = opts.color || '#cfd3dc';
      inst.setOption({
        tooltip: Object.assign({ trigger: 'item', formatter: p => `${p.name}: ${p.value} (${((p.value/total)*100).toFixed(2)}%)` }, baseTooltip),
        grid: { left: 6, right: 30, top: 8, bottom: 24 },
        xAxis: { type: 'value', axisLabel, splitLine, max: opts.max },
        yAxis: { type: 'category', inverse: true, data: cats, show: false },
        series: [{
          type: 'bar', barWidth: 30, itemStyle: { color, borderRadius: 3 },
          label: { show: true, position: 'insideLeft', color: C.ink, fontWeight: 600, offset: [6,0],
            formatter: p => opts.percent ? `${p.name}: ${((p.value/total)*100).toFixed(2)}%` : `${p.name}: ${p.value} (${((p.value/total)*100).toFixed(2)}%)` },
          data: vals
        }]
      });
      return inst;
    },

    /* ---- Vertical "level" bars (blue, for improvements) ------------------ */
    verticalBars: function (el, mapObj, color, pct) {
      const inst = make(el);
      const entries = Object.entries(mapObj).sort((a, b) => b[1] - a[1]);
      const sum = entries.reduce((a, e) => a + e[1], 0) || 1;
      const data = entries.map(e => pct ? +(e[1] / sum * 100).toFixed(1) : e[1]);
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => pct ? v + '%' : v }, baseTooltip),
        grid: { left: 36, right: 16, top: 18, bottom: 60 },
        xAxis: { type: 'category', data: entries.map(e => e[0]), axisLabel: Object.assign({}, axisLabel, { interval: 0, rotate: 24 }), axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', minInterval: pct ? null : 1, max: pct ? 100 : null, axisLabel: Object.assign({ formatter: pct ? '{value}%' : '{value}' }, axisLabel), splitLine },
        series: [{ type: 'bar', barWidth: '46%', itemStyle: { color: color || C.blue, borderRadius: [4, 4, 0, 0] }, data, showBackground: true, backgroundStyle: { color: '#f3f4f7' } }]
      });
      return inst;
    },

    /* ---- Pie (categories / channels) ------------------------------------- */
    pie: function (el, mapObj, palette) {
      const inst = make(el);
      const data = Object.entries(mapObj).sort((a,b) => b[1]-a[1]).map(([name, value]) => ({ name, value }));
      inst.setOption({
        color: palette || [C.blue, C.promoter, C.passive, C.detractor, '#a855f7', '#06b6d4'],
        tooltip: Object.assign({ trigger: 'item', formatter: p => `${p.name}: ${p.value} (${p.percent}%)` }, baseTooltip),
        legend: { bottom: 0, icon: 'circle', textStyle: { color: C.ink2 } },
        series: [{ type: 'pie', radius: ['42%', '70%'], center: ['50%', '46%'], avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { formatter: '{b}\n{c} ({d}%)', color: C.ink2 }, data }]
      });
      return inst;
    },

    /* ---- Channel funnel grouped bars (sent→delivered→viewed→responded) --- */
    channelFunnel: function (el, details) {
      const inst = make(el);
      const stages = ['sent', 'delivered', 'viewed', 'responded'];
      const labels = ['Sent', 'Delivered', 'Viewed', 'Responded'];
      const chans = [['Email', details.email_stats, C.passive], ['SMS', details.sms_stats, C.blue], ['WhatsApp', details.whatsapp_stats, C.promoter]];
      const series = chans.map(([name, st, color]) => ({ name, type: 'bar', itemStyle: { color, borderRadius: [3,3,0,0] }, barMaxWidth: 26, data: stages.map(s => (st||{})[s] || 0) }));
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, baseTooltip),
        legend: { top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2 } },
        grid: { left: 36, right: 16, top: 40, bottom: 28 },
        xAxis: { type: 'category', data: labels, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', minInterval: 1, axisLabel, splitLine },
        series
      });
      return inst;
    },

    /* ---- Multi-series trend lines (L1 trend, with datazoom) -------------- */
    trendLines: function (el, d, asBar, pct) {
      const inst = make(el);
      const cats = (d.days || []).map(dayLabel);
      const palette = [C.promoter, C.blue, C.passive, C.detractor, '#a855f7', '#06b6d4'];
      const names = Object.keys(d.nps_level_stat);
      let cols = names.map(name => {
        const stat = d.nps_level_stat[name];
        const byDay = {}; (stat.day_of_month_stats || []).forEach(s => { byDay[dayLabel(s)] = s.count; });
        return cats.map(c => byDay[c] || 0);
      });
      if (pct) { // column-normalised share of total at each x
        cols = cols.map(arr => arr.slice());
        cats.forEach((_, x) => { const sum = cols.reduce((a, arr) => a + arr[x], 0) || 1; cols.forEach(arr => arr[x] = +(arr[x] / sum * 100).toFixed(1)); });
      }
      const series = names.map((name, i) => ({
        name, type: asBar ? 'bar' : 'line', stack: pct && asBar ? 'pct' : null, smooth: false, symbol: 'circle', symbolSize: 6,
        itemStyle: { color: palette[i % palette.length] }, lineStyle: { width: 2 }, barMaxWidth: 18, data: cols[i]
      }));
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: asBar ? 'shadow' : 'line' }, valueFormatter: v => pct ? v + '%' : v }, baseTooltip),
        legend: { top: 0, icon: 'circle', textStyle: { color: C.ink2 } },
        grid: { left: 40, right: 24, top: 40, bottom: 64 },
        xAxis: { type: 'category', data: cats, boundaryGap: !!asBar, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', minInterval: pct ? null : 1, max: pct ? 100 : null, axisLabel: Object.assign({ formatter: pct ? '{value}%' : '{value}' }, axisLabel), splitLine },
        dataZoom: [{ type: 'slider', bottom: 14, height: 18, borderColor: C.line, fillerColor: 'rgba(99,102,241,.12)' }],
        series
      });
      return inst;
    },

    /* ---- Status funnel over time (monthly counts) ----------------------- */
    statusTrend: function (el, d, asLine) {
      const inst = make(el);
      const months = (d.months || []).map(m => m.month.slice(0,3) + ' ' + m.year);
      const stages = [
        ['Sent', 'sent_trend', '#94a3b8'], ['Delivered', 'delivered_trend', C.blue],
        ['Viewed', 'clicked_trend', '#06b6d4'], ['Responded', 'responded_trend', C.passive],
        ['Completed', 'completed_trend', C.promoter]
      ];
      const series = stages.map(([name, key, color]) => ({
        name, type: asLine ? 'line' : 'bar', symbol: 'circle', symbolSize: 7, lineStyle: { width: 2 },
        itemStyle: { color, borderRadius: [3,3,0,0] }, barMaxWidth: 30,
        data: months.map((_, i) => { const t = d[key]; return (t && t.monthly_stats[i]) ? t.monthly_stats[i].count : 0; })
      }));
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, baseTooltip),
        legend: { top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2 } },
        grid: { left: 40, right: 20, top: 40, bottom: 28 },
        xAxis: { type: 'category', data: months, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', minInterval: 1, axisLabel, splitLine },
        series
      });
      return inst;
    },

    /* ---- Channel Overview: status counts over time (bar/line) ----------- */
    statusOverTime: function (el, series, dates, asLine) {
      const inst = make(el);
      const defs = [
        ['Completed', '#16a34a'], ['Responded', '#fb923c'], ['Clicked', '#06b6d4'],
        ['Sent', '#ef4444'], ['Delivered', '#6366f1']
      ];
      const s = defs.map(([name, color]) => ({
        name, type: asLine ? 'line' : 'bar', stack: asLine ? null : null,
        itemStyle: { color, borderRadius: asLine ? 0 : [2,2,0,0] }, areaStyle: asLine ? { opacity: .08 } : undefined,
        symbol: 'none', smooth: true, barMaxWidth: 8, data: series[name] || []
      }));
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: asLine ? 'line' : 'shadow' } }, baseTooltip),
        legend: { top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2 } },
        grid: { left: 40, right: 24, top: 40, bottom: 64 },
        xAxis: { type: 'category', data: dates, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', minInterval: 1, axisLabel, splitLine },
        dataZoom: [{ type: 'slider', bottom: 14, height: 18, borderColor: C.line, fillerColor: 'rgba(99,102,241,.12)', start: 60 }],
        series: s
      });
      return inst;
    },

    /* ---- Sentiment distribution pie (5-level) --------------------------- */
    sentimentPie: function (el, dist) {
      const inst = make(el);
      const order = [['Very Negative', '#9b1c1c'], ['Negative', C.detractor], ['Neutral', C.passive], ['Positive', C.promoter], ['Very Positive', '#0f7a34']];
      const data = order.map(([name, color]) => ({ name, value: dist[name] || 0, itemStyle: { color } }));
      inst.setOption({
        tooltip: Object.assign({ trigger: 'item', formatter: p => `${p.name}: ${p.value} (${p.percent}%)` }, baseTooltip),
        legend: { bottom: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2 } },
        series: [{ type: 'pie', radius: ['0%', '74%'], center: ['50%', '44%'],
          label: { formatter: '{d}%', color: '#fff', position: 'inside', fontWeight: 700 },
          itemStyle: { borderColor: '#fff', borderWidth: 2 }, data }]
      });
      return inst;
    },

    /* ---- Sentiment trend line ------------------------------------------- */
    sentimentTrend: function (el, trend) {
      const inst = make(el);
      const pts = (trend && trend.byWeek) || [];
      const cats = pts.map(p => p.w);
      inst.setOption({
        color: [C.blue, C.promoter, C.passive, C.detractor],
        tooltip: Object.assign({ trigger: 'axis' }, baseTooltip),
        legend: { data: ['Score', 'Positive', 'Neutral', 'Negative'], top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2 } },
        grid: { left: 44, right: 44, top: 40, bottom: 50 },
        xAxis: { type: 'category', data: cats, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: [
          { type: 'value', min: -100, max: 100, axisLabel, splitLine },
          { type: 'value', min: 0, axisLabel, splitLine: { show: false } }
        ],
        dataZoom: [{ type: 'slider', bottom: 10, height: 16, borderColor: C.line, fillerColor: 'rgba(99,102,241,.12)' }],
        series: [
          { name: 'Score', type: 'line', symbol: 'emptyCircle', symbolSize: 7, lineStyle: { color: C.blue, width: 2 }, data: pts.map(p => p.score) },
          { name: 'Positive', type: 'bar', stack: 'b', yAxisIndex: 1, itemStyle: { color: C.promoter }, barMaxWidth: 18, data: pts.map(p => p.pos) },
          { name: 'Neutral',  type: 'bar', stack: 'b', yAxisIndex: 1, itemStyle: { color: C.passive }, data: pts.map(p => p.neu) },
          { name: 'Negative', type: 'bar', stack: 'b', yAxisIndex: 1, itemStyle: { color: C.detractor }, data: pts.map(p => p.neg) }
        ]
      });
      return inst;
    },

    /* ---- Single donut ring (filling-rate cell) -------------------------- */
    donut: function (el, fillPct, color, centerText) {
      const inst = make(el);
      inst.setOption({
        series: [{
          type: 'pie', radius: ['68%', '90%'], center: ['50%', '50%'], silent: true,
          label: { show: true, position: 'center', formatter: centerText, color: C.ink, fontSize: 13, fontWeight: 700, lineHeight: 16 },
          labelLine: { show: false },
          data: [
            { value: fillPct, itemStyle: { color } },
            { value: Math.max(0, 100 - fillPct), itemStyle: { color: '#eef0f4' } }
          ]
        }]
      });
      return inst;
    },

    /* ---- Weekwise multi-series (line/bar) ------------------------------- */
    weekwise: function (el, weeks, series, asBar, pct) {
      const inst = make(el);
      const palette = [C.promoter, C.blue, C.passive, C.detractor, '#a855f7', '#06b6d4'];
      const names = Object.keys(series);
      let cols = names.map(n => series[n].slice());
      if (pct) weeks.forEach((_, x) => { const sum = cols.reduce((a, arr) => a + arr[x], 0) || 1; cols.forEach(arr => arr[x] = +(arr[x] / sum * 100).toFixed(1)); });
      const s = names.map((name, i) => ({
        name, type: asBar ? 'bar' : 'line', stack: pct && asBar ? 'pct' : null, smooth: true, symbol: 'circle', symbolSize: 5,
        itemStyle: { color: palette[i % palette.length] }, lineStyle: { width: 2 }, barMaxWidth: 14, data: cols[i]
      }));
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: asBar ? 'shadow' : 'line' }, valueFormatter: v => pct ? v + '%' : v }, baseTooltip),
        legend: { top: 0, icon: 'circle', textStyle: { color: C.ink2 } },
        grid: { left: 40, right: 24, top: 40, bottom: 50 },
        xAxis: { type: 'category', data: weeks, boundaryGap: !!asBar, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', minInterval: pct ? null : 1, max: pct ? 100 : null, axisLabel: Object.assign({ formatter: pct ? '{value}%' : '{value}' }, axisLabel), splitLine },
        dataZoom: [{ type: 'slider', bottom: 12, height: 16, borderColor: C.line, fillerColor: 'rgba(99,102,241,.12)' }],
        series: s
      });
      return inst;
    },

    /* ---- Word cloud ------------------------------------------------------ */
    wordCloud: function (el, mapObj) {
      const inst = make(el);
      const palette = [C.brand || '#8e1b5b', C.blue, C.promoter, C.passive, '#a855f7', '#06b6d4', C.detractor];
      const data = Object.entries(mapObj).map(([name, value], i) => ({ name, value, textStyle: { color: palette[i % palette.length] } }));
      inst.setOption({
        tooltip: Object.assign({ show: true, formatter: p => `${p.name}: ${p.value}` }, baseTooltip),
        series: [{
          type: 'wordCloud', shape: 'circle', left: 'center', top: 'center', width: '96%', height: '96%',
          sizeRange: [16, 64], rotationRange: [0, 0], gridSize: 10, drawOutOfBound: false,
          textStyle: { fontFamily: FONT, fontWeight: 700 },
          emphasis: { textStyle: { textShadowBlur: 6, textShadowColor: 'rgba(0,0,0,.2)' } },
          data
        }]
      });
      return inst;
    },

    /* ---- Time Intelligence: NPS vs Volume (dual axis) ------------------- */
    npsVolume: function (el, metrics) {
      const inst = make(el);
      const cats = metrics.map(m => m.name);
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, baseTooltip),
        legend: { data: ['Volume', 'NPS'], top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2 } },
        grid: { left: 50, right: 50, top: 40, bottom: 50 },
        xAxis: { type: 'category', data: cats, axisLabel: Object.assign({}, axisLabel, { interval: 0, rotate: cats.length > 5 ? 20 : 0 }), axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: [
          { type: 'value', name: 'Volume', minInterval: 1, axisLabel, splitLine },
          { type: 'value', name: 'NPS', min: -100, max: 100, axisLabel, splitLine: { show: false } }
        ],
        series: [
          { name: 'Volume', type: 'bar', barMaxWidth: 38, itemStyle: { color: '#c7b8ec', borderRadius: [4, 4, 0, 0] }, data: metrics.map(m => m.volume) },
          { name: 'NPS', type: 'line', yAxisIndex: 1, smooth: true, symbol: 'circle', symbolSize: 8, lineStyle: { width: 3, color: '#7C3AED' }, itemStyle: { color: '#7C3AED' }, data: metrics.map(m => m.lowSample ? null : m.nps) }
        ]
      });
      return inst;
    },

    /* ---- Time Intelligence: NPS heatmap (slots × days) ------------------ */
    heatmap: function (el, rows, onCellClick) {
      const inst = make(el);
      const days = (global.MockApi && MockApi.TimeIntel.DOW) || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const data = [];
      rows.forEach((row, si) => row.cells.forEach((c, di) => data.push([di, si, c.nps == null ? '-' : c.nps])));
      inst.setOption({
        tooltip: Object.assign({ position: 'top', formatter: p => {
          const c = rows[p.data[1]].cells[p.data[0]];
          if (c.nps == null) return `<b>${rows[p.data[1]].name} · ${days[p.data[0]]}</b><br/>Low sample (${c.n})`;
          return `<b>${rows[p.data[1]].name} · ${days[p.data[0]]}</b><br/>NPS: <b>${c.nps}</b><br/>Responses: ${c.n}<br/>P/Pa/D: ${c.agg.p} / ${c.agg.pa} / ${c.agg.d}`;
        } }, baseTooltip),
        grid: { left: 130, right: 16, top: 10, bottom: 64 },
        xAxis: { type: 'category', data: days, splitArea: { show: true }, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'category', data: rows.map(r => r.name), splitArea: { show: true }, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        visualMap: { type: 'continuous', min: -100, max: 100, calculable: true, orient: 'horizontal', left: 'center', bottom: 6,
          inRange: { color: ['#ef4444', '#fb923c', '#fde047', '#86efac', '#16a34a'] }, textStyle: { color: C.ink2 } },
        series: [{ type: 'heatmap', data, label: { show: true, formatter: p => p.data[2] === '-' ? '–' : p.data[2], color: '#1f2430', fontWeight: 600 },
          itemStyle: { borderColor: '#fff', borderWidth: 2 }, emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,.25)' } } }]
      });
      if (onCellClick) inst.on('click', p => { if (p.data) onCellClick(rows[p.data[1]], days[p.data[0]]); });
      return inst;
    },

    /* ---- Time Intelligence: weekday vs weekend comparison bars ---------- */
    barCompare: function (el, pairs) {
      const inst = make(el);
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => 'NPS ' + v }, baseTooltip),
        grid: { left: 40, right: 16, top: 16, bottom: 30 },
        xAxis: { type: 'category', data: pairs.map(p => p[0]), axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', min: -100, max: 100, axisLabel, splitLine },
        series: [{ type: 'bar', barWidth: 60, data: pairs.map(p => ({ value: p[1], itemStyle: { color: p[2], borderRadius: [4, 4, 0, 0] } })), label: { show: true, position: 'top', color: C.ink, fontWeight: 700 } }]
      });
      return inst;
    },

    /* ---- Time Intelligence: weekday/weekend trend lines ----------------- */
    wwTrend: function (el, weeks) {
      const inst = make(el);
      inst.setOption({
        color: ['#7C3AED', '#fb923c'],
        tooltip: Object.assign({ trigger: 'axis' }, baseTooltip),
        legend: { data: ['Weekday', 'Weekend'], top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2 } },
        grid: { left: 40, right: 16, top: 40, bottom: 30 },
        xAxis: { type: 'category', data: weeks.map(w => w.w), boundaryGap: false, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', axisLabel, splitLine },
        series: [
          { name: 'Weekday', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2 }, data: weeks.map(w => w.weekday) },
          { name: 'Weekend', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2 }, data: weeks.map(w => w.weekend) }
        ]
      });
      return inst;
    }
  };

  global.Charts = Charts;
})(window);
