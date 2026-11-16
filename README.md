# IT Operations Analytics: MOR dashboard (prototype)

An interactive dashboard for the **IT Monthly Operations Review (MOR)** of a managed IT services
client (a hospital or health system). It turns the Convene IT MOR template into a working analytics
product with the same layout and interaction model as the RCM analytics prototype: dark header,
page tabs, a filter pane, KPI cards with target, status and trend, charts you can click to filter,
dense analytical tables, a decomposition tree and "what leadership should know" commentary.

**All data is mock.** "Sample Health System", Hospitals A to E, the clinics, the systems, the people
(shown as roles) and every figure are fictional and not tied to any real hospital, health system,
vendor or person.

## Run

Requires Node.js 20 or later.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload. |
| `npm run build` | Typecheck and production build to `dist/`. |
| `npm run preview` | Serve the production build locally. |

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on pushes to `main` (turn on Pages
with "GitHub Actions" as the source in the repository settings).

## Pages and how they map to the MOR template

| Tab | MOR slides | What it shows |
|---|---|---|
| Executive | 3 (and agenda, 2) | Five headline KPIs (critical system uptime, service levels met, tickets resolved, P1+P2 incidents, open critical issues), this month in brief, key points, decisions required, since last review, measures off target, 12-month trends |
| Qtr & Year | Board / ELT view | Every KPI by quarter (Q1-Q4), year to date vs the same months last year, and a month-by-month heat table for the selected year |
| Financial | CFO view | Managed IT spend vs budget, total IT cost, cost per ticket / user / device, project spend vs plan, service credits, estimated cost of clinical downtime, cumulative spend and run-rate forecast, project budgets |
| Scorecard | 4-5 | All 73 KPIs (operational, executive and financial) with target, with target, prior, current, vs target, status, MoM and 3-month trend, months met (12), 13-month sparkline; filter by area or off-target only |
| Service Desk | 6-7 | Volume by priority, throughput, backlog by age, tickets by site / category / priority (click to filter), site table, SLA and response/resolve times by priority, recurring categories with root cause and fix, decomposition tree |
| Clinical Apps | 8 | EHR and clinical system availability by tier, unplanned/planned downtime, interface errors, system detail |
| Infrastructure | 9 | Uptime by tier, scheduled vs unscheduled downtime, backup, patching, change, capacity, certificate and end-of-life watch |
| Major Incidents | 10, A5 | P1/P2 counts, clinical downtime, response within SLA, corrective actions, full incident log with detail |
| Security | 11 | Incidents, vulnerabilities by severity and age, PHI events, phishing, failed logins, protection coverage table |
| Sites | Tear sheet | Per-site tear sheet vs target, prior and all sites, 12-month trends, other measures, recommended actions, site comparison |
| Projects & Actions | 12-13 | Project portfolio with schedule / scope / budget / overall status, next-month actions, decisions required, next review |
| SLAs & Definitions | A1-A4 | Contract service levels and credits, metric definitions, incident severity, status rules |

## How it works

- **Period** (left pane, and the Executive header): choose the view (Month, Quarter, Year to date,
  Full year, Rolling 12 months), then the **Year**, then the **Month** or **Quarter**. Compare to the
  prior period or the same period last year. Counts and hours add up over the period, rates are
  weighted, coverage and backlog are month-end values, capacity is the peak, and per-month targets
  (incidents, downtime hours) scale to the period length. Mock data runs January 2024 to October 2026.
- **Sidebar** (same sections and order as the RCM analytics product):

  | Section | RCM analytics | IT dashboard |
  |---|---|---|
  | Date | Period type, period, compare to | View (month, quarter, YTD, full year, rolling 12), year, month or quarter, compare to |
  | Organization | Region, facility type, hospital | Region, facility type, site (same regions and facility types; sites follow region and type) |
  | Payer | Payor group, payer | Not used: IT tickets, outages and costs are not billed by payer |
  | Service | Patient type, service line | Patient type and service line of the requesting department (same groupings, plus Non-clinical / Administrative and revenue cycle); applies to ticket measures |
  | Metrics | RCM area | IT area (limits KPIs in the scorecard, quarter and year review and definitions) |
  | This page | Page filters (e.g. denial reason) | Service Desk: priority, ticket category |

  Every bar and table row cross-filters the page; the SLAs & Definitions page lists every dimension and its members. Clicking a bar or table row toggles the matching filter; chips under the page title
  show what is applied. Everything is stored in the URL, so a copied link reopens the same view.
- **Status rules** follow MOR appendix A4: green meets target; amber is inside the amber band, or meets
  target with an unfavorable 3-month trend while close to target; red is outside the amber band or
  missed three months in a row; grey has no target. Status is shown by shape as well as color.
- **Targets** are the Convene defaults from the template and are marked "confirm per contract".
- Every chart and table can be shown as a table, exported to CSV, or opened in focus mode. Pages print
  cleanly to PDF.

## Code map

| Path | Purpose |
|---|---|
| `src/data/model.ts` | The `Dataset` shape every page reads. |
| `src/data/generate.ts` | Mock data generator (fixed seed; same numbers every load). |
| `src/metrics.ts` | Metric catalog (definition, target, amber band, source, owner, compute) and the status / trend engine. |
| `src/state.tsx` | Route, period and filters (in the URL hash). |
| `src/ui/` | Shell (header, tabs, filter pane), KPI cards, charts (ECharts), grid, decomposition tree. |
| `src/pages/` | One file per tab. |

### Connecting real data

Replace `generateDataset()` in `src/App.tsx` with a loader that builds the same `Dataset` from the
source systems named in the metric dictionary (IT service management tool, phone system, monitoring,
backup console, patch and vulnerability tools, SIEM, project register). The metric definitions,
status rules and pages do not need to change.
