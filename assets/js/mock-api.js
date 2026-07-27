/* ============================================================================
 * Karnival NPS Analytics — Mock API layer (Last 28 Days window)
 * ----------------------------------------------------------------------------
 * Modelled on the screen recording: brand "Athlete's Co AG", campaign
 * "Multi-Tier Pilot latest". The product default date filter is "Last 28 Days",
 * so the dataset spans the most recent 28 days of data (04–31 Oct 2025) and all
 * aggregates scale to that window. A seeded generator keeps every trend/chart
 * across the 9 tabs populated and internally consistent (NPS ≈ 70,
 * Sentiment 62.0 Positive).
 *
 * MockApi.get(path, params) mirrors the Angular nps-analytics-v2.service 1:1;
 * property names match the FE bindings.
 * ========================================================================== */
(function (global) {
  'use strict';

  const META = {
    brand_id: 'athletes_co',
    brand_name: "Athlete's Co AG",
    campaign_name: 'Multi-Tier Pilot latest',
    nps_id: '66a1b2c3d4e5f60000000001',
    rating_question: "How likely are you to recommend Athlete's Co to a friend?",
    timezone: 'Asia/Dubai',
    start_date: '2026-05-27',
    end_date: '2026-06-23',
    date_label: 'Last 28 Days'        // selected by default in every date filter
  };

  // Deterministic PRNG (mulberry32) so reloads are stable.
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---- 28-day calendar ending today (27 May – 23 Jun 2026) ---------------
  const CAL = [];
  for (let d = 27; d <= 31; d++) CAL.push({ day_of_month: d, month: 'MAY', year: 2026 });
  for (let d = 1; d <= 23; d++) CAL.push({ day_of_month: d, month: 'JUNE', year: 2026 });
  const MO_ABBR = { MAY: 'May', JUNE: 'Jun' };
  const dayLabelShort = d => String(d.day_of_month).padStart(2, '0') + ' ' + (MO_ABBR[d.month] || d.month.slice(0, 3));

  // ---- per-day promoter/passive/detractor (NPS ≈ 70) ----------------------
  const r = rng(20251004);
  const DAILY = CAL.map(c => {
    let vol = 1 + Math.floor(r() * 4); // 1–4
    if (r() > 0.8) vol += Math.floor(r() * 4);
    let promoter = 0, passive = 0, detractor = 0;
    for (let k = 0; k < vol; k++) { const x = r(); if (x < 0.80) promoter++; else if (x < 0.90) passive++; else detractor++; }
    const total = promoter + passive + detractor;
    const nps = total ? Math.round((promoter / total) * 100) - Math.round((detractor / total) * 100) : 0;
    return { day_of_month: c.day_of_month, month: c.month, year: c.year, promoter, passive, detractor, total_response: total, nps_score: nps };
  });

  const SUM = DAILY.reduce((a, d) => ({ p: a.p + d.promoter, pa: a.pa + d.passive, de: a.de + d.detractor }), { p: 0, pa: 0, de: 0 });
  const TOTAL = SUM.p + SUM.pa + SUM.de;
  const NPS = Math.round((SUM.p / TOTAL) * 100) - Math.round((SUM.de / TOTAL) * 100);

  // ---- rating distribution (skewed to promoters) -------------------------
  const RATING = { '0': 0, '1': 0, '2': 1, '3': 1, '4': 1, '5': 1, '6': Math.max(1, SUM.de - 5),
    '7': Math.round(SUM.pa * 0.45), '8': SUM.pa - Math.round(SUM.pa * 0.45),
    '9': Math.round(SUM.p * 0.34), '10': SUM.p - Math.round(SUM.p * 0.34) };

  // ---- L1 reason categories (from the video: athletic retailer) ----------
  const L1_W = [['Store staff', 0.40], ['Product', 0.24], ['Store Experience', 0.15], ['Checkout Experience', 0.13], ['Club Apparel', 0.08]];
  const L1_TOTAL = Math.round(TOTAL * 0.72);
  const L1 = {}; let l1acc = 0;
  L1_W.forEach(([k, w], i) => { const v = i === L1_W.length - 1 ? L1_TOTAL - l1acc : Math.round(L1_TOTAL * w); L1[k] = v; l1acc += v; });
  // customer-type split of the L1 responders (segment strip)
  const SEG = { promoter: Math.round(L1_TOTAL * 0.86), passive: Math.round(L1_TOTAL * 0.08) };
  SEG.detractor = L1_TOTAL - SEG.promoter - SEG.passive;

  const SUBCATS = {
    'Store staff': ['Helpfulness', 'Product Knowledge', 'Friendliness'],
    'Product': ['Quality', 'Fit & Sizing', 'Design'],
    'Store Experience': ['Ambience', 'Cleanliness', 'Layout'],
    'Checkout Experience': ['Wait Time', 'Payment Options'],
    'Club Apparel': ['Availability', 'Range']
  };

  // ---- Verbatim corpus (dates within the 28-day window) ------------------
  const VERBATIM = [
    { comment: 'Excellent collection of shoes, staff was very helpful!', date: '2026-06-22', name: 'Aisha Rahman', phone: '+971-5XXXXXX10', email: 'aisha@example.com', rating: 10, store: 'DXB01', sentiment: { label: 'POSITIVE', score: 0.97 }, ticket: null },
    { comment: 'Great variety and the offers were fantastic', date: '2026-06-20', name: 'Omar Saleh', phone: '+971-5XXXXXX22', email: 'omar@example.com', rating: 10, store: 'DXB02', sentiment: { label: 'POSITIVE', score: 0.95 }, ticket: null },
    { comment: 'Loved the new arrivals, will visit again', date: '2026-06-18', name: 'Lena Fischer', phone: '+971-5XXXXXX33', email: 'lena@example.com', rating: 9, store: 'DXB01', sentiment: { label: 'POSITIVE', score: 0.91 }, ticket: null },
    { comment: 'Store staff helped me find the perfect fit', date: '2026-06-16', name: 'Yusuf Khan', phone: '+971-5XXXXXX44', email: 'yusuf@example.com', rating: 10, store: 'AUH01', sentiment: { label: 'POSITIVE', score: 0.93 }, ticket: null },
    { comment: 'Good quality products and friendly team', date: '2026-06-14', name: 'Maria Lopez', phone: '+971-5XXXXXX55', email: 'maria@example.com', rating: 9, store: 'DXB02', sentiment: { label: 'POSITIVE', score: 0.88 }, ticket: null },
    { comment: 'Sunny store, nice layout and great service', date: '2026-06-12', name: 'Hassan Ali', phone: '+971-5XXXXXX66', email: 'hassan@example.com', rating: 10, store: 'SHJ01', sentiment: { label: 'POSITIVE', score: 0.9 }, ticket: null },
    { comment: 'Checkout was a bit slow during the weekend', date: '2026-06-10', name: 'Priya Nair', phone: '+971-5XXXXXX77', email: 'priya@example.com', rating: 8, store: 'DXB01', sentiment: { label: 'NEUTRAL', score: 0.52 }, ticket: null },
    { comment: 'Prices are slightly on the higher side', date: '2026-06-08', name: 'Daniel Weber', phone: '+971-5XXXXXX88', email: 'daniel@example.com', rating: 7, store: 'AUH01', sentiment: { label: 'NEUTRAL', score: 0.48 }, ticket: null },
    { comment: 'Could use more size options for kids', date: '2026-06-05', name: 'Fatima Noor', phone: '+971-5XXXXXX99', email: 'fatima@example.com', rating: 8, store: 'DXB02', sentiment: { label: 'NEUTRAL', score: 0.5 }, ticket: null },
    { comment: 'Waited too long at the billing counter', date: '2026-06-03', name: 'John Mathew', phone: '+971-5XXXXXX12', email: 'john@example.com', rating: 5, store: 'DXB01', sentiment: { label: 'NEGATIVE', score: 0.82 }, ticket: 'TKT-2025-0451' },
    { comment: 'Product quality was disappointing this time', date: '2026-05-30', name: 'Sara Abdullah', phone: '+971-5XXXXXX13', email: 'sara@example.com', rating: 4, store: 'SHJ01', sentiment: { label: 'NEGATIVE', score: 0.86 }, ticket: 'TKT-2025-0448' },
    { comment: 'Staff was not attentive when I needed help', date: '2026-05-28', name: 'Imran Sheikh', phone: '+971-5XXXXXX14', email: 'imran@example.com', rating: 3, store: 'AUH01', sentiment: { label: 'NEGATIVE', score: 0.9 }, ticket: 'TKT-2025-0445',
      note: { posted_by: 'agent_lina', posted_by_name: 'Lina George', posting_time: '2026-05-30 10:20', note: 'Reached out to customer, offered assistance voucher.' } }
  ];
  function toVerbatim(v) { return { comment: v.comment, date: v.date, customer_name: v.name, mobile_no: v.phone, nps_rating: String(v.rating), store_id: v.store, customer_email: v.email, sentiment: v.sentiment, ticket_number: v.ticket }; }

  const WORDCLOUD = { quality: 9, shoes: 8, excellent: 7, service: 6, staff: 6, price: 5, offers: 5, products: 4, looking: 4, great: 4, variety: 3, choices: 3, sunny: 2, assist: 2, customer: 2, fit: 2, store: 3 };

  // ---- Stores across GCC cities / zones / countries ----------------------
  // base = current-window NPS; spread across countries so City/Zone/Country
  // grouping each produce multiple rows (matches the video's view selector).
  const STORE_DEF = [
    { code: 'DXB01', name: "Athlete's Co — Dubai Mall",        city: 'Dubai',       zone: 'Lower Gulf',   country: 'UAE',     base: 78, w: 0.18 },
    { code: 'DXB02', name: "Athlete's Co — Mall of the Emirates", city: 'Dubai',    zone: 'Lower Gulf',   country: 'UAE',     base: 72, w: 0.14 },
    { code: 'AUH01', name: "Athlete's Co — Yas Mall",          city: 'Abu Dhabi',   zone: 'Lower Gulf',   country: 'UAE',     base: 66, w: 0.12 },
    { code: 'SHJ01', name: "Athlete's Co — Sahara Centre",     city: 'Sharjah',     zone: 'Lower Gulf',   country: 'UAE',     base: 58, w: 0.08 },
    { code: 'DOH01', name: "Athlete's Co — Doha Festival City", city: 'Doha',       zone: 'Central Gulf', country: 'Qatar',   base: 81, w: 0.14 },
    { code: 'BAH01', name: "Athlete's Co — City Centre Bahrain", city: 'Manama',    zone: 'Central Gulf', country: 'Bahrain', base: 69, w: 0.09 },
    { code: 'KWT01', name: "Athlete's Co — The Avenues",       city: 'Kuwait City', zone: 'Upper Gulf',   country: 'Kuwait',  base: 63, w: 0.10 },
    { code: 'RUH01', name: "Athlete's Co — Riyadh Park",       city: 'Riyadh',      zone: 'Upper Gulf',   country: 'KSA',     base: 74, w: 0.09 },
    { code: 'MCT01', name: "Athlete's Co — Mall of Oman",      city: 'Muscat',      zone: 'Lower Gulf',   country: 'Oman',    base: 60, w: 0.06 }
  ];
  // Time-period deltas applied on top of each store's base NPS.
  const PERIOD_DELTA = { 'This Month': 4, 'Previous Month': -3, 'Last 7 Days': 7, 'Last 28 Days': 0, 'Last 3 Months': 2, 'Last 6 Months': -1, 'Last 12 Months': 1, 'Custom Date': 2 };
  function clamp(v) { return Math.max(-100, Math.min(100, Math.round(v))); }
  let stAcc = 0;
  const STORES = STORE_DEF.map((s, i) => {
    const resp = i === STORE_DEF.length - 1 ? TOTAL - stAcc : Math.max(1, Math.round(TOTAL * s.w)); stAcc += resp;
    const p = Math.round(resp * (0.74 + (s.base - 60) / 400)), pa = Math.round(resp * 0.12), d = Math.max(0, resp - p - pa);
    const jit = rng(2000 + i * 17)() * 6 - 3; // fixed per-store jitter (deterministic)
    return { code: s.code, name: s.name, city: s.city, zone: s.zone, country: s.country, base: s.base, resp, p, pa, d,
      npsFor: function (period) { return clamp(s.base + (PERIOD_DELTA[period] || 0) + jit); } };
  });

  const PERIODS = ['This Month', 'Previous Month', 'Last 7 Days', 'Last 28 Days', 'Last 3 Months', 'Last 6 Months', 'Last 12 Months', 'Custom Date'];
  const VIEWS = ['Store View', 'City View', 'Zone View', 'Country View'];
  const VIEW_KEY = { 'Store View': 'code', 'City View': 'city', 'Zone View': 'zone', 'Country View': 'country' };

  // Group stores by the selected view and compute response-weighted NPS per period.
  function storeSummary(view, periodA, periodB) {
    view = view || 'Store View'; periodA = periodA || 'Custom Date'; periodB = periodB || 'Previous Month';
    if (view === 'Store View') {
      return { periodA, periodB, rows: STORES.map(s => ({
        name: s.name, code: s.code, sublabel: s.city + ', ' + s.country, responses: s.resp,
        scoreA: s.npsFor(periodA), scoreB: s.npsFor(periodB) })) };
    }
    const key = VIEW_KEY[view];
    const groups = {};
    STORES.forEach(s => { const g = s[key]; (groups[g] = groups[g] || []).push(s); });
    const sublabelFor = { 'City View': g => g[0].country, 'Zone View': g => g.length + ' stores', 'Country View': g => g[0].zone };
    const rows = Object.entries(groups).map(([name, members]) => {
      const resp = members.reduce((a, m) => a + m.resp, 0);
      const wnps = period => clamp(members.reduce((a, m) => a + m.npsFor(period) * m.resp, 0) / resp);
      return { name, sublabel: sublabelFor[view](members), responses: resp, scoreA: wnps(periodA), scoreB: wnps(periodB) };
    }).sort((a, b) => b.responses - a.responses);
    return { periodA, periodB, rows };
  }

  // Feedback-overview table (current window): NPS, responses, most-rated categories.
  function feedbackOverview(view) {
    view = view || 'Store View';
    const topNeg = ['Checkout Wait', 'Pricing', 'Fit & Sizing', 'Availability'];
    const topPos = ['Helpfulness', 'Quality', 'Ambience', 'Range'];
    if (view === 'Store View') {
      return STORES.map((s, i) => ({ name: s.name, sublabel: s.city, nps: s.npsFor('Last 28 Days'), responses: s.resp,
        detractor: s.d ? topNeg[i % topNeg.length] : '—', promoter: s.p ? topPos[i % topPos.length] : '—' }));
    }
    const key = VIEW_KEY[view]; const groups = {};
    STORES.forEach(s => { const g = s[key]; (groups[g] = groups[g] || []).push(s); });
    return Object.entries(groups).map(([name, members], i) => {
      const resp = members.reduce((a, m) => a + m.resp, 0);
      const nps = clamp(members.reduce((a, m) => a + m.npsFor('Last 28 Days') * m.resp, 0) / resp);
      return { name, sublabel: members[0].country, nps, responses: resp, detractor: topNeg[i % topNeg.length], promoter: topPos[i % topPos.length] };
    }).sort((a, b) => b.responses - a.responses);
  }

  const dayKey = d => ({ day_of_month: d.day_of_month, month: d.month, year: d.year });
  function dailySeriesFor(catShare, seed) {
    const rr = rng(seed);
    return DAILY.map(d => ({ day_of_month: d.day_of_month, month: d.month, year: d.year, count: Math.round(d.total_response * catShare * (0.5 + rr())) }));
  }

  // ---- §4 responses -------------------------------------------------------
  const RESPONSES = {
    'nps-graph-v2': {
      rating_question: META.rating_question, average_rating: 8.9, smiley_count: 0,
      nps_score: NPS, promoter_contribution: SUM.p, passive_contribution: SUM.pa, detractor_contribution: SUM.de, total_responses: TOTAL,
      nps_trend: { day_of_month_stat: DAILY, monthly_stats: [{ month: 'JUNE', year: 2026, promoter: SUM.p, passive: SUM.pa, detractor: SUM.de, total_response: TOTAL, nps_score: NPS }] }
    },
    'get-levelBar-overAll-rating': { question: META.rating_question, category_responses: RATING, total_response: TOTAL, start_at_one: false, smiley_count: 0 },
    'nps-level-1-bar': {
      question: 'What was your experience about?',
      category_responses: L1, total_response: L1_TOTAL, segments: SEG,
      next_level_map: { 'Store staff': true, 'Product': true, 'Checkout Experience': true, 'Price & Value': true, 'Variety / Range': true, 'Store Ambience': true },
      sub_cat_map: { 'Store staff': true, 'Product': true, 'Checkout Experience': true, 'Price & Value': true, 'Variety / Range': true, 'Store Ambience': true },
      sub_cat_level_2: SUBCATS, isCategoryLevel2: true
    },
    'channel-wise': { nps_channel_stats: { EMAIL: Math.round(TOTAL * 0.64), WHATSAPP: Math.round(TOTAL * 0.26), SMS: TOTAL - Math.round(TOTAL * 0.64) - Math.round(TOTAL * 0.26) } }
  };

  // ---- derived builders ---------------------------------------------------
  function fillingRings() {
    const SENT = 12200;
    const pctOf = c => ((c / SENT) * 100).toFixed(2);
    const row = (type, cls, rating) => {
      const cells = [
        { label: 'NPS', sub: 'RATING', count: rating },
        { label: 'LEVEL 1', sub: 'LEVEL 1', count: Math.round(rating * 0.84) },
        { label: 'LEVEL 2', sub: 'LEVEL 2', count: Math.round(rating * 0.72) },
        { label: 'Additional Question 1', sub: 'Additional Question 1', count: Math.round(rating * 0.5) }
      ];
      const max = cells[0].count || 1;
      cells.forEach(c => { c.pct = pctOf(c.count); c.fill = Math.round((c.count / max) * 100); });
      return { type, cls, cells };
    };
    return { sent: '12.2K', delivered: '12.1K', responses: TOTAL,
      columns: ['NPS', 'LEVEL 1', 'LEVEL 2', 'Additional Question 1'],
      rows: [row('Promoters', 'promoter', SUM.p), row('Passive', 'passive', SUM.pa + 2), row('Detractor', 'detractor', SUM.de + 1)] };
  }

  function channelOverview() {
    const rr = rng(7788);
    const series = { Sent: [], Delivered: [], Clicked: [], Responded: [], Completed: [] };
    const dates = DAILY.map(dayLabelShort);
    DAILY.forEach(d => {
      const sent = 6 + Math.floor(rr() * 40);
      series.Sent.push(sent);
      series.Delivered.push(sent - Math.floor(rr() * 2));
      series.Clicked.push(Math.round(sent * (0.3 + rr() * 0.2)));
      series.Responded.push(d.total_response);
      series.Completed.push(Math.max(0, d.total_response - (rr() > 0.7 ? 1 : 0)));
    });
    return { dates, series };
  }

  // Per-channel funnel cards (values modelled on the video's Channel Analysis).
  function channelCards() {
    return {
      Email: {
        Channel:  { Sent: 4860, Delivered: 4770, Throttled: 0, Deferred: 0, Dropped: 18, Unsubscribe: 0, 'Reported Spam': 0, Opened: 0, 'Link Click': 234, Responded: 36, 'Response Completed': 10, 'Customer Response Rate': '0.75%' },
        Link:     { Sent: 4860, Delivered: 4770, Throttled: 0, 'Link Click': 234, Responded: 36, 'Response Completed': 10, 'Customer Response Rate': '0.75%' },
        Reminder: { Sent: 1420, Delivered: 1395, Throttled: 0, Opened: 0, 'Link Click': 71, Responded: 9, 'Response Completed': 3, 'Customer Response Rate': '0.65%' }
      },
      SMS: {
        Channel:  { Sent: 1135, Delivered: 1135, Throttled: 0, 'NCPR Rejected': 0, Failed: 0, 'Link Click': 157, Responded: 15, 'Response Completed': 7, 'Customer Response Rate': '1.32%' },
        Link:     { Sent: 1135, Delivered: 1135, Throttled: 0, 'Link Click': 157, Responded: 15, 'Response Completed': 7, 'Customer Response Rate': '1.32%' },
        Reminder: { Sent: 340, Delivered: 338, Throttled: 0, 'Link Click': 44, Responded: 4, 'Response Completed': 2, 'Customer Response Rate': '1.18%' }
      },
      WhatsApp: {
        Channel:  { Sent: 980, Delivered: 974, Throttled: 0, Rejected: 3, Failed: 3, 'Link Click': 286, Responded: 28, 'Response Completed': 18, 'Customer Response Rate': '2.86%' },
        Link:     { Sent: 980, Delivered: 974, Throttled: 0, 'Link Click': 286, Responded: 28, 'Response Completed': 18, 'Customer Response Rate': '2.86%' },
        Reminder: { Sent: 290, Delivered: 289, Throttled: 0, 'Link Click': 73, Responded: 7, 'Response Completed': 5, 'Customer Response Rate': '2.41%' }
      }
    };
  }

  function categoryTrend(cats) {
    const stat = {};
    const seeds = { 'Store staff': 11, 'Product': 22, 'Checkout Experience': 33, 'Price & Value': 44, 'Variety / Range': 55, 'Store Ambience': 66 };
    (cats || Object.keys(L1)).forEach(cat => {
      const share = (L1[cat] || 8) / Math.max(1, TOTAL);
      const dms = dailySeriesFor(share, seeds[cat] || 99).filter(d => d.count > 0);
      const tc = L1[cat] || 8;
      stat[cat] = { total_count: tc, day_of_month_stats: dms, monthly_stats: [{ month: 'MAY', year: 2026, count: Math.round(tc * 0.2) }, { month: 'JUNE', year: 2026, count: Math.round(tc * 0.8) }] };
    });
    return { nps_level_stat: stat, days: CAL.map(dayKey), months: [{ month: 'MAY', year: 2026 }, { month: 'JUNE', year: 2026 }], categories: SUBCATS };
  }

  // Regenerate a category trend from the active filter so every filter change
  // produces a genuinely different (and always populated) trend shape.
  function trendFor(cats, state) {
    state = state || {};
    const f = factorFor(state).factor;
    const amp = Math.max(0.4, Math.min(1.7, f === 1 ? 1 : 0.5 + f));
    let seed = 7; const key = (state.scope || '') + (state.entity || '') + (state.channel || '') + (state.period || '');
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) | 0;
    const stat = {};
    (cats || Object.keys(L1)).forEach((cat, ci) => {
      const base = L1[cat] || 10;
      const rr = rng((seed || 7) + ci * 131 + 17);
      const dms = DAILY.map(d => ({ day_of_month: d.day_of_month, month: d.month, year: d.year, count: Math.round((base / CAL.length) * amp * (rr() * 2.4)) })).filter(x => x.count > 0);
      stat[cat] = { total_count: dms.reduce((a, x) => a + x.count, 0), day_of_month_stats: dms,
        monthly_stats: [{ month: 'MAY', year: 2026, count: Math.round(base * 0.2) }, { month: 'JUNE', year: 2026, count: Math.round(base * 0.8) }] };
    });
    return { nps_level_stat: stat, days: CAL.map(dayKey), months: [{ month: 'MAY', year: 2026 }, { month: 'JUNE', year: 2026 }], categories: SUBCATS };
  }

  function weekwiseTrend(cats) {
    const weeks = ['27 May', '03 Jun', '10 Jun', '17 Jun'];
    const rr = rng(909);
    const series = {};
    (cats || ['Store staff', 'Product', 'Checkout Experience', 'Price & Value']).forEach(cat => {
      const base = L1[cat] || 8;
      series[cat] = weeks.map(() => Math.round((base / 4) * (0.5 + rr() * 1.3) + rr() * 2));
    });
    return { weeks, series };
  }

  function statusTrend() {
    return {
      sent_trend:      { total_count: 12200, monthly_stats: [{ month: 'MAY', year: 2026, count: 2400 }, { month: 'JUNE', year: 2026, count: 9800 }], day_of_month_stats: [] },
      delivered_trend: { total_count: 12100, monthly_stats: [{ month: 'MAY', year: 2026, count: 2380 }, { month: 'JUNE', year: 2026, count: 9720 }], day_of_month_stats: [] },
      clicked_trend:   { total_count: 1080,  monthly_stats: [{ month: 'MAY', year: 2026, count: 210 }, { month: 'JUNE', year: 2026, count: 870 }], day_of_month_stats: [] },
      responded_trend: { total_count: TOTAL, monthly_stats: [{ month: 'MAY', year: 2026, count: Math.round(TOTAL * 0.18) }, { month: 'JUNE', year: 2026, count: TOTAL - Math.round(TOTAL * 0.18) }], day_of_month_stats: [] },
      completed_trend: { total_count: Math.round(TOTAL * 0.82), monthly_stats: [{ month: 'MAY', year: 2026, count: Math.round(TOTAL * 0.15) }, { month: 'JUNE', year: 2026, count: Math.round(TOTAL * 0.67) }], day_of_month_stats: [] },
      days: [], months: [{ month: 'MAY', year: 2026 }, { month: 'JUNE', year: 2026 }]
    };
  }

  function additionalQuestions() {
    return [
      { title: 'Additional Question 1', type: 'Promoter',
        question: "Would you recommend Athlete's Co to your friends & family?",
        responses: SEG.promoter,
        word_cloud_map: { excellent: 6, great: 5, shoes: 5, quality: 4, offers: 4, recommend: 3, friendly: 3, variety: 2 },
        verbatim: VERBATIM.filter(v => v.rating >= 9).map(toVerbatim) },
      { title: 'Additional Question 2', type: 'Overall',
        question: 'What can we improve to make your shopping experience better?',
        responses: Math.round(L1_TOTAL * 0.22),
        word_cloud_map: { checkout: 4, wait: 3, price: 3, sizing: 2, options: 2, billing: 2, slow: 1, range: 1 },
        verbatim: VERBATIM.filter(v => v.rating <= 8).map(toVerbatim) }
    ];
  }

  // Unified filter → {factor, npsDelta} so every chart can re-slice on change.
  // scope/entity (store/city/zone/country share) × channel share × period multiplier.
  const CHANNEL_SHARE = { All: 1, Email: 0.64, WhatsApp: 0.26, SMS: 0.10 };
  const PERIOD_MULT = { 'Last 7 Days': 0.32, 'Last 28 Days': 1, 'This Month': 0.85, 'Previous Month': 0.92, 'Last 3 Months': 1.25, 'Last 6 Months': 1.5, 'Last 12 Months': 1.8, 'Custom Date': 1 };
  function factorFor(state) {
    state = state || {};
    let factor = 1, npsDelta = 0;
    const key = SCOPE_KEY[state.scope];
    if (key && state.entity && state.entity !== 'All') {
      const members = STORES.filter(s => s[key] === state.entity);
      if (members.length) {
        const resp = members.reduce((a, m) => a + m.resp, 0) || 1;
        factor *= resp / TOTAL;
        npsDelta = clamp(members.reduce((a, m) => a + m.npsFor('Last 28 Days') * m.resp, 0) / resp) - NPS;
      }
    }
    factor *= (CHANNEL_SHARE[state.channel] != null ? CHANNEL_SHARE[state.channel] : 1);
    factor *= (PERIOD_MULT[state.period] != null ? PERIOD_MULT[state.period] : 1);
    return { factor, npsDelta };
  }
  function scaleMap(map, factor) { const o = {}; Object.keys(map).forEach(k => { o[k] = Math.max(0, Math.round(map[k] * factor)); }); return o; }

  // Entities available for a given scope (drives the "Filter" dropdown).
  const SCOPE_KEY = { Store: 'code', City: 'city', Zone: 'zone', Country: 'country' };
  function scopeEntities(scope) {
    const key = SCOPE_KEY[scope];
    if (!key) return [];
    if (scope === 'Store') return STORES.map(s => ({ key: s.code, label: s.name + ' (' + s.code + ')' }));
    const seen = []; STORES.forEach(s => { if (!seen.includes(s[key])) seen.push(s[key]); });
    return seen.map(v => ({ key: v, label: v }));
  }

  // Overview gauge/split/trend scoped to Overall / a Store / City / Zone / Country.
  function graphByScope(scope, entity) {
    const base = RESPONSES['nps-graph-v2'];
    const key = SCOPE_KEY[scope];
    if (!key || !entity || entity === 'All') return JSON.parse(JSON.stringify(base));
    const members = STORES.filter(s => s[key] === entity);
    if (!members.length) return JSON.parse(JSON.stringify(base));
    const resp = members.reduce((a, m) => a + m.resp, 0) || 1;
    const p = members.reduce((a, m) => a + m.p, 0), pa = members.reduce((a, m) => a + m.pa, 0), d = members.reduce((a, m) => a + m.d, 0);
    const nps = clamp(members.reduce((a, m) => a + m.npsFor('Last 28 Days') * m.resp, 0) / resp);
    const share = resp / TOTAL;
    const daily = DAILY.map(x => ({ day_of_month: x.day_of_month, month: x.month, year: x.year,
      promoter: Math.round(x.promoter * share), passive: Math.round(x.passive * share), detractor: Math.round(x.detractor * share),
      total_response: Math.round(x.total_response * share), nps_score: x.nps_score }));
    return { rating_question: base.rating_question, average_rating: +(7.4 + nps / 40).toFixed(1), smiley_count: 0,
      nps_score: nps, promoter_contribution: p, passive_contribution: pa, detractor_contribution: d, total_responses: resp,
      nps_trend: { day_of_month_stat: daily, monthly_stats: [] } };
  }

  // Overview gauge/split/trend filtered by customer type.
  function graphByType(type) {
    const base = RESPONSES['nps-graph-v2'];
    if (!type || type === 'Overall') return JSON.parse(JSON.stringify(base));
    const pick = { Promoter: 'promoter', Passive: 'passive', Detractor: 'detractor' }[type];
    const npsVal = { Promoter: 100, Passive: 0, Detractor: -100 }[type];
    const daily = DAILY.map(d => {
      const v = d[pick];
      return { day_of_month: d.day_of_month, month: d.month, year: d.year,
        promoter: type === 'Promoter' ? v : 0, passive: type === 'Passive' ? v : 0, detractor: type === 'Detractor' ? v : 0,
        total_response: v, nps_score: v ? npsVal : 0 };
    });
    const tot = daily.reduce((a, d) => a + d.total_response, 0);
    return { rating_question: base.rating_question,
      average_rating: { Promoter: 9.6, Passive: 7.5, Detractor: 3.8 }[type],
      smiley_count: 0, nps_score: npsVal,
      promoter_contribution: type === 'Promoter' ? tot : 0, passive_contribution: type === 'Passive' ? tot : 0, detractor_contribution: type === 'Detractor' ? tot : 0,
      total_responses: tot, nps_trend: { day_of_month_stat: daily, monthly_stats: [] } };
  }

  // L1 category distribution filtered by customer type (Insights segment filter)
  function level1ByType(type) {
    const totals = { Overall: L1_TOTAL, Promoter: SEG.promoter, Passive: SEG.passive, Detractor: SEG.detractor };
    const t = totals[type] != null ? totals[type] : L1_TOTAL;
    const W = {
      Overall:   { 'Store staff': 0.40, 'Product': 0.24, 'Store Experience': 0.15, 'Checkout Experience': 0.13, 'Club Apparel': 0.08 },
      Promoter:  { 'Store staff': 0.44, 'Product': 0.26, 'Store Experience': 0.14, 'Checkout Experience': 0.08, 'Club Apparel': 0.08 },
      Passive:   { 'Store staff': 0.30, 'Product': 0.22, 'Store Experience': 0.20, 'Checkout Experience': 0.20, 'Club Apparel': 0.08 },
      Detractor: { 'Store staff': 0.18, 'Product': 0.16, 'Store Experience': 0.24, 'Checkout Experience': 0.34, 'Club Apparel': 0.08 }
    };
    const w = W[type] || W.Overall;
    const cr = {}; let acc = 0; const keys = Object.keys(w);
    keys.forEach((k, i) => { const v = i === keys.length - 1 ? t - acc : Math.round(t * w[k]); cr[k] = Math.max(0, v); acc += cr[k]; });
    return { category_responses: cr, total_response: t };
  }

  function sentiment() {
    const vpos = Math.round(TOTAL * 0.46), pos = Math.round(TOTAL * 0.24), neu = Math.round(TOTAL * 0.16), neg = Math.round(TOTAL * 0.09);
    const vneg = Math.max(0, TOTAL - vpos - pos - neu - neg);
    return {
      score: 62.0, label: 'Positive', delta: '+0.00',
      distribution: { 'Very Negative': vneg, 'Negative': neg, 'Neutral': neu, 'Positive': pos, 'Very Positive': vpos },
      trend: (function () {
        const rr = rng(6262);
        return { byWeek: ['27 May', '03 Jun', '10 Jun', '17 Jun'].map(w => ({ w, score: 50 + Math.round(rr() * 30), pos: 6 + Math.round(rr() * 10), neu: 1 + Math.round(rr() * 4), neg: Math.round(rr() * 3) })) };
      })(),
      negative_aspects: [{ aspect: 'Checkout Wait', count: 8 }, { aspect: 'Pricing', count: 5 }, { aspect: 'Fit & Sizing', count: 3 }],
      positive_aspects: [{ aspect: 'Store staff', count: 40 }, { aspect: 'Product Quality', count: 28 }, { aspect: 'Offers & Discounts', count: 15 }, { aspect: 'Variety', count: 9 }],
      word_cloud_map: WORDCLOUD,
      verbatim: VERBATIM.filter(v => v.sentiment).map(toVerbatim)
    };
  }

  function buildVerbatim() { return { total: VERBATIM.length, word_cloud_map: WORDCLOUD, customer_verbatim: VERBATIM.map(toVerbatim) }; }

  function buildStoreSummary() {
    return { total_responses: TOTAL, nps_over_view: { responses: TOTAL, rated_response: {} },
      contents: STORES.map(s => ({ store_code: s.code, store_name: s.name, store_city: s.city, store_state: s.state, store_zone: s.zone, store_country: s.country,
        nps_score: s.nps, promoter_count: s.p, passive_count: s.pa, detractor_count: s.d, rated_response: {} })) };
  }

  const L1_KEYS = Object.keys(L1);
  function buildInbox(pageNo, pageSize, noteType) {
    const rows = [];
    const n = 24;
    for (let i = 0; i < n; i++) {
      const v = VERBATIM[i % VERBATIM.length];
      const d = DAILY[(i * 3) % DAILY.length];
      const responded = i % 4 === 0; // most un-responded
      const loved = L1_KEYS[i % L1_KEYS.length];
      rows.push({
        feedback_id: '66510000000000000000' + String(1000 + i),
        feedback_name: META.campaign_name, customer_name: v.name,
        nps: String(v.rating),
        submission_date: `${String(d.day_of_month).padStart(2, '0')} ${MO_ABBR[d.month] || d.month.slice(0, 3)} 2026`,
        submission_time: `2026-${d.month === 'MAY' ? '05' : '06'}-${String(d.day_of_month).padStart(2, '0')} ${10 + (i % 9)}:${(i * 7) % 60 < 10 ? '0' : ''}${(i * 7) % 60}`,
        customer_ph_no: v.phone, store_id: '3' + String(2000 + (i * 53) % 9000), lmr_id: v.store,
        status: responded ? 'Responded' : 'Un-responded',
        is_raised_ticket: !!v.ticket,
        answers: [
          { question: 'Based on your shopping experience, how likely are you to recommend us to your friends & relatives?', answer: v.rating },
          { question: 'What is the one thing that you loved the most?', answer: loved }
        ],
        comment: v.comment,
        feedback_notes: v.note ? [v.note] : []
      });
    }
    const filtered = noteType && noteType !== 'All' ? rows.filter(r => r.status === noteType) : rows;
    const start = pageNo * pageSize;
    return { total: filtered.length, auditing: filtered.slice(start, start + pageSize) };
  }

  // ===========================================================================
  // TIME INTELLIGENCE — time-of-day / day-of-week NPS aggregation
  // Swappable client-side "API": a real backend can replace TimeIntel.* later
  // with endpoints that accept (slots, filterPayload) and return these shapes.
  // ===========================================================================
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // index 0..6
  const MIN_SAMPLE = 30;

  // Deterministic hour×day response matrix: HOURDAY[day][hour] = {n,p,pa,d}
  const HOURDAY = (function () {
    const rr = rng(424242); const m = [];
    for (let day = 0; day < 7; day++) {
      m[day] = []; const weekend = day >= 5;
      for (let h = 0; h < 24; h++) {
        let base; // footfall curve
        if (h < 7) base = 0.6; else if (h < 11) base = 7; else if (h < 14) base = 13;
        else if (h < 17) base = 9; else if (h < 21) base = 15; else base = 5;
        if (weekend) base *= 1.35;
        const n = Math.max(0, Math.round(base * (0.7 + rr() * 0.7) * 3)); // ~ thousands over window
        let pr = 0.64 + (h < 11 ? 0.12 : 0) - (h >= 17 && h < 21 ? 0.13 : 0) - (weekend ? 0.04 : 0) + (rr() * 0.08 - 0.04);
        pr = Math.max(0.32, Math.min(0.86, pr));
        let dr = 0.12 - (h < 11 ? 0.05 : 0) + (h >= 17 && h < 21 ? 0.07 : 0) + (rr() * 0.05 - 0.025);
        dr = Math.max(0.03, dr);
        const p = Math.round(n * pr), d = Math.round(n * dr), pa = Math.max(0, n - p - d);
        m[day][h] = { n, p, pa, d };
      }
    }
    return m;
  })();

  const TI_KEY = { slots: 'ti_slots_v1', weekend: 'ti_weekend_v1' };
  const DEFAULT_SLOTS = [
    { id: 's1', name: 'Early Morning', start: '06:00', end: '09:00' },
    { id: 's2', name: 'Late Morning', start: '09:00', end: '12:00' },
    { id: 's3', name: 'Lunch', start: '12:00', end: '15:00' },
    { id: 's4', name: 'Afternoon', start: '15:00', end: '17:00' },
    { id: 's5', name: 'Evening', start: '17:00', end: '21:00' },
    { id: 's6', name: 'Night', start: '21:00', end: '06:00' }
  ];
  function tiGet(key, fallback) { try { const v = localStorage.getItem(key); if (v) return JSON.parse(v); } catch (e) {} return fallback; }
  function tiSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  const emptyAgg = () => ({ n: 0, p: 0, pa: 0, d: 0 });
  const sumAggs = list => list.reduce((a, x) => ({ n: a.n + x.n, p: a.p + x.p, pa: a.pa + x.pa, d: a.d + x.d }), emptyAgg());
  const scaleAgg = (a, f) => ({ n: Math.round(a.n * f), p: Math.round(a.p * f), pa: Math.round(a.pa * f), d: Math.round(a.d * f) });
  const npsOf = a => a.n ? Math.round((a.p / a.n) * 100) - Math.round((a.d / a.n) * 100) : 0;
  function hoursInSlot(slot) {
    const sh = parseInt(slot.start, 10), eh = parseInt(slot.end, 10), hrs = [];
    if (eh > sh) { for (let h = sh; h < eh; h++) hrs.push(h); }
    else { for (let h = sh; h < 24; h++) hrs.push(h); for (let h = 0; h < eh; h++) hrs.push(h); } // wraps past midnight
    return hrs;
  }

  function tiSlotMetrics(slots, state) {
    const fr = factorFor(state || {});
    const f = fr.factor, dN = fr.npsDelta;
    return slots.map((slot, i) => {
      const hrs = hoursInSlot(slot);
      const perDay = DOW.map((_, day) => scaleAgg(sumAggs(hrs.map(h => HOURDAY[day][h])), f));
      const total = sumAggs(perDay);
      const nps = total.n ? Math.max(-100, Math.min(100, npsOf(total) + Math.round(dN))) : 0;
      const prevDelta = (rng(900 + i * 37)() * 16 - 8); // deterministic period-over-period delta
      return {
        id: slot.id, name: slot.name, start: slot.start, end: slot.end, hours: hrs,
        perDay, total, volume: total.n, nps, lowSample: total.n < MIN_SAMPLE,
        prevNps: Math.max(-100, Math.min(100, Math.round(nps - prevDelta))), trend: Math.round(prevDelta),
        detractorPct: total.n ? Math.round((total.d / total.n) * 100) : 0
      };
    });
  }

  function tiHeatmap(slots, state) {
    const metrics = tiSlotMetrics(slots, state);
    return metrics.map(m => ({
      id: m.id, name: m.name,
      cells: m.perDay.map((agg, day) => ({ day: DOW[day], nps: agg.n ? npsOf(agg) : null, n: agg.n, agg, lowSample: agg.n < MIN_SAMPLE }))
    }));
  }

  function tiWeekendDays() { return tiGet(TI_KEY.weekend, [5, 6]); }
  function tiWeekdayWeekend(slots, state) {
    const wk = tiWeekendDays();
    const metrics = tiSlotMetrics(slots, state);
    let weekday = emptyAgg(), weekend = emptyAgg();
    metrics.forEach(m => m.perDay.forEach((agg, day) => { (wk.indexOf(day) >= 0 ? (weekend = sumAggs([weekend, agg])) : (weekday = sumAggs([weekday, agg]))); }));
    // weekly trend over the window (deterministic)
    const rr = rng(7373);
    const weeks = ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'].map(w => ({ w, weekday: npsOf(weekday) + Math.round(rr() * 12 - 6), weekend: npsOf(weekend) + Math.round(rr() * 14 - 7) }));
    return {
      weekday: { nps: weekday.n ? npsOf(weekday) : 0, volume: weekday.n, lowSample: weekday.n < MIN_SAMPLE, agg: weekday },
      weekend: { nps: weekend.n ? npsOf(weekend) : 0, volume: weekend.n, lowSample: weekend.n < MIN_SAMPLE, agg: weekend },
      delta: (weekday.n && weekend.n) ? (npsOf(weekend) - npsOf(weekday)) : 0,
      weekendDays: wk, trend: weeks
    };
  }

  function tiOverview(slots, state) {
    const metrics = tiSlotMetrics(slots, state);
    const valid = metrics.filter(m => !m.lowSample);
    const total = sumAggs(metrics.map(m => m.total));
    const best = valid.slice().sort((a, b) => b.nps - a.nps)[0] || null;
    const worst = valid.slice().sort((a, b) => a.nps - b.nps)[0] || null;
    const busiest = metrics.slice().sort((a, b) => b.volume - a.volume)[0] || null;
    return {
      metrics, total, overallNps: total.n ? npsOf(total) : 0, totalVolume: total.n,
      best, worst, busiest, slotsConfigured: slots.length
    };
  }

  function tiPeakInsights(slots, state) {
    const ov = tiOverview(slots, state);
    const ww = tiWeekdayWeekend(slots, state);
    const m = ov.metrics.filter(x => !x.lowSample);
    const insights = [];
    if (ov.best) insights.push({ kind: 'positive', icon: '🏆', title: 'Best performing slot', body: `${ov.best.name} (${ov.best.start}–${ov.best.end}) leads with an NPS of ${ov.best.nps} across ${ov.best.volume.toLocaleString()} responses.` });
    if (ov.worst && ov.worst.id !== (ov.best && ov.best.id)) insights.push({ kind: 'negative', icon: '⚠️', title: 'Lowest performing slot', body: `${ov.worst.name} (${ov.worst.start}–${ov.worst.end}) is weakest at NPS ${ov.worst.nps} — investigate staffing/wait times.` });
    const topDetr = m.slice().sort((a, b) => b.detractorPct - a.detractorPct)[0];
    if (topDetr) insights.push({ kind: 'negative', icon: '🔻', title: 'Detractor concentration', body: `${topDetr.detractorPct}% of ${topDetr.name} responses are detractors — the highest of any slot.` });
    if (ww.weekday.n !== 0 || ww.weekend.n !== 0) {
      const dir = ww.delta >= 0 ? 'higher' : 'lower';
      insights.push({ kind: ww.delta >= 0 ? 'positive' : 'negative', icon: '📅', title: 'Weekend variance', body: `Weekend NPS (${ww.weekend.nps}) is ${Math.abs(ww.delta)} points ${dir} than weekday (${ww.weekday.nps}).` });
    }
    const bigDrop = m.slice().sort((a, b) => a.trend - b.trend)[0];
    if (bigDrop && bigDrop.trend <= -4) insights.push({ kind: 'negative', icon: '📉', title: 'Significant period-over-period drop', body: `${bigDrop.name} fell ${Math.abs(bigDrop.trend)} points vs the prior period (NPS ${bigDrop.prevNps} → ${bigDrop.nps}).` });
    if (ov.busiest) insights.push({ kind: 'neutral', icon: '👥', title: 'Busiest slot', body: `${ov.busiest.name} drives the most volume (${ov.busiest.volume.toLocaleString()} responses, NPS ${ov.busiest.nps}).` });
    return insights;
  }

  // Drill-down for a slot (optionally a single day cell)
  function tiDrilldown(slots, state, slotId, dayName) {
    const m = tiSlotMetrics(slots, state).find(x => x.id === slotId);
    if (!m) return null;
    let agg = m.total, scope = m.name;
    if (dayName) { const di = DOW.indexOf(dayName); agg = m.perDay[di]; scope = `${m.name} · ${dayName}`; }
    const rr = rng(1234 + slotId.charCodeAt(slotId.length - 1) + (dayName ? DOW.indexOf(dayName) : 0));
    const themes = [{ theme: 'Wait time', pct: 22 + Math.round(rr() * 10) }, { theme: 'Staff helpfulness', pct: 18 + Math.round(rr() * 8) }, { theme: 'Product quality', pct: 14 + Math.round(rr() * 8) }, { theme: 'Pricing', pct: 9 + Math.round(rr() * 6) }];
    const comments = VERBATIM.slice(0, 4).map(v => ({ comment: v.comment, rating: v.rating, name: v.name, sentiment: v.sentiment }));
    const storeBreakdown = STORES.slice(0, 6).map((s, i) => {
      const share = [0.22, 0.2, 0.16, 0.14, 0.16, 0.12][i] || 0.1;
      const n = Math.round(agg.n * share);
      return { store: s.name, code: s.code, n, nps: Math.max(-100, Math.min(100, s.npsFor('Last 28 Days'))) };
    });
    return {
      scope, nps: agg.n ? npsOf(agg) : 0, n: agg.n, lowSample: agg.n < MIN_SAMPLE,
      promoter: agg.p, passive: agg.pa, detractor: agg.d,
      promoterPct: agg.n ? Math.round(agg.p / agg.n * 100) : 0, passivePct: agg.n ? Math.round(agg.pa / agg.n * 100) : 0, detractorPct: agg.n ? Math.round(agg.d / agg.n * 100) : 0,
      trend: m.perDay.map((a, di) => ({ day: DOW[di], nps: a.n ? npsOf(a) : 0 })),
      themes, comments, storeBreakdown
    };
  }

  const TimeIntel = {
    MIN_SAMPLE, DOW, DEFAULT_SLOTS,
    getSlots: () => tiGet(TI_KEY.slots, DEFAULT_SLOTS.slice()),
    saveSlots: s => tiSet(TI_KEY.slots, s),
    getWeekendDays: tiWeekendDays,
    saveWeekendDays: arr => tiSet(TI_KEY.weekend, arr),
    overview: tiOverview, slotMetrics: tiSlotMetrics, heatmap: tiHeatmap,
    weekdayWeekend: tiWeekdayWeekend, peakInsights: tiPeakInsights, drilldown: tiDrilldown,
    // single coordinated fetch for the whole module (debounced caller)
    aggregateAll: function (slots, state) {
      if (!slots || !slots.length) return { empty: true };
      return { overview: tiOverview(slots, state), heatmap: tiHeatmap(slots, state), weekdayWeekend: tiWeekdayWeekend(slots, state), peakInsights: tiPeakInsights(slots, state) };
    }
  };

  const MockApi = {
    VERSION: 'jit-deterministic-v2',
    META, PERIODS, VIEWS, TimeIntel,
    fillingRings, channelOverview, channelCards, categoryTrend, trendFor, weekwiseTrend, additionalQuestions, sentiment,
    storeSummary, feedbackOverview, level1ByType, graphByType, graphByScope, scopeEntities, factorFor, scaleMap,
    get: function (path, params) {
      params = params || {};
      if (path === 'customer-verbatim' || path === 'get-overAll-verbatim') return Promise.resolve(buildVerbatim());
      if (path === 'nps-inboxes') return Promise.resolve(buildInbox(+params.pageNo || 0, +params.pageSize || 10, params.noteType));
      if (path === 'trend-level-1') return Promise.resolve(categoryTrend(['Store staff', 'Product', 'Checkout Experience', 'Price & Value']));
      if (path === 'get-status-trend') return Promise.resolve(statusTrend());
      const payload = RESPONSES[path];
      return Promise.resolve(payload ? JSON.parse(JSON.stringify(payload)) : null);
    }
  };

  global.MockApi = MockApi;
})(window);
