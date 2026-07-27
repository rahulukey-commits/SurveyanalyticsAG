# Karnival NPS Analytics — Working Demo

A faithful, self-contained rebuild of the legacy **NPS & Smart Feedback** analytics
screen (9 tabs, ECharts visualisations) from the demo kit + reference docs.
No build step, no backend required — open it and it runs on the §2 seed data.

![Overview](assets/vendor/.preview-placeholder) <!-- screenshot optional -->

## Run it

```bash
cd Analytics
python3 -m http.server 4178
# open http://localhost:4178
```

Or use the bundled launch config (`.claude/launch.json`) with the preview panel.

## What's inside

Section layout was reverse-engineered frame-by-frame from the screen recording (249
frames → contact sheets) so each tab matches the legacy screen section-for-section.

| Tab | Sections |
|---|---|
| **Overview** | NPS Score gauge · NPS Contribution Overview (P/P/D split) · NPS Contribution Trend (line + bars, datazoom) |
| **Channel Analysis** | Channel Overview (status-over-time, bar/line) · Feedback Response Rate → per-channel **Channel / Link / Reminder** metric cards (Email/SMS/WhatsApp) · NPS By Channel (pie/bar) |
| **Insights** | Segmented summary strip (Overall/Detractor/Passive/Promoter) · Rating distribution · Level 01 (bar/pie, 123/%) · Level 02 (category selector) · Additional Questions (word cloud + verbatim table) · Overall Verbatim |
| **Store Analysis** | Store Wise NPS Summary with a working **View selector** (Store / City / Zone / Country — re-groups rows across 9 GCC stores) and **two comparable Time-Period score columns** (each its own dropdown); paginated · Feedback Overview with its own View selector |
| **Area of Improvements** | Per-type sections (Overall/Passive/Detractor) L1+L2 bar/pie · Weekwise L1 & Sub-Category Trend |
| **Appreciations** | Promoter mirror (L1+L2) · Appreciation Trend (multi-series line) |
| **Trend Analysis** | Level 1 Trend · Level 2 Trend · Subcategory Trend · Status Trend funnel |
| **Inbox** | **Master–detail split**: list (Customer · LMR ID · NPS · Status) + Feedback Response pane (Q&A answers, Add note → Submit flips status to Responded); working status filter, mobile search, pagination |
| **Sentiment Analysis** | Score + Trend + distribution pie · Top 5 Aspects Driving Sentiment · word cloud + verbatim table |

## Architecture

```
index.html
  assets/css/styles.css     # Karnival design system (chrome, cards, filters, tables)
  assets/js/mock-api.js     # §4 API payloads + §2 seed → MockApi.get(path, params)
  assets/js/charts.js       # ECharts builders (gauge, trends, bars, pie, funnel, word cloud)
  assets/js/app.js          # shell + 9-tab routing + filters
  assets/vendor/            # echarts + echarts-wordcloud (vendored, offline-safe)
```

`MockApi.get()` mirrors the Angular `nps-analytics-v2.service` 1:1. To go live against
the real backend, swap `mock-api.js` for `fetch()` calls to
`/api/v1/analytics/nps/<path>` — the property names already match the FE bindings.

## Dataset

Modelled on the screen recording: brand **Athlete's Co AG**, campaign
**"Multi-Tier Pilot latest"**. The default date filter is **"Last 28 Days"**
(selected in every date dropdown), and the dataset spans that window
(**04–31 Oct 2025**). A seeded generator in [`mock-api.js`](assets/js/mock-api.js)
produces **28 days of daily data** so every trend/funnel/word-cloud across all 9
tabs is fully populated, with consistent headline aggregates:

- **NPS ≈ 79** · ~87 responses · avg rating 8.9 · promoter-heavy split
- **Sentiment 62.0 (Positive)** · pie ~70% positive
- Retail L1 categories: Store staff, Product, Checkout Experience, Price & Value, Variety / Range, Store Ambience
- **Filling-rate donut rings** (Overview): NPS / LEVEL 1 / LEVEL 2 / Additional Question × Promoter/Passive/Detractor

To change the window, edit `META.start_date` / `end_date` / `date_label` in
`mock-api.js`; the generator rebuilds all series to fit.

## Time Intelligence module (Time-Based NPS Analysis)

A 10th tab, **Time Intelligence**, built natively in this stack (vanilla JS +
ECharts), reusing the shared design-system helpers (`window.NpsUI` — card,
filter bar, selects, toggles, pager) and the ECharts builders — no parallel
component set. Files: [`assets/js/time-intel.js`](assets/js/time-intel.js) (UI),
plus `MockApi.TimeIntel` in [`mock-api.js`](assets/js/mock-api.js) (aggregation)
and heatmap/npsVolume/barCompare/wwTrend builders in [`charts.js`](assets/js/charts.js).

- **Sub-tabs**: Overview · Slot Configuration · Heatmap · Weekday vs Weekend · Peak Insights.
- **One coordinated, debounced filter** (the shared filter bar): scope/entity/channel/
  date/period. Any change triggers a **single** aggregation fetch with a loading
  skeleton, then re-renders every sub-view (no per-chart fetch, no manual refresh).
- **Aggregation** (`MockApi.TimeIntel`, swappable for a real backend): a deterministic
  hour×day response matrix is bucketed into the configured slots; NPS = %Promoters −
  %Detractors per slot, per slot×day cell, and weekday/weekend. **Min sample = 30**
  before showing an NPS (else a “low sample” state).
- **Slot config** persists to `localStorage`; CRUD with validation (no overlap,
  end ≠ start, ≥ 30 min, inline errors), a 24-hour timeline preview, and editing
  re-maps all downstream views. Weekend days are admin-configurable.
- **Visuals**: sortable slot table + card-view toggle with period-over-period trend
  arrows; NPS-vs-volume dual-axis chart; NPS heatmap (color scale + tooltip +
  click-to-drill-down); weekday/weekend KPIs + comparison bar + trend line; derived
  Peak Insight cards; drill-down drawer (NPS, P/P/D, by-day trend, top themes,
  customer comments, store breakdown) — all respecting the active filters.
- **States**: loading, empty (no slots configured), no-data (filters return nothing).
- **Export**: client-side CSV (Excel) of slot performance + Print/PDF (no server
  export pipeline exists in this build).
- **Palette**: uses the brief's purple system (`#7C3AED / #5B21B6 / #F4EFFE`) for the
  module's sub-tabs and accents.

> Note: this repo isn't a git repository, so there's no PR — the module is added in
> place. The aggregation lives behind `MockApi.TimeIntel.*` so a real API can replace
> it without touching the UI.

## Filters re-slice every chart

Every chart card owns an independent filter bar (geo-scope + entity, channel,
date-field, granularity, period). Changing any of them re-renders **that card's
chart** with sliced data via `MockApi.factorFor(state)` (scope/entity share ×
channel share × period multiplier). Trends regenerate from a filter-derived seed
(`MockApi.trendFor`) so they change visibly while staying populated. Dates run on
the current window (last 28 days → 27 May–23 Jun 2026). **NPS By Channel** lives on
the Overview tab. Channel Analysis cards (Email/SMS/WhatsApp × Channel/Link/Reminder)
mirror the video values and filter by channel.

## Interactions (all working)

- **Graph switchers** (bar ↔ pie ↔ line) on every chart that has them — Insights L1, Channel overview & NPS-by-channel, Improvements/Appreciations L1/L2, all Trend charts, Status funnel
- **Value switchers** (123 ↔ %) recompute the chart — counts vs. percentage (column-normalised for trends/weekwise, share-of-total for bars)
- **Geo-scope filter** (the first dropdown: Overall / Store / Zone / City / Country) — picking a non-Overall scope reveals a dependent **Filter** dropdown of entities; selecting one re-scopes the Overview gauge/split/trend to that store/city/zone/country
- **Customer-type filter** lives in Insights as the segment strip (Overall/Detractor/Passive/Promoter) and recomputes Level 01/02
- **Store Analysis**: View selector (Store/City/Zone/Country) re-groups rows; two Time-Period columns recompute scores; pagination
- **Inbox**: row selection drives the detail pane; status filter, mobile search, pagination; Submit adds a note and flips status
- **Datazoom** sliders on all time-series; **pagination** on every table

## Fidelity notes

- **NPS math:** detractor 0–6, passive 7–8, promoter 9–10; NPS = round(prom%) − round(detr%).
  Seed → NPS **20** (5 promoters / 2 passives / 3 detractors over 10 responses).
- **Fixed colours:** promoter `#16A34A`, passive `#FB923C`, detractor `#EF4444`.
- All numbers are internally consistent with the demo-kit seed (per-store, per-channel,
  per-category) so every chart lines up.
