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
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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

    /* ---- Survey: aggregate NPS gauge (-100..100, 5-band) ---------------- */
    surveyGauge: function (el, value, min, max) {
      const inst = make(el);
      const bandColors = [[0.3, '#ef4444'], [0.5, '#f59e0b'], [0.7, '#84cc16'], [1, '#22c55e']];
      inst.setOption({
        series: [{ type: 'gauge', min, max, startAngle: 200, endAngle: -20, center: ['50%', '72%'], radius: '108%',
          splitNumber: 4,
          axisLine: { lineStyle: { width: 22, color: bandColors } },
          pointer: { width: 6, length: '60%', itemStyle: { color: '#111' } },
          anchor: { show: true, size: 12, itemStyle: { color: '#111' } },
          axisTick: { show: false },
          splitLine: { distance: -22, length: 22, lineStyle: { color: '#fff', width: 2 } },
          axisLabel: { distance: 8, color: C.ink3, fontSize: 11, formatter: v => Math.round(v) },
          detail: { show: true, offsetCenter: [0, '38%'], color: value < 0 ? '#ef4444' : (value >= 50 ? '#22c55e' : '#f59e0b'), fontSize: 40, fontWeight: 800, formatter: '{value}' },
          data: [{ value }] }]
      });
      return inst;
    },

    /* ---- Survey: horizontal diverging bars (Business Units) ------------- */
    divergingBars: function (el, rows, opts) {
      opts = opts || {};
      const inst = make(el);
      const cats = rows.map(r => r.name);
      const values = rows.map(r => Number(r.value));
      const anyNeg = values.some(v => v < 0);
      const maxV = Math.max.apply(null, values.concat([0]));
      const isRating = (opts.metricLabel === 'RATING');
      // axis adapts: 0..max when everything is positive, diverging when not
      const axisMax = isRating ? 5 : (maxV <= 100 ? 100 : Math.ceil(maxV));
      const axisMin = anyNeg ? -axisMax : 0;
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => {
          const r = rows[p[0].dataIndex]; return `<b>${r.name}</b><br/>${opts.metricLabel || 'NPS'}: <b>${r.value}</b><br/>Responses: ${r.responses}`;
        } }, baseTooltip),
        grid: { left: 160, right: 76, top: 12, bottom: 40 },
        xAxis: { type: 'value', min: axisMin, max: axisMax, axisLine: { lineStyle: { color: C.line } }, splitLine, axisLabel: Object.assign({}, axisLabel, { formatter: v => Math.abs(v) }) },
        yAxis: { type: 'category', data: cats, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: Object.assign({}, axisLabel, { color: C.ink, fontWeight: 600, fontSize: 13 }) },
        series: [{ type: 'bar', barMaxWidth: 22,
          data: rows.map(r => {
            const base = (opts.colorFor || (v => v >= 70 ? '#22c55e' : v >= 50 ? '#2563eb' : v >= 30 ? '#60a5fa' : v >= 0 ? '#f59e0b' : '#ef4444'))(r.value);
            const isFaded = opts.faded && opts.faded.length && opts.faded.indexOf(r.name) === -1;
            return { value: r.value, itemStyle: { color: isFaded ? base + '55' : base, borderRadius: r.value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } };
          }),
          label: { show: true, position: 'right', align: 'left', distance: 8, color: C.ink, fontWeight: 700,
            formatter: p => opts.tag ? `${p.value} {u|${opts.tag}}` : `${p.value}`,
            rich: { u: { color: C.ink3, fontSize: 10, fontWeight: 500, padding: [0, 0, 0, 2] } } } }]
      });
      if (opts.onClick) inst.on('click', p => opts.onClick(rows[p.dataIndex]));
      return inst;
    },

    /* ---- Survey: horizontal stacked bar (Area of Improvements) ---------- */
    stackedH: function (el, opts) {
      const inst = make(el);
      const brands = opts.brands, cats = opts.categories, values = opts.values;
      const series = cats.map(([name, color], i) => ({
        name, type: 'bar', stack: 'x', barMaxWidth: 22, itemStyle: { color, borderRadius: i === cats.length - 1 ? [0, 4, 4, 0] : (i === 0 ? [4, 0, 0, 4] : 0) },
        label: { show: true, color: '#fff', fontWeight: 700, formatter: p => p.value || '' },
        data: brands.map(b => (values[b] || [])[i] || 0)
      }));
      const totals = opts.totals || brands.map(b => (values[b] || []).reduce((a, x) => a + (x || 0), 0));
      const maxT = Math.max(1, ...totals);
      // invisible tail series carries the row total as an end-of-bar label
      series.push({ name: 'total', type: 'bar', stack: 'x', barMaxWidth: 22, itemStyle: { color: 'transparent' },
        tooltip: { show: false }, silent: true,
        label: { show: true, position: 'right', color: C.ink, fontWeight: 700, formatter: p => totals[p.dataIndex] },
        data: brands.map(() => 0) });
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, baseTooltip),
        legend: { show: false },
        grid: { left: 160, right: 40, top: 20, bottom: 40 },
        xAxis: { type: 'value', max: Math.ceil(maxT * 1.08), axisLabel, splitLine, name: opts.xLabel || 'No of Responses', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: C.ink2, fontWeight: 600 } },
        yAxis: { type: 'category', data: brands, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: Object.assign({}, axisLabel, { color: C.ink, fontWeight: 600, fontSize: 13 }) },
        series
      });
      return inst;
    },

    /* ---- Survey: metrics comparison lines ------------------------------- */
    compareLines: function (el, dates, series, min, max) {
      const inst = make(el);
      const palette = ['#2563eb', '#22c55e', '#a855f7', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis' }, baseTooltip),
        legend: { data: series.map(s => s.name), top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2 } },
        grid: { left: 44, right: 24, top: 36, bottom: 50 },
        xAxis: { type: 'category', boundaryGap: false, data: dates, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', min, max, axisLabel, splitLine },
        dataZoom: [{ type: 'slider', bottom: 12, height: 16, borderColor: C.line, fillerColor: 'rgba(37,99,235,.12)' }],
        series: series.map((s, i) => ({ name: s.name, type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
          lineStyle: { width: 2.5, color: palette[i % palette.length] }, itemStyle: { color: palette[i % palette.length] },
          areaStyle: { opacity: 0.06, color: palette[i % palette.length] }, data: s.data }))
      });
      return inst;
    },

    /* ---- Survey: channel-analysis stacked / grouped bars per day -------- */
    channelStacked: function (el, dates, series, asLine) {
      const inst = make(el);
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: asLine ? 'line' : 'shadow' } }, baseTooltip),
        legend: { data: series.map(s => s.name), top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2 } },
        grid: { left: 44, right: 24, top: 36, bottom: 60 },
        xAxis: { type: 'category', data: dates, axisLabel: Object.assign({}, axisLabel, { rotate: 0 }), axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', minInterval: 1, axisLabel, splitLine },
        dataZoom: [{ type: 'slider', bottom: 14, height: 18, borderColor: C.line, fillerColor: 'rgba(37,99,235,.12)', start: 55 }],
        series: series.map(s => ({ name: s.name, type: asLine ? 'line' : 'bar', smooth: asLine, symbol: 'none',
          barMaxWidth: 12, itemStyle: { color: s.color, borderRadius: [2, 2, 0, 0] }, lineStyle: { color: s.color, width: 2 }, data: s.data }))
      });
      return inst;
    },

    /* ---- Survey: sentiment score trend — shaded band regions + line ----- */
    sentimentBands: function (el, trend, bands) {
      const inst = make(el);
      const marks = bands.map(b => [{ yAxis: b.from, itemStyle: { color: b.color, opacity: 0.10 } }, { yAxis: b.to }]);
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis' }, baseTooltip),
        legend: { data: bands.map(b => b.name), top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2, fontSize: 11 } },
        grid: { left: 44, right: 24, top: 44, bottom: 52 },
        xAxis: { type: 'category', boundaryGap: false, data: trend.map(t => t.d), axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', min: 0, max: 80, interval: 10, axisLabel, splitLine },
        dataZoom: [{ type: 'slider', bottom: 12, height: 16, borderColor: C.line, fillerColor: 'rgba(37,99,235,.1)' }],
        series: bands.map(b => ({ name: b.name, type: 'line', data: [], showSymbol: false })).concat([{
          name: 'Score', type: 'line', smooth: false, symbol: 'circle', symbolSize: 6,
          lineStyle: { color: '#22c55e', width: 2.5 }, itemStyle: { color: '#22c55e' },
          areaStyle: { color: 'rgba(34,197,94,.08)' }, data: trend.map(t => t.score),
          markArea: { silent: true, data: marks }
        }])
      });
      return inst;
    },

    /* ---- Survey: sentiment contribution pie (labelled %) ---------------- */
    contributionPie: function (el, slices) {
      const inst = make(el);
      inst.setOption({
        tooltip: Object.assign({ trigger: 'item', formatter: p => `${p.name}: ${p.value}%` }, baseTooltip),
        series: [{ type: 'pie', radius: '72%', center: ['50%', '50%'], avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 1 },
          label: { formatter: '{d}%', color: C.ink, fontWeight: 700, fontSize: 12 },
          labelLine: { length: 10, length2: 12 },
          data: slices.map(s => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })) }]
      });
      return inst;
    },

    /* ---- Survey: sentiment contribution stacked bars (w/ grey capacity) - */
    contributionStacked: function (el, c) {
      const inst = make(el);
      const series = [{ name: 'total', type: 'bar', stack: 'cap', silent: true, barMaxWidth: 52,
        itemStyle: { color: '#eceef1' }, data: c.capacity, tooltip: { show: false }, z: 1 }];
      // draw the real stack in a second stack group on top
      c.stacks.forEach(s => series.push({ name: s.name, type: 'bar', stack: 'real', barMaxWidth: 52,
        itemStyle: { color: s.color }, data: s.data, z: 2, barGap: '-100%' }));
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, baseTooltip),
        legend: { data: c.stacks.map(s => s.name).reverse(), top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2, fontSize: 11 } },
        grid: { left: 48, right: 24, top: 40, bottom: 56 },
        xAxis: { type: 'category', data: c.dates, axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', axisLabel, splitLine },
        dataZoom: [{ type: 'slider', bottom: 12, height: 16, borderColor: C.line, fillerColor: 'rgba(37,99,235,.1)' }],
        series
      });
      return inst;
    },

    /* ---- Survey: channel communication journey (grouped funnel) --------- */
    journeyBars: function (el, j) {
      const inst = make(el);
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, baseTooltip),
        legend: { data: j.channels.map(c => c.name), top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2 } },
        grid: { left: 60, right: 24, top: 40, bottom: 36 },
        xAxis: { type: 'category', data: j.stages, axisLabel: Object.assign({}, axisLabel, { color: C.ink, fontWeight: 600 }), axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', axisLabel: Object.assign({}, axisLabel, { formatter: v => v >= 1000 ? (v / 1000) + 'K' : v }), splitLine },
        series: j.channels.map(c => ({ name: c.name, type: 'bar', barMaxWidth: 34, itemStyle: { color: c.color, borderRadius: [3, 3, 0, 0] }, data: c.data }))
      });
      return inst;
    },

    /* ---- Survey: submissions-by-channel donut --------------------------- */
    submissionsDonut: function (el, rows) {
      const inst = make(el);
      const total = rows.reduce((a, r) => a + r.value, 0);
      inst.setOption({
        tooltip: Object.assign({ trigger: 'item', formatter: p => `${p.name}: ${p.value.toLocaleString()} (${p.percent}%)` }, baseTooltip),
        legend: { orient: 'vertical', right: 20, top: 'middle', icon: 'circle', textStyle: { color: C.ink2 } },
        series: [{ type: 'pie', radius: ['52%', '78%'], center: ['38%', '50%'], avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: true, position: 'center', formatter: () => `{a|${total.toLocaleString()}}\n{b|Submissions}`,
            rich: { a: { fontSize: 22, fontWeight: 800, color: C.ink }, b: { fontSize: 12, color: C.ink3 } } },
          emphasis: { label: { show: true } },
          data: rows.map(r => ({ name: r.name, value: r.value, itemStyle: { color: r.color } })) }]
      });
      return inst;
    },

    /* ---- Survey: sentiment score trend (bands + line) -------------------- */
    sentimentBand: function (el, trend) {
      const inst = make(el);
      inst.setOption({
        tooltip: Object.assign({ trigger: 'axis' }, baseTooltip),
        legend: { data: ['Very Positive (81–100)', 'Positive (61–80)', 'Neutral (41–60)', 'Negative (21–40)', 'Very Negative (0–20)'], top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2, fontSize: 11 } },
        grid: { left: 40, right: 20, top: 44, bottom: 48 },
        xAxis: { type: 'category', boundaryGap: false, data: trend.map(t => t.d), axisLabel, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', min: 0, max: 100, axisLabel, splitLine },
        dataZoom: [{ type: 'slider', bottom: 10, height: 14, borderColor: C.line, fillerColor: 'rgba(37,99,235,.1)' }],
        series: [
          { name: 'Very Positive (81–100)', type: 'line', stack: 'b', areaStyle: { color: 'rgba(34,197,94,.15)' }, lineStyle: { width: 0 }, symbol: 'none', data: trend.map(t => t.vpos) },
          { name: 'Positive (61–80)',       type: 'line', stack: 'b', areaStyle: { color: 'rgba(132,204,22,.15)' }, lineStyle: { width: 0 }, symbol: 'none', data: trend.map(t => t.pos) },
          { name: 'Neutral (41–60)',        type: 'line', stack: 'b', areaStyle: { color: 'rgba(245,158,11,.18)' }, lineStyle: { width: 0 }, symbol: 'none', data: trend.map(t => t.neu) },
          { name: 'Negative (21–40)',       type: 'line', stack: 'b', areaStyle: { color: 'rgba(251,146,60,.18)' }, lineStyle: { width: 0 }, symbol: 'none', data: trend.map(t => t.neg) },
          { name: 'Very Negative (0–20)',   type: 'line', stack: 'b', areaStyle: { color: 'rgba(239,68,68,.18)' }, lineStyle: { width: 0 }, symbol: 'none', data: trend.map(t => t.vneg) },
          { name: 'Score', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { color: '#2563eb', width: 2.5 }, itemStyle: { color: '#2563eb' }, data: trend.map(t => t.score), z: 5 }
        ]
      });
      return inst;
    },

    /* ---- Time Intelligence: weekday/weekend trend lines ----------------- */
    /* ---- Time Intelligence: weekday vs weekend grouped bars (per slot) --- */
    wwBars: function (el, rows) {
      const inst = make(el);
      // Anchor the axis at 0 (the meaningful NPS baseline) but fit it to the
      // actual data range rather than always spanning the full -100..100 —
      // otherwise an all-positive dataset leaves bars floating in the upper
      // half with no visible "ground" to stand on.
      const vals = rows.flatMap(r => [r.lowWeekday ? null : r.weekdayNps, r.lowWeekend ? null : r.weekendNps]).filter(v => v != null);
      const dataMin = vals.length ? Math.min(...vals) : 0, dataMax = vals.length ? Math.max(...vals) : 0;
      const axisMin = Math.floor(Math.min(0, dataMin) - 8), axisMax = Math.ceil(Math.max(0, dataMax) + 8);
      inst.setOption({
        color: ['#7C3AED', '#fb923c'],
        tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => v == null ? 'Low sample' : 'NPS ' + v }, baseTooltip),
        legend: { data: ['Weekday', 'Weekend'], top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2 } },
        grid: { left: 40, right: 16, top: 40, bottom: 50 },
        xAxis: { type: 'category', data: rows.map(r => r.name), axisLabel: Object.assign({}, axisLabel, { interval: 0, rotate: rows.length > 5 ? 20 : 0 }), axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false } },
        yAxis: { type: 'value', min: axisMin, max: axisMax, axisLabel, splitLine },
        series: [
          { name: 'Weekday', type: 'bar', barMaxWidth: 26, itemStyle: { borderRadius: [4, 4, 0, 0] }, data: rows.map(r => r.lowWeekday ? null : r.weekdayNps),
            markLine: { silent: true, symbol: 'none', lineStyle: { color: C.line, type: 'solid', width: 1 }, label: { show: false }, data: [{ yAxis: 0 }] } },
          { name: 'Weekend', type: 'bar', barMaxWidth: 26, itemStyle: { borderRadius: [4, 4, 0, 0] }, data: rows.map(r => r.lowWeekend ? null : r.weekendNps) }
        ]
      });
      return inst;
    },

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
