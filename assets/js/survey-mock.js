/* ============================================================================
 * Survey Analytics — client-side aggregation ("API")
 * Modelled on the live Karnival Survey Analytics (dashboard.karnival.in),
 * scoped to the 5 Haldiram legal entities. Swappable for a real backend: the
 * module only ever calls SurveyApi.*
 *
 * Score bands (drive the Business Units bar colors + legend):
 *   Excellent 70+ · Good 50-69 · Average 30-49 · Below Average 0-29 · Poor <0
 * ========================================================================== */
(function (global) {
  'use strict';

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
  // hash() can be negative (32-bit signed) — use this for a safe non-negative modulo
  function hmod(s, n) { return ((hash(s) % n) + n) % n; }

  // ---- Headline (matches the live default: NPS 63, 3.1M sent, 18.0K resp) --
  // Totals bumped from the original 2.8M/16.5K to fold in Haldiram UK's
  // volume, keeping "responses sum to the headline total" true for 6 brands.
  const HEADLINE = {
    NPS:    { value: 63,  totalSurveys: '3.1M', responses: '18.0K', respN: 18000 },
    CSAT:   { value: 78,  totalSurveys: '3.1M', responses: '18.0K', respN: 18000 },
    CES:    { value: 71,  totalSurveys: '3.1M', responses: '18.0K', respN: 18000 },
    RATING: { value: 4.3, totalSurveys: '3.1M', responses: '18.0K', respN: 18000 }
  };
  const DIST = {
    NPS:  [{ key: 'Promoters',  range: '(9 to 10)', pct: 76, users: '13.7K', color: '#22c55e' },
           { key: 'Passives',   range: '(7 to 8)',  pct: 11, users: '2.0K',  color: '#f59e0b' },
           { key: 'Detractors', range: '(0 to 6)',  pct: 13, users: '2.3K',  color: '#ef4444' }],
    CSAT: [{ key: 'Satisfied',    range: '(4 to 5)', pct: 78, users: '14.0K', color: '#22c55e' },
           { key: 'Neutral',      range: '(3)',      pct: 12, users: '2.2K',  color: '#f59e0b' },
           { key: 'Dissatisfied', range: '(1 to 2)', pct: 10, users: '1.8K',  color: '#ef4444' }],
    CES:  [{ key: 'Effortless',  range: '(6 to 7)', pct: 71, users: '12.8K', color: '#22c55e' },
           { key: 'Moderate',    range: '(4 to 5)', pct: 18, users: '3.2K',  color: '#f59e0b' },
           { key: 'High Effort', range: '(1 to 3)', pct: 11, users: '2.0K',  color: '#ef4444' }],
    RATING: [{ key: '5 ★', pct: 52, users: '9.4K', color: '#22c55e' },
             { key: '4 ★', pct: 26, users: '4.7K', color: '#84cc16' },
             { key: '3 ★', pct: 12, users: '2.2K', color: '#f59e0b' },
             { key: '2 ★', pct: 6,  users: '1.1K', color: '#fb923c' },
             { key: '1 ★', pct: 4,  users: '0.7K', color: '#ef4444' }]
  };

  // ---- Business units: the 6 Haldiram legal entities ------------------------
  const BU_NAMES = [
    'HALDIRAM MARKETING PVT. LTD. - HEFPL',
    'HALDIRAM MARKETING PVT. LTD.- HMCPL',
    'Haldiram Marketing Private Limited- HMPL',
    'Haldiram UAE',
    'HALDIRAM MARKETING PVT. LTD. - HPPL',
    'Haldiram UK'
  ];
  // Explicit per-brand signature so the rows span every score band (spread
  // across Excellent/Good/Average/Poor) and responses sum to the headline
  // total (18.0K), so the drilldown stays internally consistent.
  const BU_SIGNATURE = {
    'HALDIRAM MARKETING PVT. LTD. - HEFPL':    { nps: 72, responses: 5300 },
    'HALDIRAM MARKETING PVT. LTD.- HMCPL':     { nps: 55, responses: 3100 },
    'Haldiram Marketing Private Limited- HMPL': { nps: 38, responses: 2600 },
    'Haldiram UAE':                             { nps: 68, responses: 4200 },
    'HALDIRAM MARKETING PVT. LTD. - HPPL':     { nps: 5,  responses: 1300 },
    'Haldiram UK':                              { nps: 61, responses: 1500 }
  };
  // ---- Per-brand local timezone ---------------------------------------------
  // Every response is tied to an invoice timestamp stored in UTC; Time
  // Intelligence's hour-of-day / day-of-week buckets ("Lunch", "Weekend", ...)
  // are meaningless unless read in the RESPONDENT'S local time, not UTC or any
  // one shared clock. India and the UAE run a single fixed offset year-round;
  // the UK observes British Summer Time (BST, UTC+1) roughly late-March to
  // late-October and GMT (UTC+0) the rest of the year, so its offset is
  // computed from the date rather than hardcoded — see bstOffsetMinutes().
  const BU_TIMEZONE = {
    'HALDIRAM MARKETING PVT. LTD. - HEFPL':     { label: 'IST', offsetMinutes: 330 },
    'HALDIRAM MARKETING PVT. LTD.- HMCPL':      { label: 'IST', offsetMinutes: 330 },
    'Haldiram Marketing Private Limited- HMPL': { label: 'IST', offsetMinutes: 330 },
    'HALDIRAM MARKETING PVT. LTD. - HPPL':      { label: 'IST', offsetMinutes: 330 },
    'Haldiram UAE':                             { label: 'GST', offsetMinutes: 240 },
    'Haldiram UK':                              { label: null, offsetMinutes: null } // resolved per-date, see below
  };
  // Last Sunday of a given (year, 0-based month), at 00:00 UTC.
  function lastSundayOfMonth(year, monthIdx) {
    const d = new Date(Date.UTC(year, monthIdx + 1, 0)); // last calendar day of the month
    d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // step back to that month's last Sunday
    return d;
  }
  // British Summer Time runs from the last Sunday in March to the last Sunday
  // in October (clocks go forward/back at 01:00 UTC); GMT otherwise.
  function isBST(date) {
    const y = date.getUTCFullYear();
    return date >= lastSundayOfMonth(y, 2) && date < lastSundayOfMonth(y, 9);
  }
  function ukTimezone(date) { return isBST(date) ? { label: 'BST', offsetMinutes: 60 } : { label: 'GMT', offsetMinutes: 0 }; }
  // Timezone for a brand as of `date` (defaults to TI_TODAY, defined below).
  function brandTimezone(brandName, date) {
    if (brandName === 'Haldiram UK') return ukTimezone(date || TI_TODAY);
    return BU_TIMEZONE[brandName] || { label: 'IST', offsetMinutes: 330 };
  }
  function tzLabel(tz) { return `${tz.label} (UTC${tz.offsetMinutes >= 0 ? '+' : '-'}${Math.floor(Math.abs(tz.offsetMinutes) / 60)}${Math.abs(tz.offsetMinutes) % 60 ? ':' + (Math.abs(tz.offsetMinutes) % 60) : ''})`; }

  // Deterministic per-brand stats
  const BUS = BU_NAMES.map((name, i) => {
    const rr = rng(hash(name));
    const sig = BU_SIGNATURE[name];
    const nps = sig.nps;
    const responses = sig.responses;
    const promoter = Math.max(0, Math.min(100, Math.round((nps + 100) / 2 + rr() * 8)));
    const detractor = Math.max(0, Math.min(100 - promoter, Math.round(promoter - nps)));
    const passive = Math.max(0, 100 - promoter - detractor);
    const trend = Math.round((rr() * 70) - 20); // period-over-period % swing
    return { name, nps, responses, promoter, passive, detractor, trend,
      csat: Math.max(0, Math.min(100, Math.round(60 + nps * 0.35 + rr() * 8))),
      ces:  Math.max(0, Math.min(100, Math.round(55 + nps * 0.32 + rr() * 8))),
      rating: +Math.max(1, Math.min(5, (3 + nps / 60 + rr() * 0.4)).toFixed(1)) };
  });
  const metricKey = { NPS: 'nps', CSAT: 'csat', CES: 'ces', RATING: 'rating' };

  // ---- drilldown hierarchy: Brand -> Country -> Zone -> State -> City -> Store
  const COUNTRIES = ['AE', 'SA', 'KW', 'QA', 'BH', 'OM'];
  const ZONES = ['Zone A', 'Zone B'];
  const STATES = { AE: ['Dubai', 'Abu Dhabi', 'Sharjah'], SA: ['Riyadh', 'Jeddah'], KW: ['Kuwait City'], QA: ['Doha'], BH: ['Manama'], OM: ['Muscat'] };
  function citiesFor(state) { return [state + ' Central', state + ' Suburbs']; }
  function storesFor(city) { return [city + ' Mall Store', city + ' Outlet Store', city + ' Flagship Store']; }

  const BAND_COLORS = [
    { min: 70,   label: 'Excellent (70+)',      short: 'Excellent',     range: '70+',      color: '#22c55e' },
    { min: 50,   label: 'Good (50–69)',         short: 'Good',          range: '50–69',    color: '#2563eb' },
    { min: 30,   label: 'Average (30–49)',      short: 'Average',       range: '30–49',    color: '#60a5fa' },
    { min: 0,    label: 'Below Average (0–29)', short: 'Below Average', range: '0–29',     color: '#f59e0b' },
    { min: -101, label: 'Poor (Below 0)',       short: 'Poor',          range: 'Below 0',  color: '#ef4444' }
  ];
  function colorFor(v) { for (const b of BAND_COLORS) if (v >= b.min) return b.color; return '#ef4444'; }

  // rows for a given metric + drill path
  function drilldown(metric, path) {
    const mk = metricKey[metric] || 'nps';
    if (!path || !path.length) {
      return BUS.map(b => ({ name: b.name, value: b[mk], responses: b.responses,
        promoter: b.promoter, passive: b.passive, detractor: b.detractor, trend: b.trend }));
    }
    const brand = BUS.find(b => b.name === path[0]) || BUS[0];
    const parentVal = brand[mk], parentResp = brand.responses;
    let keys = [];
    if (path.length === 1) keys = COUNTRIES.slice(0, 2 + hmod(brand.name, 3));
    else if (path.length === 2) keys = ZONES;
    else if (path.length === 3) keys = STATES[path[1]] || ['Region 1'];
    else if (path.length === 4) keys = citiesFor(path[3]);
    else if (path.length === 5) keys = storesFor(path[4]);
    else return [];
    const rr = rng(hash(path.join('|')));
    let assigned = 0;
    return keys.map((k, i) => {
      const dev = i < keys.length - 1 ? Math.round(rr() * 14 - 7) : 0;
      const v = metric === 'RATING' ? +Math.max(1, Math.min(5, parentVal + dev / 20)).toFixed(1)
        : Math.max(-100, Math.min(100, parentVal + dev));
      const resp = i === keys.length - 1 ? Math.max(1, parentResp - assigned) : Math.max(1, Math.round(parentResp * (0.15 + rr() * 0.3)));
      assigned += resp;
      const promoter = Math.max(0, Math.min(100, Math.round((Number(v) + 100) / 2)));
      const detractor = Math.max(0, Math.min(100 - promoter, Math.round(promoter - Number(v))));
      return { name: k, value: v, responses: resp, promoter, passive: Math.max(0, 100 - promoter - detractor), detractor, trend: Math.round(rr() * 120 - 20) };
    });
  }
  function levelName(depth) { return ['Business Units', 'Country', 'Zone', 'State', 'City', 'Store'][depth] || 'Store'; }
  function canDrill(depth) { return depth < 5; }

  function aggregate(metric) {
    const h = HEADLINE[metric] || HEADLINE.NPS;
    return { metric, value: h.value, min: metric === 'RATING' ? 0 : (metric === 'NPS' ? -100 : 0), max: metric === 'RATING' ? 5 : 100,
      totalSurveys: h.totalSurveys, responses: h.responses, rows: DIST[metric] || DIST.NPS };
  }

  // ==== AI Sentiment — Executive Pulse (3 cards) ===========================
  function sentimentExecutivePulse() {
    const rr = rng(509);
    const days = ['22 Jul', '23 Jul', '24 Jul', '25 Jul', '26 Jul', '27 Jul', '28 Jul'];
    return {
      score: 50.9, label: 'Neutral', delta: '+0.00', vsLabel: 'vs Previous Week',
      // score line + shaded band regions behind it
      trend: days.map(d => ({ d, score: 46 + Math.round(rr() * 26) })),
      bands: [
        { name: 'Very Positive (81–100)', from: 81, to: 100, color: '#16a34a' },
        { name: 'Positive (61–80)',       from: 61, to: 80,  color: '#22c55e' },
        { name: 'Neutral (41–60)',        from: 41, to: 60,  color: '#f59e0b' },
        { name: 'Negative (21–40)',       from: 21, to: 40,  color: '#f87171' },
        { name: 'Very Negative (0–20)',   from: 0,  to: 20,  color: '#b91c1c' }
      ],
      // Customer Sentiment Contribution: pie + stacked-by-day
      contribution: {
        pie: [{ name: 'Very Positive', value: 34, color: '#16a34a' }, { name: 'Positive', value: 39, color: '#22c55e' },
              { name: 'Neutral', value: 13, color: '#f59e0b' }, { name: 'Negative', value: 10, color: '#ef4444' },
              { name: 'Very Negative', value: 4, color: '#991b1b' }],
        dates: ['27 JUL, 2026', '28 JUL, 2026'],
        // stacked counts per day, plus a "total capacity" grey backdrop
        stacks: [
          { name: 'Very Negative', color: '#991b1b', data: [12, 3] },
          { name: 'Negative',      color: '#ef4444', data: [16, 5] },
          { name: 'Neutral',       color: '#f59e0b', data: [22, 8] },
          { name: 'Positive',      color: '#22c55e', data: [48, 26] },
          { name: 'Very Positive', color: '#16a34a', data: [30, 18] }
        ],
        capacity: [150, 150]
      },
      // Top 5 Aspects Driving Sentiment
      aspects: {
        negative: [{ aspect: 'Refund Process', score: 5, label: 'Very Negative', n: 1 },
                   { aspect: 'Staff Expertise', score: 10, label: 'Very Negative', n: 1 },
                   { aspect: 'Promotion Sticker', score: 10, label: 'Very Negative', n: 1 },
                   { aspect: 'Checkout Speed', score: 10, label: 'Very Negative', n: 1 },
                   { aspect: 'Advice Quality', score: 12.5, label: 'Very Negative', n: 1 }],
        positive: [{ aspect: 'Buying Experience', score: 95, label: 'Very Positive', n: 1 },
                   { aspect: 'Experience', score: 95, label: 'Very Positive', n: 1 },
                   { aspect: 'Client Attendee', score: 95, label: 'Very Positive', n: 1 },
                   { aspect: 'Quality', score: 95, label: 'Very Positive', n: 2 },
                   { aspect: 'Shop', score: 95, label: 'Very Positive', n: 1 }]
      }
    };
  }

  // ==== Voice of Customer ==================================================
  const VOC_THEMES = [['Gift',1],['Customer Hospitality',1],['Refund Process',1],['Senior Citizen Accessibility',1],
    ['Buying Experience',1],['Price Tags',1],['Product Selection',1],['Staff Expertise',1],['Bag',1],
    ['Discount',1],['Esaad Card',1],['Gift Selection Assistance',1],['Experience',1],['Sales',1],
    ['Discounts',2],['Staff Experience',1],['Service Quality',1],['Price',6],['Advice Quality',1],
    ['Return Policy',1],['Payment',1],['Application Requirement',1],['Family Accessibility',1],
    ['Client Attendee',1],['Clothing Price',1],['Collection',1],['Cash Payment',1],['Kids Items',1],
    ['Quality',2],['Size',1],['Product Options',1],['Promotion Sticker',1],['Size Availability',2],
    ['Promotional Offers',2],['Clothing Section',2],['R And B',2],['Shop',2],['Price Reduction',2]];
  function sentimentVoiceOfCustomer() {
    return {
      themes: VOC_THEMES.map(([theme, count]) => ({ theme, count, size: 15 + count * 4 })),
      feedback: [
        { score: 50, label: 'Neutral',       date: '28/07/2026', question: 'Is there anything specific that we can do to better your shopping experience?', body: 'Overall fine — checkout could be faster.' },
        { score: 95, label: 'Very Positive', date: '28/07/2026', question: 'What did you love the most about your visit?', body: 'Excellent buying experience and very helpful client attendee.' },
        { score: 22, label: 'Negative',      date: '27/07/2026', question: 'What went wrong today?', body: 'Refund process took far too long and staff seemed unsure.' },
        { score: 78, label: 'Positive',      date: '27/07/2026', question: 'Any specific staff we should recognise?', body: 'The floor manager helped me find the right size quickly.' },
        { score: 10, label: 'Very Negative', date: '26/07/2026', question: 'What would you improve?', body: 'Promotion stickers were misleading and checkout speed was poor.' }
      ]
    };
  }

  // ==== Area of Improvements — stacked bar + total ==========================
  function improvements(kind) {
    const cats = kind === 'appreciation'
      ? [['Staff Friendliness', '#5eead4'], ['Product Quality', '#14b8a6'], ['Store Ambience', '#f59e0b'], ['Fast Checkout', '#fbbf24'], ['Value For Money', '#f472b6'], ['Loyalty Perks', '#d946a6']]
      : [['Price', '#5eead4'], ['Product Selection', '#14b8a6'], ['Staff Expertise', '#f59e0b'], ['Checkout Speed', '#fbbf24'], ['Refund Process', '#f472b6'], ['Size Availability', '#d946a6']];
    // row weight roughly follows each brand's NPS (lower NPS → more "things to
    // improve" mentions, fewer "appreciation" mentions, and vice-versa)
    const rows = kind === 'appreciation' ? [
      { name: 'HALDIRAM MARKETING PVT. LTD. - HEFPL',     values: [62, 48, 24, 9, 15, 12] },
      { name: 'Haldiram UAE',                              values: [51, 40, 19, 8, 12, 9] },
      { name: 'HALDIRAM MARKETING PVT. LTD.- HMCPL',       values: [22, 16, 7, 3, 5, 3] },
      { name: 'Haldiram Marketing Private Limited- HMPL',  values: [9, 6, 3, 1, 2, 1] },
      { name: 'HALDIRAM MARKETING PVT. LTD. - HPPL',       values: [3, 2, 1, 0, 1, 0] }
    ] : [
      { name: 'HALDIRAM MARKETING PVT. LTD. - HPPL',       values: [155, 129, 56, 5, 71, 46] },
      { name: 'Haldiram Marketing Private Limited- HMPL',  values: [40, 34, 15, 4, 18, 11] },
      { name: 'HALDIRAM MARKETING PVT. LTD.- HMCPL',       values: [18, 16, 7, 2, 7, 7] },
      { name: 'Haldiram UAE',                              values: [11, 9, 5, 2, 2, 1] },
      { name: 'HALDIRAM MARKETING PVT. LTD. - HEFPL',      values: [7, 5, 2, 1, 2, 0] }
    ];
    rows.forEach(r => r.total = r.values.reduce((a, b) => a + b, 0));
    return { categories: cats, rows, totalSurveys: '2.8M', responses: rows.reduce((a, r) => a + r.total, 0) };
  }

  // ==== Metrics Comparison =================================================
  function metricsComparison(metric, brandNames) {
    metric = metric || 'NPS';
    const mk = metricKey[metric] || 'nps';
    brandNames = (brandNames && brandNames.length) ? brandNames : ['HALDIRAM MARKETING PVT. LTD. - HEFPL', 'Haldiram UAE'];
    const dates = []; for (let d = 1; d <= 28; d++) dates.push('2026-07-' + String(d).padStart(2, '0'));
    const max = metric === 'RATING' ? 5 : 100, min = metric === 'NPS' ? -100 : 0;
    const series = brandNames.map(name => {
      const b = BUS.find(x => x.name === name) || BUS[0];
      const rr = rng(hash(name + metric));
      const anchor = b[mk];
      return { name, data: dates.map(() => { // spiky like the live chart: mostly 0, occasional peak
        const spike = rr() > 0.86;
        return spike ? Math.min(max, anchor) : (metric === 'NPS' ? 0 : Math.round(anchor * 0.05));
      }) };
    });
    return { metric, dates, series, min, max, bands: BAND_COLORS };
  }

  // ==== Channel Analysis — 3 cards ==========================================
  function channelAnalysis() {
    const rr = rng(7788);
    const dates = []; for (let d = 1; d <= 28; d++) dates.push('2026-07-' + String(d).padStart(2, '0'));
    const stages = [['Viewed', '#4f46e5'], ['Submitted', '#22c55e'], ['Delivered', '#fbbf24'], ['Failed', '#ef4444'], ['Ignored', '#67e8f9']];
    const overview = stages.map(([name, color]) => ({ name, color, data: dates.map(() => {
      if (name === 'Delivered') return 65000 + Math.round(rr() * 85000);
      if (name === 'Viewed') return 4000 + Math.round(rr() * 6000);
      if (name === 'Submitted') return 3000 + Math.round(rr() * 16000);
      return Math.round(rr() * 1500);
    }) }));
    // Communication journey funnel per channel
    const journey = {
      stages: ['Sent', 'Delivered', 'Viewed', 'Submitted'],
      channels: [
        { name: 'Email',    color: '#4f46e5', data: [1420000, 1390000, 210000, 9800] },
        { name: 'SMS',      color: '#22c55e', data: [980000, 962000, 128000, 4200] },
        { name: 'Whatsapp', color: '#f59e0b', data: [390000, 386000, 96000, 2300] },
        { name: 'Other',    color: '#a855f7', data: [42000, 41000, 6800, 200] }
      ]
    };
    // Submissions by channel donut
    const submissions = [
      { name: 'Email',    value: 9800, color: '#4f46e5' },
      { name: 'SMS',      value: 4200, color: '#22c55e' },
      { name: 'Whatsapp', value: 2300, color: '#f59e0b' },
      { name: 'Other',    value: 200,  color: '#a855f7' }
    ];
    return { dates, overview, journey, submissions };
  }

  // ==========================================================================
  // Time Intelligence — NPS by invoice date (hour-of-day slot & day-of-week)
  // Every response is tied to the invoice/purchase that triggered its survey;
  // the invoice's timestamp (not the survey submission time) decides which
  // time-slot and weekday/weekend bucket it falls into. Per-brand hour×day
  // matrices are generated so slot/weekday aggregates stay response- and
  // NPS-consistent with each brand's headline numbers (BU_SIGNATURE).
  // ==========================================================================
  const TI_DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const TI_MIN_SAMPLE = 30;
  // Slot start/end are whole hours (0-23) — the underlying per-brand matrix
  // (BRAND_HOURDAY) is itself indexed by whole hour, so minute-level slot
  // boundaries were never actually honored; this makes the UI match reality.
  // Every slot belongs to exactly one market — there is no "applies to every
  // market" bucket. Each of IST/GST/UK ships with its own independent copy
  // of the same 6 slots below, so switching Time Zone never looks like
  // slots went missing; each market's copy can then be edited separately.
  const TI_DEFAULT_SLOT_TEMPLATE = [
    { name: 'Early Morning', start: 6,  end: 9 },
    { name: 'Late Morning',  start: 9,  end: 12 },
    { name: 'Lunch',         start: 12, end: 15 },
    { name: 'Afternoon',     start: 15, end: 17 },
    { name: 'Evening',       start: 17, end: 21 },
    { name: 'Night',         start: 21, end: 6 }
  ];
  const TI_DEFAULT_SLOTS = ['IST', 'GST', 'UK'].flatMap(mk =>
    TI_DEFAULT_SLOT_TEMPLATE.map((t, i) => Object.assign({ id: `s-${mk.toLowerCase()}-${i + 1}`, market: mk }, t))
  );
  // Markets a slot can be restricted to — keyed the same way brandTimezone()
  // labels fixed-offset brands ('IST'/'GST'); 'UK' covers Haldiram UK's
  // date-dependent GMT/BST offset under one stable key.
  const TI_MARKETS = [
    { key: 'IST', short: 'IST', label: 'India (IST, UTC+5:30)', iana: 'Asia/Kolkata' },
    { key: 'GST', short: 'GST', label: 'UAE (GST, UTC+4:00)', iana: 'Asia/Dubai' },
    { key: 'UK',  short: 'UK',  label: 'UK (GMT/BST)', iana: 'Europe/London' }
  ];
  function marketKeyForBrand(brandName) {
    if (brandName === 'Haldiram UK') return 'UK';
    const tz = BU_TIMEZONE[brandName];
    return tz ? tz.label : 'IST';
  }
  function marketLabel(key, short) {
    const m = TI_MARKETS.find(x => x.key === key);
    return m ? (short ? m.short : m.label) : key;
  }
  const TI_KEYS = { slots: 'sa_ti_slots_v2', weekend: 'sa_ti_weekend_v1' };
  function tiGet(key, fallback) { try { const v = localStorage.getItem(key); if (v) return JSON.parse(v); } catch (e) {} return fallback; }
  function tiSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  // Date-range filter — a period narrows/widens volume and nudges NPS a bit,
  // same convention as the rest of the mock (deterministic, not random).
  const TI_PERIODS = ['Today', 'Yesterday', 'This Week', 'This Month', 'Last 7 Days', 'Last 28 Days', 'Custom'];
  const TI_PERIOD_MULT = { Today: 0.04, Yesterday: 0.035, 'This Week': 0.24, 'This Month': 1, 'Last 7 Days': 0.26, 'Last 28 Days': 1 };
  // Fixed "today" so the module's date math matches the rest of this mock's
  // hardcoded July 2026 dates (e.g. the Voice of Customer feedback dates).
  const TI_TODAY = new Date(2026, 6, 28);
  function tiAddDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function tiFmtDate(d) { return String(d.getDate()).padStart(2, '0') + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getFullYear(); }
  function tiFmtISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function tiPeriodRange(period) {
    const t = TI_TODAY;
    if (period === 'Today') return [t, t];
    if (period === 'Yesterday') { const y = tiAddDays(t, -1); return [y, y]; }
    if (period === 'This Week') { const dow = t.getDay(); const mondayOffset = dow === 0 ? -6 : 1 - dow; return [tiAddDays(t, mondayOffset), t]; }
    if (period === 'Last 7 Days') return [tiAddDays(t, -6), t];
    if (period === 'This Month') return [new Date(t.getFullYear(), t.getMonth(), 1), t];
    if (period === 'Last 28 Days') return [tiAddDays(t, -27), t];
    return [t, t];
  }
  function tiFormatRange(from, to) { return tiFmtDate(from) === tiFmtDate(to) ? tiFmtDate(from) : tiFmtDate(from) + ' - ' + tiFmtDate(to); }
  function tiDaysBetween(fromISO, toISO) {
    if (!fromISO || !toISO) return 28;
    const ms = new Date(toISO + 'T00:00:00') - new Date(fromISO + 'T00:00:00');
    return Math.max(1, Math.round(ms / 86400000) + 1);
  }
  // "Custom" is encoded as the string 'Custom:<days>' so every function that
  // already threads a single `period` string through keeps working unchanged.
  function tiPeriodMult(period) {
    if (period && period.indexOf('Custom:') === 0) { const days = parseInt(period.slice(7), 10) || 28; return Math.max(0.02, Math.min(1.8, days / 28)); }
    return TI_PERIOD_MULT[period] != null ? TI_PERIOD_MULT[period] : 1;
  }
  function tiPeriodDelta(period) {
    if (!period || period === 'This Month' || period === 'Last 28 Days') return 0;
    return Math.round(rng(hash('ti-period|' + period))() * 14 - 7);
  }
  // Generic "resize this aggregate to a different volume/NPS" helper — reused
  // for date-range filtering and for splitting a brand's matrix across the
  // countries/entities it operates in (same math, different callers).
  function tiRescale(agg, mult, npsDelta) {
    const n = Math.max(0, Math.round(agg.n * mult));
    if (!n) return tiEmpty();
    if (!npsDelta) { const f = agg.n ? n / agg.n : 0; return { n, p: Math.round(agg.p * f), pa: Math.round(agg.pa * f), d: Math.round(agg.d * f) }; }
    const baseNps = agg.n ? Math.round((agg.p / agg.n) * 100) - Math.round((agg.d / agg.n) * 100) : 0;
    const nps = Math.max(-100, Math.min(100, baseNps + npsDelta));
    const pr = Math.max(0.02, Math.min(0.98, (nps + 100) / 200));
    const dr = Math.max(0, Math.min(1 - pr, pr - nps / 100));
    const p = Math.round(n * pr), d = Math.round(n * dr), pa = Math.max(0, n - p - d);
    return { n, p, pa, d };
  }
  function tiApplyPeriod(agg, period) {
    return tiRescale(agg, tiPeriodMult(period), tiPeriodDelta(period));
  }

  const tiEmpty = () => ({ n: 0, p: 0, pa: 0, d: 0 });
  const tiSum = list => list.reduce((a, x) => ({ n: a.n + x.n, p: a.p + x.p, pa: a.pa + x.pa, d: a.d + x.d }), tiEmpty());
  const tiNps = a => a.n ? Math.round((a.p / a.n) * 100) - Math.round((a.d / a.n) * 100) : 0;

  // Deterministic invoice-date-hour × day-of-week matrix for one brand.
  // Footfall curve (busier lunch/evening, quieter nights, uplifted weekends)
  // sets volume, rescaled so total matches the brand's real response count.
  // Per-cell NPS varies by hour/weekend (mornings run better, evenings worse)
  // but is calibrated so the volume-weighted average lands on the brand's
  // real NPS — promoter% − detractor% always equals the cell's NPS exactly.
  function buildInvoiceMatrix(b) {
    const rr = rng(hash(b.name + '|invoice'));
    const raw = []; let sum = 0;
    for (let day = 0; day < 7; day++) {
      raw[day] = []; const weekend = day >= 5;
      for (let h = 0; h < 24; h++) {
        let base;
        if (h < 7) base = 0.5; else if (h < 11) base = 6; else if (h < 14) base = 12;
        else if (h < 17) base = 8; else if (h < 21) base = 14; else base = 4;
        if (weekend) base *= 1.3;
        base *= (0.75 + rr() * 0.5);
        raw[day][h] = base; sum += base;
      }
    }
    const scale = sum ? b.responses / sum : 0;
    // Pass 1: volume + a raw (uncalibrated) hour/weekend-biased NPS per cell.
    const n = [], npsRaw = [];
    let weightedSum = 0, totalN = 0;
    for (let day = 0; day < 7; day++) {
      n[day] = []; npsRaw[day] = []; const weekend = day >= 5;
      for (let h = 0; h < 24; h++) {
        const cellN = Math.max(0, Math.round(raw[day][h] * scale));
        const bias = (h < 11 ? 6 : 0) - (h >= 17 && h < 21 ? 6 : 0) - (weekend ? 2 : 0) + Math.round(rr() * 8 - 4);
        n[day][h] = cellN; npsRaw[day][h] = bias;
        weightedSum += bias * cellN; totalN += cellN;
      }
    }
    // Pass 2: shift every cell's NPS by the same offset so the volume-weighted
    // mean bias is exactly zero — i.e. the aggregate reconstructs b.nps.
    const meanBias = totalN ? weightedSum / totalN : 0;
    const m = [];
    for (let day = 0; day < 7; day++) {
      m[day] = [];
      for (let h = 0; h < 24; h++) {
        const cellN = n[day][h];
        const nps = Math.max(-100, Math.min(100, Math.round(b.nps + npsRaw[day][h] - meanBias)));
        const pr = Math.max(0.02, Math.min(0.98, (nps + 100) / 200));
        const dr = Math.max(0, Math.min(1 - pr, pr - nps / 100));
        const p = Math.round(cellN * pr), d = Math.round(cellN * dr), pa = Math.max(0, cellN - p - d);
        m[day][h] = { n: cellN, p, pa, d };
      }
    }
    return m;
  }
  const BRAND_HOURDAY = {};
  BUS.forEach(b => { BRAND_HOURDAY[b.name] = buildInvoiceMatrix(b); });

  // Order type (from the bill's `orderType` field) — Dine-in vs Takeaway.
  // Splits each hour×day cell of a brand's matrix into two sub-cells whose
  // volumes sum back to the parent cell exactly, and whose own volume-
  // weighted NPS lands on a brand-specific target such that combining both
  // order types (weighted by their share) reconstructs the brand's real NPS.
  const TI_ORDER_TYPES = ['Dine-in', 'Takeaway'];
  function calibrateNpsSplit(volumeByCell, targetNps, rr) {
    const npsRaw = []; let weightedSum = 0, totalN = 0;
    for (let day = 0; day < 7; day++) {
      npsRaw[day] = [];
      for (let h = 0; h < 24; h++) {
        const bias = Math.round(rr() * 8 - 4);
        npsRaw[day][h] = bias;
        weightedSum += bias * volumeByCell[day][h]; totalN += volumeByCell[day][h];
      }
    }
    const meanBias = totalN ? weightedSum / totalN : 0;
    const out = [];
    for (let day = 0; day < 7; day++) {
      out[day] = [];
      for (let h = 0; h < 24; h++) {
        const cellN = volumeByCell[day][h];
        const nps = Math.max(-100, Math.min(100, Math.round(targetNps + npsRaw[day][h] - meanBias)));
        const pr = Math.max(0.02, Math.min(0.98, (nps + 100) / 200));
        const dr = Math.max(0, Math.min(1 - pr, pr - nps / 100));
        const p = Math.round(cellN * pr), d = Math.round(cellN * dr), pa = Math.max(0, cellN - p - d);
        out[day][h] = { n: cellN, p, pa, d };
      }
    }
    return out;
  }
  function buildOrderTypeSplit(b, hourday) {
    const rr = rng(hash(b.name + '|ordertype'));
    const dineShareBase = 0.45 + (hmod(b.name, 40) / 100); // ~0.45-0.85, deterministic per brand
    const otNpsDelta = Math.round(rr() * 14 - 7); // Dine-in vs Takeaway target NPS gap
    const dineVol = [], takeVol = [];
    let dineTotalN = 0, takeTotalN = 0;
    for (let day = 0; day < 7; day++) {
      dineVol[day] = []; takeVol[day] = [];
      for (let h = 0; h < 24; h++) {
        const cellN = hourday[day][h].n;
        const isNight = h >= 22 || h < 5; // less dine-in traffic late at night
        const dineShare = Math.max(0.1, Math.min(0.92, dineShareBase - (isNight ? 0.25 : 0)));
        const dineN = Math.round(cellN * dineShare);
        dineVol[day][h] = dineN; takeVol[day][h] = cellN - dineN;
        dineTotalN += dineN; takeTotalN += (cellN - dineN);
      }
    }
    const dineShareOverall = (dineTotalN + takeTotalN) ? dineTotalN / (dineTotalN + takeTotalN) : 0.5;
    const dineTarget = b.nps + otNpsDelta * (1 - dineShareOverall);
    const takeTarget = b.nps - otNpsDelta * dineShareOverall;
    return { 'Dine-in': calibrateNpsSplit(dineVol, dineTarget, rr), 'Takeaway': calibrateNpsSplit(takeVol, takeTarget, rr) };
  }
  const BRAND_HOURDAY_OT = {};
  BUS.forEach(b => { BRAND_HOURDAY_OT[b.name] = buildOrderTypeSplit(b, BRAND_HOURDAY[b.name]); });
  // Resolves a brand's hour×day matrix, optionally restricted to one or more
  // order types. No restriction (or all of them) is byte-identical to the
  // brand's plain BRAND_HOURDAY matrix — existing callers that never pass
  // orderTypes keep working exactly as before.
  function brandMatrixFor(brandName, orderTypes) {
    if (!orderTypes || !orderTypes.length || orderTypes.length >= TI_ORDER_TYPES.length) return BRAND_HOURDAY[brandName] || tiZeroMatrix();
    const mats = orderTypes.map(ot => (BRAND_HOURDAY_OT[brandName] || {})[ot]).filter(Boolean);
    if (!mats.length) return tiZeroMatrix();
    if (mats.length === 1) return mats[0];
    const m = [];
    for (let day = 0; day < 7; day++) { m[day] = []; for (let h = 0; h < 24; h++) m[day][h] = tiSum(mats.map(mm => mm[day][h])); }
    return m;
  }

  // Country-level matrices — each brand's matrix is split across the
  // countries it operates in using the exact same share/NPS numbers the
  // Progressive Drilldown tab shows (via drilldown('NPS',[brand])), so this
  // stays consistent with the rest of the app rather than inventing new data.
  const COUNTRY_CONTRIB = {}; // countryCode -> [{ brand, shareFrac, npsDelta }]
  const BRAND_COUNTRY_CONTRIB = {}; // brand -> [{ country, shareFrac, npsDelta }] (inverse lookup)
  BUS.forEach(b => {
    drilldown('NPS', [b.name]).forEach(row => {
      const shareFrac = b.responses ? row.responses / b.responses : 0;
      const npsDelta = Number(row.value) - b.nps;
      (COUNTRY_CONTRIB[row.name] = COUNTRY_CONTRIB[row.name] || []).push({ brand: b.name, shareFrac, npsDelta });
      (BRAND_COUNTRY_CONTRIB[b.name] = BRAND_COUNTRY_CONTRIB[b.name] || []).push({ country: row.name, shareFrac, npsDelta });
    });
  });
  const COUNTRY_LIST = Object.keys(COUNTRY_CONTRIB);
  const COUNTRY_HOURDAY = {};
  COUNTRY_LIST.forEach(country => {
    const contribs = COUNTRY_CONTRIB[country];
    const m = [];
    for (let day = 0; day < 7; day++) {
      m[day] = [];
      for (let h = 0; h < 24; h++) m[day][h] = tiSum(contribs.map(c => tiRescale(BRAND_HOURDAY[c.brand][day][h], c.shareFrac, c.npsDelta)));
    }
    COUNTRY_HOURDAY[country] = m;
  });

  // Both Brand and Country scope's entity are arrays — multi-select.
  // orderTypes optionally restricts to one or more TI_ORDER_TYPES; omitted
  // (or all of them) is unfiltered — byte-identical to before this existed.
  function tiMatrixFor(scope, entity, orderTypes) {
    if (scope === 'Brand' && entity && entity.length) {
      if (entity.length === 1) return brandMatrixFor(entity[0], orderTypes);
      const mats = entity.map(b => brandMatrixFor(b, orderTypes));
      const m = [];
      for (let day = 0; day < 7; day++) { m[day] = []; for (let h = 0; h < 24; h++) m[day][h] = tiSum(mats.map(mm => mm[day][h])); }
      return m;
    }
    if (scope === 'Country' && entity && entity.length) {
      if (entity.length === 1) return COUNTRY_HOURDAY[entity[0]] || tiZeroMatrix();
      const m = [];
      for (let day = 0; day < 7; day++) { m[day] = []; for (let h = 0; h < 24; h++) m[day][h] = tiSum(entity.map(c => (COUNTRY_HOURDAY[c] || tiZeroMatrix())[day][h])); }
      return m;
    }
    const mats0 = BUS.map(b => brandMatrixFor(b.name, orderTypes));
    const m = [];
    for (let day = 0; day < 7; day++) { m[day] = []; for (let h = 0; h < 24; h++) m[day][h] = tiSum(mats0.map(mm => mm[day][h])); }
    return m;
  }
  function tiZeroMatrix() { const m = []; for (let day = 0; day < 7; day++) { m[day] = []; for (let h = 0; h < 24; h++) m[day][h] = tiEmpty(); } return m; }
  // Which real brands make up the current scope/entity selection — used to
  // tell whether the numbers on screen span more than one local timezone.
  function tiBrandsInScope(scope, entity) {
    if (scope === 'Brand' && entity && entity.length) return entity.slice();
    if (scope === 'Country' && entity && entity.length) {
      const set = new Set();
      entity.forEach(c => (COUNTRY_CONTRIB[c] || []).forEach(x => set.add(x.brand)));
      return Array.from(set);
    }
    return BU_NAMES.slice();
  }
  // Every hour/day bucket ("Lunch", "Weekend", ...) is read in each brand's
  // OWN local time before being combined (see BU_TIMEZONE above) — this just
  // reports which timezone(s) are in play so the UI can tell the user when
  // "Lunch" or "Weekend" is blending more than one local clock.
  function tiTimezoneInfo(scope, entity, date) {
    const brands = tiBrandsInScope(scope, entity);
    const zones = brands.map(b => brandTimezone(b, date));
    const labels = Array.from(new Set(zones.map(tzLabel)));
    return { brands, labels, mixed: labels.length > 1 };
  }
  // Which markets are actually present among the brands currently in scope —
  // used to decide which market-restricted slots are even relevant to show.
  function tiMarketsInScope(scope, entity) {
    return new Set(tiBrandsInScope(scope, entity).map(marketKeyForBrand));
  }
  // A slot with no market restriction applies to everyone (today's default).
  // A market-restricted slot only shows up when at least one brand currently
  // in scope belongs to that market.
  function tiVisibleSlots(slots, scope, entity) {
    const markets = tiMarketsInScope(scope, entity);
    return slots.filter(s => !s.market || markets.has(s.market));
  }
  function tiHoursInSlot(slot) {
    const sh = +slot.start, eh = +slot.end, hrs = [];
    if (eh > sh) { for (let h = sh; h < eh; h++) hrs.push(h); }
    else { for (let h = sh; h < 24; h++) hrs.push(h); for (let h = 0; h < eh; h++) hrs.push(h); }
    return hrs;
  }

  function tiSlotMetrics(slots, scope, entity, period, orderTypes) {
    const scopeBrands = tiBrandsInScope(scope, entity);
    const overallMatrix = tiMatrixFor(scope, entity, orderTypes);
    const visible = tiVisibleSlots(slots, scope, entity);
    return visible.map(slot => {
      // A market-restricted slot only ever aggregates brands in that market
      // (intersected with whatever's already in scope) — never the rest of
      // scope's brands, regardless of what the top-level Scope/Entity says.
      const m = slot.market
        ? tiMatrixFor('Brand', scopeBrands.filter(b => marketKeyForBrand(b) === slot.market), orderTypes)
        : overallMatrix;
      const hrs = tiHoursInSlot(slot);
      const perDay = TI_DOW.map((_, day) => tiApplyPeriod(tiSum(hrs.map(h => m[day][h])), period));
      const total = tiSum(perDay);
      const nps = tiNps(total);
      const prevDelta = Math.round(rng(hash((scope || '') + '|' + (entity || '') + '|' + (period || '') + '|' + slot.id + '|prev'))() * 16 - 8);
      const name = slot.market ? `${slot.name} — ${marketLabel(slot.market, true)}` : slot.name;
      return { id: slot.id, name, start: slot.start, end: slot.end, market: slot.market || null, hours: hrs, perDay, total,
        volume: total.n, nps, lowSample: total.n < TI_MIN_SAMPLE,
        prevNps: Math.max(-100, Math.min(100, nps - prevDelta)), trend: prevDelta,
        detractorPct: total.n ? Math.round((total.d / total.n) * 100) : 0 };
    });
  }
  function tiWeekendDays() { return tiGet(TI_KEYS.weekend, [5, 6]); }
  function tiWeekdayWeekend(slots, scope, entity, period, orderTypes) {
    const wk = tiWeekendDays();
    const metrics = tiSlotMetrics(slots, scope, entity, period, orderTypes);
    let weekday = tiEmpty(), weekend = tiEmpty();
    metrics.forEach(m => m.perDay.forEach((agg, day) => { if (wk.indexOf(day) >= 0) weekend = tiSum([weekend, agg]); else weekday = tiSum([weekday, agg]); }));
    const rr = rng(hash((scope || '') + '|' + (entity || '') + '|' + (period || '') + '|wwtrend'));
    const weeks = ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'].map(w => ({ w, weekday: tiNps(weekday) + Math.round(rr() * 12 - 6), weekend: tiNps(weekend) + Math.round(rr() * 14 - 7) }));
    return {
      weekday: { nps: weekday.n ? tiNps(weekday) : 0, volume: weekday.n, lowSample: weekday.n < TI_MIN_SAMPLE, agg: weekday },
      weekend: { nps: weekend.n ? tiNps(weekend) : 0, volume: weekend.n, lowSample: weekend.n < TI_MIN_SAMPLE, agg: weekend },
      delta: (weekday.n && weekend.n) ? (tiNps(weekend) - tiNps(weekday)) : 0, weekendDays: wk, trend: weeks
    };
  }
  function tiOverview(slots, scope, entity, period, orderTypes) {
    const metrics = tiSlotMetrics(slots, scope, entity, period, orderTypes);
    const valid = metrics.filter(m => !m.lowSample);
    const total = tiSum(metrics.map(m => m.total));
    const best = valid.slice().sort((a, b) => b.nps - a.nps)[0] || null;
    const worst = valid.slice().sort((a, b) => a.nps - b.nps)[0] || null;
    const busiest = metrics.slice().sort((a, b) => b.volume - a.volume)[0] || null;
    return { metrics, total, overallNps: total.n ? tiNps(total) : 0, totalVolume: total.n, best, worst, busiest, slotsConfigured: slots.length };
  }
  // ---- full hierarchical drill: Brand -> Country -> Zone -> State -> City -> Store
  // Every node's time-slot-scoped stats are derived from the SAME per-brand
  // invoice-date matrix, rescaled by that node's real share/NPS (as already
  // shown by the Progressive Drilldown tab via drilldown('NPS', path)), so
  // numbers stay consistent everywhere rather than inventing new data.
  const TI_LEVEL_LABELS = ['Brand', 'Country', 'Zone', 'State', 'City', 'Store'];
  function tiSumBrandHours(brandName, hours, dayIdx, orderTypes) {
    const mat = brandMatrixFor(brandName, orderTypes);
    return dayIdx != null
      ? tiSum(hours.map(h => mat[dayIdx][h]))
      : tiSum(TI_DOW.map((_, d) => tiSum(hours.map(h => mat[d][h]))));
  }
  // sharePath = segments after the brand, e.g. [] for the brand itself,
  // ['AE'] for a country under it, ['AE','Dubai'] for a state, etc.
  function tiNodeAgg(brandName, sharePath, hours, dayIdx, period, orderTypes) {
    const brand = BUS.find(b => b.name === brandName);
    if (!brand) return tiEmpty();
    let shareFrac = 1, nodeNps = brand.nps;
    if (sharePath.length) {
      const parentPath = [brandName].concat(sharePath.slice(0, -1));
      const row = drilldown('NPS', parentPath).find(r => r.name === sharePath[sharePath.length - 1]);
      if (row) { shareFrac = brand.responses ? row.responses / brand.responses : 0; nodeNps = Number(row.value); }
    }
    return tiApplyPeriod(tiRescale(tiSumBrandHours(brandName, hours, dayIdx, orderTypes), shareFrac, nodeNps - brand.nps), period);
  }
  // A country's brand-wise mix (no single drilldown() path covers this
  // virtual root, so it reads COUNTRY_CONTRIB directly). Shared by the
  // single-country root and the second level under a multi-country pick.
  function brandMixInCountry(country, hours, dayIdx, period, orderTypes) {
    return (COUNTRY_CONTRIB[country] || []).map(c => {
      const bm = tiApplyPeriod(tiRescale(tiSumBrandHours(c.brand, hours, dayIdx, orderTypes), c.shareFrac, c.npsDelta), period);
      return { name: c.brand, n: bm.n, nps: bm.n ? tiNps(bm) : 0, lowSample: bm.n < TI_MIN_SAMPLE, path: [c.brand, country], leaf: false };
    }).sort((a, b) => b.nps - a.nps);
  }
  // Children one level below (scope, entity, drillPath). Before a brand is
  // chosen, Country-scope shows a virtual "brand mix within this country"
  // root; everything else is real drilldown() children, time-scoped.
  function tiDrillChildren(scope, entity, drillPath, hours, dayIdx, period, orderTypes) {
    // Multiple countries selected: root breaks down by country (among just
    // the selected ones); picking one continues into that one country's
    // brand-wise mix, then a normal Country -> Zone -> State -> City -> Store walk.
    if (scope === 'Country' && entity && entity.length > 1) {
      if (!drillPath.length) {
        const rows = entity.filter(c => COUNTRY_CONTRIB[c]).map(country => {
          const bm = tiApplyPeriod(tiSum((COUNTRY_CONTRIB[country] || []).map(c => tiRescale(tiSumBrandHours(c.brand, hours, dayIdx, orderTypes), c.shareFrac, c.npsDelta))), period);
          return { name: country, n: bm.n, nps: bm.n ? tiNps(bm) : 0, lowSample: bm.n < TI_MIN_SAMPLE, path: [country], leaf: false };
        }).sort((a, b) => b.nps - a.nps);
        return { level: 'Country', label: 'Country-wise breakdown', rows };
      }
      if (drillPath.length === 1 && COUNTRY_CONTRIB[drillPath[0]]) {
        return { level: 'Brand', label: 'Brand-wise breakdown', rows: brandMixInCountry(drillPath[0], hours, dayIdx, period, orderTypes) };
      }
    }
    if (!drillPath.length && scope === 'Country' && entity && entity.length === 1 && COUNTRY_CONTRIB[entity[0]]) {
      return { level: 'Brand', label: 'Brand-wise breakdown', rows: brandMixInCountry(entity[0], hours, dayIdx, period, orderTypes) };
    }
    // Multiple brands selected: the root shows a brand-wise breakdown among
    // just the selected brands (clicking one continues down its own
    // Country -> Zone -> State -> City -> Store hierarchy as usual).
    if (!drillPath.length && scope === 'Brand' && entity && entity.length > 1) {
      const rows = entity.map(brandName => {
        const bm = tiNodeAgg(brandName, [], hours, dayIdx, period, orderTypes);
        return { name: brandName, n: bm.n, nps: bm.n ? tiNps(bm) : 0, lowSample: bm.n < TI_MIN_SAMPLE, path: [brandName], leaf: false };
      }).sort((a, b) => b.nps - a.nps);
      return { level: 'Brand', label: 'Brand-wise breakdown', rows };
    }
    const basePath = drillPath.length ? drillPath : (scope === 'Brand' && entity && entity.length ? [entity[0]] : []);
    const depth = basePath.length;
    const rows = drilldown('NPS', basePath).map(row => {
      const bm = depth ? tiNodeAgg(basePath[0], basePath.slice(1).concat([row.name]), hours, dayIdx, period, orderTypes)
        : tiNodeAgg(row.name, [], hours, dayIdx, period, orderTypes);
      return { name: row.name, n: bm.n, nps: bm.n ? tiNps(bm) : 0, lowSample: bm.n < TI_MIN_SAMPLE, path: basePath.concat([row.name]), leaf: !canDrill(depth) };
    }).sort((a, b) => b.nps - a.nps);
    const level = TI_LEVEL_LABELS[depth] || 'Store';
    return { level, label: level + '-wise breakdown', rows };
  }
  // Stats for the exact node at (scope, entity, drillPath) — null when it's
  // the un-drilled Overall root, since the slot's own total already covers it.
  function tiDrillNode(scope, entity, drillPath, hours, dayIdx, period, orderTypes) {
    // Multi-country: one country picked from the mix, brand not chosen yet
    // -> drillPath[0] is a country code here, not a brand.
    if (scope === 'Country' && entity && entity.length > 1 && drillPath.length === 1 && COUNTRY_CONTRIB[drillPath[0]]) {
      const parts = COUNTRY_CONTRIB[drillPath[0]].map(c => tiRescale(tiSumBrandHours(c.brand, hours, dayIdx, orderTypes), c.shareFrac, c.npsDelta));
      return tiApplyPeriod(tiSum(parts), period);
    }
    if (drillPath.length) return tiNodeAgg(drillPath[0], drillPath.slice(1), hours, dayIdx, period, orderTypes);
    if (scope === 'Brand' && entity && entity.length) {
      if (entity.length === 1) return tiNodeAgg(entity[0], [], hours, dayIdx, period, orderTypes);
      return tiApplyPeriod(tiSum(entity.map(b => tiSumBrandHours(b, hours, dayIdx, orderTypes))), period);
    }
    if (scope === 'Country' && entity && entity.length > 1) {
      const parts = entity.filter(c => COUNTRY_CONTRIB[c]).reduce((acc, country) => acc.concat(COUNTRY_CONTRIB[country].map(c => tiRescale(tiSumBrandHours(c.brand, hours, dayIdx, orderTypes), c.shareFrac, c.npsDelta))), []);
      return tiApplyPeriod(tiSum(parts), period);
    }
    if (scope === 'Country' && entity && entity.length && COUNTRY_CONTRIB[entity[0]]) {
      const parts = COUNTRY_CONTRIB[entity[0]].map(c => tiRescale(tiSumBrandHours(c.brand, hours, dayIdx, orderTypes), c.shareFrac, c.npsDelta));
      return tiApplyPeriod(tiSum(parts), period);
    }
    return null;
  }
  function tiAggToStats(agg) {
    return { nps: agg.n ? tiNps(agg) : 0, n: agg.n, lowSample: agg.n < TI_MIN_SAMPLE,
      promoter: agg.p, passive: agg.pa, detractor: agg.d,
      promoterPct: agg.n ? Math.round(agg.p / agg.n * 100) : 0, passivePct: agg.n ? Math.round(agg.pa / agg.n * 100) : 0, detractorPct: agg.n ? Math.round(agg.d / agg.n * 100) : 0 };
  }

  // ---- NPS by Order Type — a standalone "Dimension" card, not a time cut --
  // Reuses the exact same generic engine as NPS by Time Slot (tiDrillNode /
  // tiDrillChildren already accept an `orderTypes` filter) with two
  // differences: no hour/day restriction (every hour of every day counts —
  // pass the full 24h range and a null dayIdx, meaning "all days"), and the
  // "bucket" being split on is an order type instead of a slot. Always
  // Brand-scoped: this card's own filter is a brand picker only, no
  // Country/market concepts apply to order type.
  const TI_ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);
  function tiOrderTypeMetrics(entity, period) {
    return TI_ORDER_TYPES.map(ot => {
      const mat = tiMatrixFor('Brand', entity, [ot]);
      const total = tiApplyPeriod(tiSum(TI_DOW.map((_, d) => tiSum(mat[d]))), period);
      const nps = tiNps(total);
      const prevDelta = Math.round(rng(hash('ot|' + entity.join(',') + '|' + period + '|' + ot + '|prev'))() * 16 - 8);
      return { id: ot, name: ot, total, volume: total.n, nps, lowSample: total.n < TI_MIN_SAMPLE,
        prevNps: Math.max(-100, Math.min(100, nps - prevDelta)), trend: prevDelta,
        detractorPct: total.n ? Math.round((total.d / total.n) * 100) : 0 };
    });
  }
  function tiOrderTypeDrilldown(entity, orderType, period) {
    const m = tiOrderTypeMetrics(entity, period).find(x => x.id === orderType);
    if (!m) return null;
    const rootAgg = tiDrillNode('Brand', entity, [], TI_ALL_HOURS, null, period, [orderType]) || m.total;
    return {
      scope: m.name, hours: TI_ALL_HOURS, dayIdx: null, effScope: 'Brand', effEntity: entity,
      node: tiAggToStats(rootAgg),
      children: tiDrillChildren('Brand', entity, [], TI_ALL_HOURS, null, period, [orderType])
    };
  }
  function tiOrderTypeDrillAt(entity, drillPath, orderType, period) {
    const nodeAgg = tiDrillNode('Brand', entity, drillPath, TI_ALL_HOURS, null, period, [orderType]);
    return {
      node: nodeAgg && tiAggToStats(nodeAgg),
      children: tiDrillChildren('Brand', entity, drillPath, TI_ALL_HOURS, null, period, [orderType])
    };
  }

  // Opens a drill session for one slot(+day): resolves the slot/day context
  // once, then returns the root node's stats + first breakdown level. Further
  // clicks call drillAt with the same hours/dayIdx and a growing path.
  function tiDrilldown(slots, scope, entity, period, slotId, dayName) {
    const m = tiSlotMetrics(slots, scope, entity, period).find(x => x.id === slotId);
    if (!m) return null;
    // A market-restricted slot's own number already only reflects its
    // market's brands (see tiSlotMetrics) — the drilldown underneath it must
    // stay consistent with that, not fall back to the full top-level scope.
    const effScope = m.market ? 'Brand' : scope;
    const effEntity = m.market ? tiBrandsInScope(scope, entity).filter(b => marketKeyForBrand(b) === m.market) : entity;
    let agg = m.total, scopeLabel = m.name;
    const dayIdx = dayName ? TI_DOW.indexOf(dayName) : null;
    if (dayName) { agg = m.perDay[dayIdx]; scopeLabel = `${m.name} · ${dayName}`; }
    const rootAgg = tiDrillNode(effScope, effEntity, [], m.hours, dayIdx, period) || agg;
    return {
      scope: scopeLabel, hours: m.hours, dayIdx, effScope, effEntity,
      node: tiAggToStats(rootAgg),
      children: tiDrillChildren(effScope, effEntity, [], m.hours, dayIdx, period)
    };
  }
  // Called as the user clicks deeper into the hierarchy from the drawer.
  function tiDrillAt(scope, entity, drillPath, hours, dayIdx, period) {
    const nodeAgg = tiDrillNode(scope, entity, drillPath, hours, dayIdx, period);
    return {
      node: nodeAgg && tiAggToStats(nodeAgg),
      children: tiDrillChildren(scope, entity, drillPath, hours, dayIdx, period)
    };
  }

  const TimeIntel = {
    MIN_SAMPLE: TI_MIN_SAMPLE, DOW: TI_DOW, DEFAULT_SLOTS: TI_DEFAULT_SLOTS, PERIODS: TI_PERIODS,
    MARKETS: TI_MARKETS, marketKeyForBrand, marketLabel,
    countryList: COUNTRY_LIST.slice(),
    // Defensive migration: any slot persisted before markets were mandatory
    // (market: null, meaning "applies everywhere") is folded into the first
    // real market rather than left in a now-invalid state.
    getSlots: () => tiGet(TI_KEYS.slots, TI_DEFAULT_SLOTS.slice()).map(s => s.market ? s : Object.assign({}, s, { market: TI_MARKETS[0].key })),
    saveSlots: s => tiSet(TI_KEYS.slots, s),
    getWeekendDays: tiWeekendDays,
    saveWeekendDays: arr => tiSet(TI_KEYS.weekend, arr),
    overview: tiOverview, slotMetrics: tiSlotMetrics, visibleSlots: tiVisibleSlots,
    weekdayWeekend: tiWeekdayWeekend, drilldown: tiDrilldown, drillAt: tiDrillAt,
    orderTypes: TI_ORDER_TYPES.slice(), orderTypeMetrics: tiOrderTypeMetrics,
    orderTypeDrilldown: tiOrderTypeDrilldown, orderTypeDrillAt: tiOrderTypeDrillAt,
    periodRange: tiPeriodRange, formatRange: tiFormatRange, daysBetween: tiDaysBetween, fmtISO: tiFmtISO, today: TI_TODAY,
    timezoneInfo: tiTimezoneInfo,
    aggregateAll: function (slots, scope, entity, period) {
      if (!slots || !slots.length) return { empty: true };
      return { overview: tiOverview(slots, scope, entity, period) };
    }
  };

  global.SurveyApi = {
    BAND_COLORS, colorFor, drilldown, levelName, canDrill, aggregate,
    BU_COUNT: BU_NAMES.length,
    sentimentExecutivePulse, sentimentVoiceOfCustomer, improvements, metricsComparison, channelAnalysis,
    brandNames: BU_NAMES.slice(),
    TimeIntel
  };
})(window);
