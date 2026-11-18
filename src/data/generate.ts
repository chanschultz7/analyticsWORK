// Synthetic MOR dataset. Fixed seed: the same numbers on every load.
//
// ALL DATA IS MOCK. The health system, sites, systems, people and figures are placeholders and are
// not tied to any real hospital, health system, vendor or person. Owners are shown as roles.
//
// The mock client is a rural health system: one regional hub hospital, four community hospitals,
// six critical access hospitals and a rural health clinic network, spread across five U.S. regions
// with the most sites in the Southeast. Volumes, costs and counts are sized for about 3,900 users.
//
// The generator plants a story for the latest month (October 2026) so every page has something to
// say: an EHR P1 outage at the hub (Hospital A), a printing spike at Hospital B after a print-server
// migration, backup failures at Hospital C, rural carrier outages at critical access sites, a
// phishing click rate above target, and a certificate inside 14 days.

import type {
  Category, ClinicalSystem, Dataset, FinMonth, Incident, ServiceLine, InfraMonth, Month, Pri, SecMonth, Site, SiteMonth, SystemMonth, TicketFact,
} from './model';
import { PRIORITIES } from './model';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const N_MONTHS = 34;
const START_YEAR = 2024;
const START_MONTH = 0; // January 2024 (0-based): full 2024 and 2025, 2026 through October

function buildMonths(): Month[] {
  return Array.from({ length: N_MONTHS }, (_, mi) => {
    const abs = START_YEAR * 12 + START_MONTH + mi;
    const year = Math.floor(abs / 12);
    const month = abs % 12;
    const days = new Date(year, month + 1, 0).getDate();
    return { mi, key: `${year}-${String(month + 1).padStart(2, '0')}`, label: `${MONTH_NAMES[month]} ${year}`, short: `${MONTH_NAMES[month].slice(0, 3)} ${String(year).slice(2)}`, year, month, days };
  });
}

/** 12 mock sites (not real hospitals). Weight = share of users, which drives ticket volume. */
const SITES: Site[] = [
  { key: 0, code: 'HA', region: 0, facilityType: 0, name: 'Hospital A, Regional Hub (TN)', short: 'Hospital A', beds: 168, users: 1150, devices: 1500, lead: 'Site IT Lead, Hospital A', ehr: 'EHR (shared instance)', weight: 0.2953 },
  { key: 1, code: 'HB', region: 0, facilityType: 1, name: 'Hospital B, Community (GA)', short: 'Hospital B', beds: 72, users: 420, devices: 560, lead: 'Site IT Lead, Hospital B', ehr: 'EHR (shared instance)', weight: 0.1078 },
  { key: 2, code: 'HC', region: 0, facilityType: 1, name: 'Hospital C, Community (AL)', short: 'Hospital C', beds: 58, users: 360, devices: 480, lead: 'Site IT Lead, Hospital C', ehr: 'EHR (shared instance)', weight: 0.0924 },
  { key: 3, code: 'HD', region: 0, facilityType: 2, name: 'Hospital D, Critical Access (MS)', short: 'Hospital D', beds: 25, users: 150, devices: 210, lead: 'Site IT Lead, Hospital D', ehr: 'EHR (shared instance)', weight: 0.0385 },
  { key: 4, code: 'HE', region: 0, facilityType: 2, name: 'Hospital E, Critical Access (KY)', short: 'Hospital E', beds: 25, users: 140, devices: 200, lead: 'Site IT Lead, Hospital E', ehr: 'EHR (shared instance)', weight: 0.0359 },
  { key: 5, code: 'HF', region: 1, facilityType: 1, name: 'Hospital F, Community (TX)', short: 'Hospital F', beds: 64, users: 380, devices: 520, lead: 'Site IT Lead, Hospital F', ehr: 'EHR (shared instance)', weight: 0.0976 },
  { key: 6, code: 'HG', region: 1, facilityType: 2, name: 'Hospital G, Critical Access (NM)', short: 'Hospital G', beds: 22, users: 120, devices: 170, lead: 'Site IT Lead, Hospital G', ehr: 'EHR (shared instance)', weight: 0.0308 },
  { key: 7, code: 'HH', region: 2, facilityType: 1, name: 'Hospital H, Community (MO)', short: 'Hospital H', beds: 49, users: 320, devices: 430, lead: 'Site IT Lead, Hospital H', ehr: 'EHR (shared instance)', weight: 0.0822 },
  { key: 8, code: 'HI', region: 2, facilityType: 2, name: 'Hospital I, Critical Access (IA)', short: 'Hospital I', beds: 25, users: 130, devices: 190, lead: 'Site IT Lead, Hospital I', ehr: 'EHR (shared instance)', weight: 0.0334 },
  { key: 9, code: 'HJ', region: 3, facilityType: 2, name: 'Hospital J, Critical Access (MT)', short: 'Hospital J', beds: 20, users: 110, devices: 160, lead: 'Site IT Lead, Hospital J', ehr: 'EHR (shared instance)', weight: 0.0282 },
  { key: 10, code: 'RC', region: 3, facilityType: 3, name: 'Rural Health Clinics (9 locations, ID and WY)', short: 'Rural Clinics', beds: 0, users: 480, devices: 690, lead: 'Site IT Lead, Rural Clinics', ehr: 'EHR (shared instance)', weight: 0.1232 },
  { key: 11, code: 'HL', region: 4, facilityType: 2, name: 'Hospital L, Critical Access (ME)', short: 'Hospital L', beds: 25, users: 135, devices: 190, lead: 'Site IT Lead, Hospital L', ehr: 'EHR (shared instance)', weight: 0.0347 },
];

const ALL_SITES = SITES.map((x) => x.key);
const IS_CAH = (k: number) => SITES[k].facilityType === 2;

const CATEGORIES: Category[] = [
  { key: 0, name: 'Password and account access', rootCause: 'Password expiry every 90 days; self-service reset adoption at 41%', fix: 'Promote self-service reset at sign-in; Service Desk Manager; Dec 15' },
  { key: 1, name: 'EHR access and workflow', rootCause: 'New-hire role templates missing two security classes', fix: 'Correct role templates with HR feed; Clinical Apps Lead; Nov 30' },
  { key: 2, name: 'Printing', rootCause: 'Print-server migration at Hospital B left 38 queues mapped to the old server', fix: 'Remap queues by GPO and retire old server; Infrastructure Lead; Nov 20' },
  { key: 3, name: 'Workstation and hardware', rootCause: 'Aging thin clients in nursing units (5+ years)', fix: 'Replace 90 units under refresh project; Field Services Lead; Jan 31' },
  { key: 4, name: 'Single sign-on and badge tap', rootCause: 'Badge reader firmware drift after Windows update', fix: 'Pin firmware version and add to patch baseline; Endpoint Lead; Nov 25' },
  { key: 5, name: 'Network and Wi-Fi', rootCause: 'Rural carrier circuit drops at critical access sites; Wi-Fi gaps on two hub floors', fix: 'Add LTE backup circuits; Network Lead; Dec 10' },
  { key: 6, name: 'Email and calendar', rootCause: 'Mailbox quota warnings after retention change', fix: 'Raise quota for clinical managers; Messaging Lead; Nov 18' },
  { key: 7, name: 'Software install and request', rootCause: 'Manual approval step for standard software', fix: 'Pre-approve 30 standard titles in the catalog; Service Desk Manager; Dec 31' },
  { key: 8, name: 'Clinical device integration', rootCause: 'Vitals monitors dropping interface after network change', fix: 'Vendor patch scheduled; Clinical Apps Lead; Dec 5' },
  { key: 9, name: 'Telephony and mobile', rootCause: 'Unit phone battery wear', fix: 'Battery swap program; Field Services Lead; Dec 20' },
];
/** U.S. regions; facility type, patient type and service line groupings as in the RCM analytics product. */
const REGIONS = ['Southeast', 'Southwest', 'Midwest', 'Mountain West', 'Northeast'];
const FACILITY_TYPES = ['Regional Referral', 'Community', 'Critical Access', 'Rural Health Clinic'];
const PATIENT_TYPES = ['Inpatient', 'Emergency', 'Outpatient', 'Non-clinical'];
const SERVICE_LINES: ServiceLine[] = [
  { key: 0, name: 'Medical / Surgical', patientType: 0 }, { key: 1, name: 'Obstetrics', patientType: 0 },
  { key: 2, name: 'Emergency', patientType: 1 },
  { key: 3, name: 'Outpatient Surgery', patientType: 2 }, { key: 4, name: 'Imaging', patientType: 2 }, { key: 5, name: 'Laboratory', patientType: 2 },
  { key: 6, name: 'Therapy', patientType: 2 }, { key: 7, name: 'Clinic', patientType: 2 },
  { key: 8, name: 'Administrative and revenue cycle', patientType: 3 },
];
/** Share of tickets by service line: hospitals vs the ambulatory clinics. */
const SVC_MIX_HOSPITAL = [0.27, 0.06, 0.13, 0.06, 0.07, 0.06, 0.04, 0.05, 0.26];
const SVC_MIX_CLINIC = [0, 0, 0, 0.02, 0.06, 0.05, 0.07, 0.56, 0.24];
/** Critical access hospitals: small inpatient units, ED-heavy, rural health clinic attached. */
const SVC_MIX_CAH = [0.2, 0.02, 0.2, 0.02, 0.07, 0.07, 0.05, 0.12, 0.25];
/** Category leans by service line (e.g. device integration in inpatient and ED, printing everywhere). */
function svcCatWeight(svc: number, cat: number) {
  if (cat === 8) return svc <= 2 ? 2.2 : svc === 8 ? 0.1 : 0.6; // clinical device integration
  if (cat === 1) return svc === 8 ? 0.5 : 1.15; // EHR access and workflow
  if (cat === 7) return svc === 8 ? 1.6 : 0.85; // software install and request
  return 1;
}

const CAT_MIX = [0.21, 0.15, 0.1, 0.12, 0.08, 0.07, 0.07, 0.1, 0.05, 0.05];

const SYSTEMS: ClinicalSystem[] = [
  { key: 0, name: 'EHR', tier: 'P1', owner: 'Clinical Apps Lead' },
  { key: 1, name: 'PACS and imaging', tier: 'P1', owner: 'Imaging Systems Lead' },
  { key: 2, name: 'Laboratory system (LIS)', tier: 'P1', owner: 'Clinical Apps Lead' },
  { key: 3, name: 'Pharmacy and dispensing', tier: 'P1', owner: 'Clinical Apps Lead' },
  { key: 4, name: 'Interface engine', tier: 'P1', owner: 'Integration Lead' },
  { key: 5, name: 'Telehealth platform', tier: 'General', owner: 'Clinical Apps Lead' },
  { key: 6, name: 'Patient monitoring integration', tier: 'General', owner: 'Integration Lead' },
  { key: 7, name: 'Document imaging', tier: 'General', owner: 'Clinical Apps Lead' },
];
const SYS_ISSUES = [
  ['Slow chart open at shift change', 'Storage controller failover (P1)', 'Print-to-label delays'],
  ['Prior study retrieval lag', 'Viewer timeout on large studies', 'Worklist refresh delay'],
  ['Analyzer interface queue', 'Label printer mapping', 'Result routing rule'],
  ['Cabinet sync delay', 'Override report access', 'Formulary update lag'],
  ['ADT queue backlog', 'Lab results queue stop (P2)', 'Certificate renewal'],
  ['Video drops on rural circuits', 'Provider login delay', 'Scheduling sync lag'],
  ['Monitor association drops', 'Vitals interface lag', 'Gateway restart'],
  ['Scanner driver', 'Batch index delay', 'Search slowness'],
];

const PRI_MIX: Record<Pri, number> = { P1: 0.0016, P2: 0.028, P3: 0.46, P4: 0.21, SR: 0.3004 };
const RESP_TARGET_MIN: Record<Pri, number> = { P1: 15, P2: 30, P3: 240, P4: 480, SR: 480 };
const RESOLVE_TARGET_HRS: Record<Pri, number> = { P1: 4, P2: 8, P3: 24, P4: 72, SR: 72 };
export const SLA_TARGET: Record<Pri, number> = { P1: 1, P2: 0.98, P3: 0.95, P4: 0.95, SR: 0.95 };
export { RESP_TARGET_MIN, RESOLVE_TARGET_HRS };

export function generateDataset(): Dataset {
  const rnd = mulberry32(20261031);
  const noise = (amp: number) => 1 + (rnd() * 2 - 1) * amp;
  const months = buildMonths();
  const cur = N_MONTHS - 1;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // ---------------------------------------------------------------- tickets
  const tickets: TicketFact[] = [];
  const siteMonths: SiteMonth[] = [];
  for (const m of months) {
    const t = m.mi / (N_MONTHS - 1); // 0..1 over the window
    const season = 1 + 0.06 * Math.sin(((m.month + 1) / 12) * Math.PI * 2) + (m.month === 7 ? 0.05 : 0); // August new-resident bump
    const base = 1850 * (1 + 0.04 * t) * season; // about 0.47 tickets per user per month
    for (const s of SITES) {
      let siteOpened = 0;
      let siteResolved = 0;
      for (const pri of PRIORITIES) {
        for (const c of CATEGORIES) {
          let mult = 1;
          if (c.key === 2 && s.key === 1 && m.mi === cur) mult = 3.4; // printing spike at Hospital B
          if (c.key === 2 && s.key === 1 && m.mi === cur - 1) mult = 1.3;
          if (c.key === 0) mult *= 1.06 - 0.12 * t; // self-service reset slowly working
          if (c.key === 1 && m.mi === cur) mult *= 1.12;
          const exp = base * s.weight * PRI_MIX[pri] * CAT_MIX[c.key] * mult * noise(0.12);
          const total = pri === 'P1' ? (rnd() < exp ? 1 : 0) : Math.round(exp + (rnd() - 0.5));
          if (total <= 0) continue;
          // Split the cell across the requesting department's service line.
          const mix = (s.facilityType === 3 ? SVC_MIX_CLINIC : IS_CAH(s.key) ? SVC_MIX_CAH : SVC_MIX_HOSPITAL).map((w, k) => w * svcCatWeight(k, c.key));
          const wsum = mix.reduce((a, b) => a + b, 0);
          const bySvc = new Array(mix.length).fill(0);
          for (let k = 0; k < total; k++) { let r = rnd() * wsum; let j = 0; while (r > mix[j] && j < mix.length - 1) { r -= mix[j]; j++; } bySvc[j]++; }
          for (let svc = 0; svc < bySvc.length; svc++) {
          const opened = bySvc[svc];
          if (opened <= 0) continue;
          const resolved = Math.max(0, Math.round(opened * (0.985 + rnd() * 0.03)));
          // SLA rate: near target, planted misses.
          let rate = SLA_TARGET[pri] + 0.02 - rnd() * 0.026;
          if (pri === 'P1') rate = 1;
          if (pri === 'P2' && m.mi === cur) rate = 0.955 - rnd() * 0.02;
          if (s.key === 1 && m.mi === cur && (pri === 'P3' || pri === 'P4')) rate -= 0.055;
          if (m.mi < 6) rate -= 0.012;
          let slaMet = 0;
          const pr = clamp(rate, 0.7, 1);
          for (let k = 0; k < resolved; k++) if (rnd() < pr) slaMet++;
          const respAvg = RESP_TARGET_MIN[pri] * (0.55 + rnd() * 0.35) * (s.key === 1 && m.mi === cur ? 1.3 : 1);
          const resAvg = RESOLVE_TARGET_HRS[pri] * (0.45 + rnd() * 0.35) * (s.key === 1 && m.mi === cur ? 1.25 : 1);
          tickets.push({ mi: m.mi, site: s.key, pri, cat: c.key, svc, opened, resolved, slaMet, respMinSum: respAvg * resolved, resolveHrsSum: resAvg * resolved });
          siteOpened += opened;
          siteResolved += resolved;
          }
        }
      }
      const calls = Math.round(siteOpened * 0.62 * noise(0.05));
      const abandonRate = clamp(0.042 + (rnd() - 0.5) * 0.02 + (m.mi === cur && s.key === 1 ? 0.03 : 0) + (m.month === 7 ? 0.012 : 0), 0.01, 0.2);
      const abandoned = Math.round(calls * abandonRate);
      const asa = 21 + rnd() * 9 + (m.month === 7 ? 9 : 0) + (m.mi === cur && s.key === 1 ? 14 : 0);
      const backlogOpen = Math.round(siteOpened * (0.085 + rnd() * 0.02) * (m.mi === cur && s.key === 1 ? 1.5 : 1));
      const over7 = Math.round(backlogOpen * (0.16 + rnd() * 0.06 - 0.04 * t));
      const fcrEligible = Math.round(siteOpened * 0.7);
      const fcrRate = clamp(0.735 + 0.03 * t + (rnd() - 0.5) * 0.03 - (m.mi === cur && s.key === 1 ? 0.05 : 0), 0.5, 0.95);
      const csatN = Math.round(siteResolved * 0.14);
      const csat = clamp(4.5 + (rnd() - 0.5) * 0.24 + 0.05 * t - (m.mi === cur && s.key === 1 ? 0.28 : 0), 3, 5);
      const totMin = m.days * 24 * 60;
      let netDown = rnd() * 18 + (IS_CAH(s.key) ? 8 + rnd() * 30 : 0) + (s.facilityType === 3 ? rnd() * 20 : 0); // rural carrier circuits
      if (m.mi === cur && s.key === 0) netDown += 22;
      if (m.mi === cur - 4 && s.key === 3) netDown += 95; // carrier fiber cut
      const patchDevices = s.devices;
      const patch30 = Math.round(patchDevices * clamp(0.9 + 0.055 * t + (rnd() - 0.5) * 0.02, 0.8, 0.995));
      const critDevices = s.devices;
      const crit7 = Math.round(critDevices * clamp(0.93 + 0.06 * t + (rnd() - 0.5) * 0.015 - (s.key === 2 && m.mi === cur ? 0.02 : 0), 0.85, 1));
      siteMonths.push({
        mi: m.mi, site: s.key,
        fcrFirst: Math.round(fcrEligible * fcrRate), fcrEligible,
        callsOffered: calls, callsAnswered: calls - abandoned, asaSecSum: asa * (calls - abandoned), callsAbandoned: abandoned,
        backlogOpen, backlogOver7: over7,
        reopened: Math.round(siteResolved * clamp(0.034 + (rnd() - 0.5) * 0.014 + (m.mi === cur && s.key === 1 ? 0.025 : 0), 0.005, 0.2)),
        csatSum: csat * csatN, csatN,
        netUpMin: totMin - netDown, netTotMin: totMin,
        patchDevices, patch30, critDevices, crit7,
        eolDevices: Math.round(s.devices * (0.06 - 0.025 * t) * noise(0.1)),
        openCritVulns: Math.round((s.weight * 14) * (1.1 - 0.5 * t) * noise(0.25)),
        assetAccuracy: clamp(0.955 + 0.025 * t + (rnd() - 0.5) * 0.01, 0.9, 0.995),
        failoverTested: s.key !== 4 || m.mi < cur - 2,
      });
    }
  }

  // ---------------------------------------------------------------- clinical systems
  const systemMonths: SystemMonth[] = [];
  for (const m of months) {
    for (const sys of SYSTEMS) {
      const totalMin = m.days * 24 * 60;
      let unplanned = rnd() < 0.55 ? Math.round(rnd() * (sys.tier === 'P1' ? 14 : 60)) : 0;
      if (sys.key === 0 && m.mi === cur) unplanned = 192; // EHR P1, 3.2 h
      if (sys.key === 0 && m.mi === cur - 7) unplanned = 64;
      if (sys.key === 4 && m.mi === cur) unplanned = 48; // lab results queue stop (P2)
      if (sys.key === 1 && m.mi === cur - 2) unplanned = 71;
      if (sys.key === 6 && m.mi === cur) unplanned = 260;
      if (sys.key === 5 && rnd() < 0.3) unplanned += Math.round(rnd() * 120); // telehealth video drops on rural circuits
      const windows = sys.key === 0 ? 1 + (m.month % 3 === 0 ? 1 : 0) : rnd() < 0.5 ? 1 : 0;
      const issueIx = sys.key === 0 && m.mi === cur ? 1 : sys.key === 4 && m.mi === cur ? 1 : Math.floor(rnd() * 3) === 1 ? 2 : 0;
      systemMonths.push({
        mi: m.mi, sys: sys.key, totalMin, unplannedMin: unplanned,
        plannedHrs: Math.round(windows * (1.5 + rnd() * 2.5) * 10) / 10, plannedWindows: windows,
        tickets: Math.round((sys.key === 0 ? 260 : 18 + rnd() * 40) * noise(0.15) * (sys.key === 0 && m.mi === cur ? 1.25 : 1)),
        topIssue: SYS_ISSUES[sys.key][issueIx],
        interfaceErrors: sys.key === 4 || sys.key === 2 || sys.key === 6 ? Math.round((6 + rnd() * 10) * (m.mi === cur ? 1.8 : 1)) : 0,
        interfaceDelays: sys.key === 4 || sys.key === 6 ? Math.round(rnd() * 4 + (m.mi === cur ? 3 : 0)) : 0,
      });
    }
  }

  // ---------------------------------------------------------------- infrastructure
  const infra: InfraMonth[] = months.map((m) => {
    const t = m.mi / (N_MONTHS - 1);
    const jobs = 1100 + Math.round(rnd() * 90);
    const failed = m.mi === cur ? 9 : rnd() < 0.65 ? 0 : 1 + Math.floor(rnd() * 2);
    return {
      mi: m.mi,
      wan: clamp(0.9988 + rnd() * 0.0011 - (m.mi === cur - 4 ? 0.0021 : 0), 0.99, 1), // rural carrier circuits
      server: clamp(0.9991 + rnd() * 0.0009 - (m.mi === cur ? 0.0012 : 0), 0.99, 1),
      email: clamp(0.9994 + rnd() * 0.0006, 0.99, 1),
      schedHrs: Math.round((6 + rnd() * 6) * 10) / 10,
      unschedHrs: Math.round(((m.mi === cur ? 4.1 : m.mi === cur - 4 ? 2.6 : 0.4 + rnd() * 1.4)) * 10) / 10,
      backupJobs: jobs, backupFailed: failed, backupRerunOk: m.mi === cur ? 7 : failed,
      storagePeak: clamp(0.71 + 0.13 * t + (rnd() - 0.5) * 0.02, 0.5, 0.97),
      bandwidthPeak: clamp(0.64 + 0.14 * t + (rnd() - 0.5) * 0.06, 0.3, 0.97), // telehealth growth on thin rural links
      cpuPeak: clamp(0.62 + (rnd() - 0.5) * 0.1, 0.3, 0.97),
      memPeak: clamp(0.7 + 0.06 * t + (rnd() - 0.5) * 0.06, 0.3, 0.97),
      certs60: m.mi === cur ? 4 : Math.round(rnd() * 3),
      certs14: m.mi === cur ? 1 : 0,
      chgStd: Math.round(68 + rnd() * 20), chgNormal: Math.round(17 + rnd() * 7), chgEmerg: m.mi === cur ? 5 : Math.round(rnd() * 2.4),
      chgFailed: m.mi === cur ? 3 : rnd() < 0.5 ? 0 : 1,
    };
  });

  // ---------------------------------------------------------------- security
  const security: SecMonth[] = months.map((m) => {
    const t = m.mi / (N_MONTHS - 1);
    const delivered = 3700 + Math.round(rnd() * 250);
    const clickRate = m.mi === cur ? 0.061 : clamp(0.068 - 0.03 * t + (rnd() - 0.5) * 0.01, 0.02, 0.12);
    const vulnC = Math.max(0, Math.round((13 - 8 * t) * noise(0.2)));
    const vulnH = Math.round((95 - 40 * t) * noise(0.1));
    const vulnM = Math.round((390 - 90 * t) * noise(0.06));
    const vulnL = Math.round((680 - 70 * t) * noise(0.05));
    const split = (n: number, w: number[]) => { const a = w.map((x) => Math.round(n * x)); a[a.length - 1] = n - a.slice(0, -1).reduce((p, q) => p + q, 0); return a; };
    return {
      mi: m.mi,
      incLow: Math.round(4 + rnd() * 4), incMed: Math.round(1 + rnd() * 2), incHigh: m.mi === cur ? 1 : rnd() < 0.2 ? 1 : 0, incOpen: m.mi === cur ? 3 : Math.round(rnd() * 2),
      phishDelivered: delivered, phishClicks: Math.round(delivered * clickRate),
      vulnC, vulnH, vulnM, vulnL,
      vulnAge: [split(vulnC, [0.5, 0.3, 0.15, 0.05]), split(vulnH, [0.3, 0.35, 0.22, 0.13]), split(vulnM, [0.18, 0.3, 0.3, 0.22]), split(vulnL, [0.12, 0.22, 0.3, 0.36])],
      mttpCrit: Math.round(clamp(9.5 - 4.5 * t + (rnd() - 0.5) * 1.2, 2, 20) * 10) / 10,
      endpointCov: clamp(0.982 + 0.014 * t + (rnd() - 0.5) * 0.004, 0.9, 1),
      mfaCov: clamp(0.93 + 0.06 * t, 0.85, 1),
      encryption: clamp(0.975 + 0.02 * t, 0.9, 1),
      training: clamp(0.86 + 0.08 * t + (rnd() - 0.5) * 0.02, 0.7, 1),
      adminReview: m.month % 3 === 2 ? 1 : clamp(0.82 + rnd() * 0.15, 0.6, 1),
      failedLogins: Math.round(7000 + rnd() * 1200 + (m.mi === cur ? 3800 : 0)),
      lockouts: Math.round(250 + rnd() * 50 + (m.mi === cur ? 130 : 0)),
      phiEvents: m.mi === cur - 5 ? 1 : 0,
      patchExceptions: Math.round(62 - 14 * t + rnd() * 5), // mostly medical devices
    };
  });

  // ---------------------------------------------------------------- major incidents
  const incidents: Incident[] = [];
  const add = (mi: number, day: number, sev: 'P1' | 'P2', system: string, sites: number[], hrs: number, x: Partial<Incident>) => {
    const m = months[mi];
    const id = `INC-${m.year % 100}${String(m.month + 1).padStart(2, '0')}-${String(incidents.filter((i) => i.mi === mi).length + 1).padStart(2, '0')}`;
    incidents.push({
      id, mi, day, opened: `${MONTH_NAMES[m.month].slice(0, 3)} ${day}, ${m.year}`, system, sites, sev,
      durationHrs: hrs, clinicalDowntimeHrs: x.clinicalDowntimeHrs ?? (sev === 'P1' ? hrs : 0),
      responseMin: x.responseMin ?? (sev === 'P1' ? 8 + Math.round(rnd() * 6) : 14 + Math.round(rnd() * 14)),
      withinSla: x.withinSla ?? true,
      impact: x.impact ?? 'Users at the affected sites worked from cached data; no downtime procedures needed',
      resolution: x.resolution ?? 'Service restarted and validated with clinical super-users',
      rootCause: x.rootCause ?? 'Configuration drift after a scheduled change',
      rcStatus: x.rcStatus ?? 'Confirmed',
      action: x.action ?? 'Add configuration check to the change template',
      owner: x.owner ?? 'Infrastructure Lead',
      due: x.due ?? `${MONTH_NAMES[(m.month + 1) % 12].slice(0, 3)} 15`,
      actionStatus: x.actionStatus ?? 'Closed',
      downtimeProcedures: x.downtimeProcedures ?? sev === 'P1',
    });
  };
  const SYS_POOL = ['PACS and imaging', 'Interface engine', 'Laboratory system (LIS)', 'Network: site link', 'Network: site link', 'Telehealth platform', 'Email', 'Pharmacy and dispensing', 'Single sign-on', 'Telephony'];
  /** Pick a site weighted by size (bigger sites have more incidents). */
  const pickSite = () => { let r = rnd(); for (const x of SITES) { r -= x.weight; if (r <= 0) return x.key; } return 0; };
  for (let mi = 0; mi < cur; mi++) {
    const nP2 = Math.round(0.5 + rnd() * 1.9 - (mi / cur) * 0.5);
    for (let k = 0; k < nP2; k++) {
      const sys = SYS_POOL[Math.floor(rnd() * SYS_POOL.length)];
      const site = sys === 'Network: site link' ? [3, 4, 6, 8, 9, 11][Math.floor(rnd() * 6)] : pickSite();
      add(mi, 2 + Math.floor(rnd() * 26), 'P2', sys, [site], Math.round((0.6 + rnd() * 3) * 10) / 10, {
        withinSla: rnd() > 0.12,
        impact: `One department at ${SITES[site].short} slowed; workaround in place`,
        actionStatus: mi >= cur - 2 && k === 0 ? 'Open' : 'Closed',
      });
    }
    if (mi === cur - 13) {
      add(mi, 8, 'P1', 'PACS and imaging', [0, 1], 1.8, { impact: 'Imaging unavailable at Hospitals A and B; teleradiology reads delayed 90 min', resolution: 'Failed database node restored from replica', rootCause: 'Database cluster split after a storage path failure', action: 'Add path redundancy and cluster quorum monitoring', owner: 'Imaging Systems Lead' });
    }
    if (mi === cur - 19) {
      add(mi, 22, 'P1', 'Network: core', ALL_SITES, 1.4, { impact: 'All sites lost access to enterprise apps; downtime procedures for 84 min', resolution: 'Core switch rolled back to prior firmware', rootCause: 'Core switch firmware defect after a scheduled upgrade', action: 'Stage core upgrades in the lab first; add rollback plan to change template', owner: 'Network Lead' });
    }
    if (mi === cur - 26) {
      add(mi, 3, 'P1', 'EHR', ALL_SITES, 2.1, { impact: 'All sites on downtime procedures for 2.1 hrs', resolution: 'Application tier failed over to the secondary data center', rootCause: 'Expired internal certificate on the application tier', action: 'Add all EHR certificates to the 60-day watch', owner: 'Clinical Apps Lead' });
    }
    if (mi === cur - 31) {
      add(mi, 17, 'P1', 'Email', ALL_SITES, 3.5, { clinicalDowntimeHrs: 0, downtimeProcedures: false, impact: 'Email unavailable system-wide; clinical messaging unaffected', resolution: 'Mail flow restored after connector reconfiguration', rootCause: 'Cloud mail connector change by the provider', action: 'Monitor mail flow with synthetic messages', owner: 'Messaging Lead' });
    }
    if (mi === cur - 7) {
      add(mi, 11, 'P1', 'EHR', ALL_SITES, 1.1, { impact: 'All sites on downtime procedures for 66 min', resolution: 'Failed application node removed from pool', rootCause: 'Memory leak in vendor patch', action: 'Apply vendor hotfix; add memory alerting', owner: 'Clinical Apps Lead' });
    }
    if (mi === cur - 4) {
      add(mi, 19, 'P1', 'Network: site link', [3], 2.6, { impact: 'Hospital D offline from the shared EHR; ED on downtime procedures', resolution: 'Traffic moved to the backup LTE circuit', rootCause: 'Rural carrier fiber cut; backup circuit failover was manual', action: 'Automate WAN failover at Hospital D', owner: 'Network Lead', actionStatus: 'Open', due: 'Nov 30', responseMin: 11 });
    }
  }
  // Current month, written out.
  add(cur, 14, 'P1', 'EHR', ALL_SITES, 3.2, {
    clinicalDowntimeHrs: 3.2, responseMin: 9, withinSla: true,
    impact: 'All 11 hospitals and the clinics on downtime procedures for 3.2 hrs; 12 elective cases delayed at Hospital A',
    resolution: 'Storage array failed over to the secondary controller; EHR restarted and validated',
    rootCause: 'Storage controller firmware defect; failover did not trigger automatically', rcStatus: 'Under review',
    action: 'Apply firmware fix; test controller failover quarterly', owner: 'Infrastructure Lead', due: 'Nov 22', actionStatus: 'Open',
  });
  add(cur, 6, 'P2', 'Interface engine', [0, 1, 2, 3, 4, 5, 7], 0.8, {
    impact: 'Lab results stopped reaching the EHR for 48 min; results phoned to units', resolution: 'Interface queue restarted; backlog replayed',
    rootCause: 'Expired certificate on the lab interface', action: 'Add interface certificates to the 60-day watch', owner: 'Integration Lead', due: 'Oct 31', actionStatus: 'Closed', responseMin: 12,
  });
  add(cur, 21, 'P2', 'Printing', [1], 5.5, {
    withinSla: false, responseMin: 34,
    impact: 'Label and wristband printing failed on 4 units at Hospital B; hand labels used',
    resolution: 'Queues remapped to the new print server', rootCause: 'Print-server migration missed 38 queues', rcStatus: 'Confirmed',
    action: 'Remap remaining queues; add print test to migration runbook', owner: 'Infrastructure Lead', due: 'Nov 20', actionStatus: 'Open',
  });
  add(cur, 27, 'P2', 'Patient monitoring integration', [0], 4.3, {
    impact: 'Vitals not flowing to the EHR in the hub ICU; manual charting', resolution: 'Gateway restarted; vendor engaged',
    rootCause: 'Vendor gateway defect after network change', rcStatus: 'Under review', action: 'Install vendor patch', owner: 'Integration Lead', due: 'Dec 5', actionStatus: 'Open',
  });
  // One action overdue from last month.
  const lastMonthOpen = incidents.find((i) => i.mi === cur - 1 && i.actionStatus === 'Open');
  if (lastMonthOpen) { lastMonthOpen.actionStatus = 'Overdue'; lastMonthOpen.due = 'Oct 31'; }

  // ---------------------------------------------------------------- financial (mock)
  // Managed services fee = fixed monthly fee + per-device charge + ticket overage above a baseline.
  // Budget is set per fiscal year (calendar year in the mock). Project spend follows the portfolio.
  const deviceCount = SITES.reduce((a, s) => a + s.devices, 0);
  const userCount = SITES.reduce((a, s) => a + s.users, 0);
  const finance: FinMonth[] = months.map((m) => {
    const opened = tickets.filter((x) => x.mi === m.mi).reduce((a, x) => a + x.opened, 0);
    const devices = Math.round(deviceCount * (0.93 + 0.07 * (m.mi / (N_MONTHS - 1))));
    const fixed = m.year === 2024 ? 158000 : m.year === 2025 ? 165000 : 172000;
    const perDevice = devices * 12.5;
    const overage = Math.max(0, opened - 1850) * 38;
    const projectSpend = Math.round((m.year === 2026 ? 62000 : 47000) * (0.75 + rnd() * 0.5));
    const budgetRun = m.year === 2024 ? 225000 : m.year === 2025 ? 235000 : 245000;
    return {
      mi: m.mi, feeFixed: fixed, feeDevices: Math.round(perDevice), feeOverage: Math.round(overage),
      serviceDeskShare: 0.36, budgetRun, projectSpend, projectBudget: m.year === 2026 ? 60000 : 50000,
      devices, users: Math.round(userCount * (0.95 + 0.05 * (m.mi / (N_MONTHS - 1)))),
    };
  });

  const ds: Dataset = {
    client: 'Sample Rural Health System', provider: 'Convene',
    months, currentMi: cur, sites: SITES, categories: CATEGORIES, systems: SYSTEMS,
    regions: REGIONS, facilityTypes: FACILITY_TYPES, patientTypes: PATIENT_TYPES, serviceLines: SERVICE_LINES,
    tickets, siteMonths, systemMonths, infra, security, incidents, finance,
    downtimeCostPerHour: 9000,
    projects: [
      { name: 'Storage platform refresh', outcome: 'retire end-of-life arrays; automatic failover', sponsor: 'Chief Information Officer', phase: 'Build', schedule: 'A', scope: 'G', budget: 'G', overall: 'A', milestone: 'Production cutover', milestoneDate: 'Jan 18', blocker: 'Approve weekend downtime window by Nov 25', site: null, pctComplete: 0.46, budgetUsd: 650000, spentUsd: 280000 },
      { name: 'Thin-client replacement', outcome: '90 nursing workstations replaced at the hub', sponsor: 'Chief Nursing Officer', phase: 'Build', schedule: 'G', scope: 'G', budget: 'G', overall: 'G', milestone: 'Units 4-6 deployed', milestoneDate: 'Dec 12', blocker: 'None', site: 0, pctComplete: 0.58, budgetUsd: 120000, spentUsd: 66000 },
      { name: 'Automated WAN failover (LTE backup)', outcome: 'sub-minute failover at all critical access hospitals', sponsor: 'VP Infrastructure', phase: 'Test', schedule: 'R', scope: 'G', budget: 'A', overall: 'R', milestone: 'Hospital D failover test', milestoneDate: 'Nov 19', blocker: 'Rural carrier circuit order delayed; escalation needed', site: 3, pctComplete: 0.72, budgetUsd: 95000, spentUsd: 81000 },
      { name: 'Multifactor sign-in for all staff', outcome: '100% MFA coverage', sponsor: 'Chief Information Security Officer', phase: 'Go-live', schedule: 'G', scope: 'G', budget: 'G', overall: 'G', milestone: 'Final wave (rural clinics)', milestoneDate: 'Nov 30', blocker: 'None', site: null, pctComplete: 0.9, budgetUsd: 70000, spentUsd: 58000 },
      { name: 'Telehealth bandwidth upgrade', outcome: '100 Mbps or better at every critical access site', sponsor: 'Chief Medical Officer', phase: 'Plan', schedule: 'G', scope: 'A', budget: 'G', overall: 'A', milestone: 'Carrier quotes complete', milestoneDate: 'Dec 3', blocker: 'Scope adds the two Mountain West sites; decision on budget', site: null, pctComplete: 0.15, budgetUsd: 85000, spentUsd: 9000 },
      { name: 'Service desk self-service portal', outcome: '30% of requests self-served', sponsor: 'Chief Information Officer', phase: 'Build', schedule: 'G', scope: 'G', budget: 'G', overall: 'G', milestone: 'Pilot at Hospital C', milestoneDate: 'Jan 8', blocker: 'None', site: 2, pctComplete: 0.4, budgetUsd: 55000, spentUsd: 20000 },
      { name: 'Rural clinic network standardization', outcome: 'one network design at all 9 rural clinics', sponsor: 'VP Ambulatory', phase: 'Stabilize', schedule: 'G', scope: 'G', budget: 'A', overall: 'A', milestone: 'Close-out report', milestoneDate: 'Nov 28', blocker: 'Budget overrun of 6%; accept or descope', site: 10, pctComplete: 0.95, budgetUsd: 160000, spentUsd: 170000 },
    ],
    completedThisMonth: ['Multifactor sign-in: wave 3 (critical access hospitals) live', 'Thin-client replacement: units 1-3 deployed', 'Backup retention policy aligned to the records schedule'],
    sinceLastReview: [
      { action: 'Reduce P3 backlog older than 7 days', owner: 'Service Desk Manager', status: 'A', statusText: 'Slipped (printing spike)', metric: 'Tickets open > 7 days', prior: '', current: '' },
      { action: 'Automate WAN failover at Hospital D', owner: 'Network Lead', status: 'R', statusText: 'Past due', metric: 'Network availability, Hospital D', prior: '', current: '' },
      { action: 'Raise phishing training completion', owner: 'Security Awareness Lead', status: 'A', statusText: 'At risk', metric: 'Phishing click rate', prior: '', current: '' },
      { action: 'Close critical vulnerabilities older than 30 days', owner: 'Vulnerability Mgmt Lead', status: 'G', statusText: 'On track', metric: 'Critical vulnerabilities open', prior: '', current: '' },
    ],
    nextActions: [
      { action: 'Apply storage controller firmware fix and test automatic failover', owner: 'Infrastructure Lead', due: 'Nov 22', measure: 'EHR availability ≥ 99.9%', area: 'Infrastructure' },
      { action: 'Remap remaining print queues at Hospital B and retire the old server', owner: 'Infrastructure Lead', due: 'Nov 20', measure: 'Printing tickets at Hospital B back below 15 per month', area: 'Service Desk' },
      { action: 'Recover P2 SLA compliance with a dedicated P2 dispatch queue', owner: 'Service Desk Manager', due: 'Nov 30', measure: 'P2 SLA compliance ≥ 98%', area: 'Service Desk' },
      { action: 'Re-run failed backup jobs at Hospital C and fix the job schedule', owner: 'Backup Lead', due: 'Nov 15', measure: 'Backup success 100%', area: 'Infrastructure' },
      { action: 'Targeted phishing training for the three departments with the most clicks', owner: 'Security Awareness Lead', due: 'Dec 15', measure: 'Phishing click rate < 5%', area: 'Security' },
    ],
    decisions: [
      { decision: 'Approve a weekend downtime window for the storage cutover', options: 'Jan 18 or Feb 8', recommend: 'Jan 18', reason: 'it removes the controller defect before the winter volume peak', maker: 'Chief Information Officer', by: 'Nov 25', costOfDelay: 'Three more weeks on the defective controller; each slip moves the cutover by 3 weeks' },
      { decision: 'Add the two Mountain West sites to the telehealth bandwidth upgrade', options: 'Add now ($24k) or defer to FY27', recommend: 'adding now', reason: 'video visits there drop most often and the carrier quote expires Dec 15', maker: 'Chief Medical Officer', by: 'Dec 3', costOfDelay: 'Telehealth visits at Hospital J and the rural clinics keep dropping on thin circuits' },
      { decision: 'Rural clinic network budget overrun', options: 'Accept the 6% overrun ($10k) or descope two clinics', recommend: 'accepting the overrun', reason: 'descoping leaves two clinics on the old design', maker: 'VP Ambulatory', by: 'Nov 28', costOfDelay: 'Close-out and warranty start delayed' },
    ],
    certificates: [
      { name: 'Lab interface TLS', system: 'Interface engine', expires: 'Nov 21, 2026', days: 9, owner: 'Integration Lead' },
      { name: 'Patient portal web', system: 'Patient portal', expires: 'Dec 2, 2026', days: 20, owner: 'Web Services Lead' },
      { name: 'Remote access gateway', system: 'VPN', expires: 'Dec 19, 2026', days: 37, owner: 'Network Lead' },
      { name: 'Imaging viewer', system: 'PACS and imaging', expires: 'Jan 4, 2027', days: 53, owner: 'Imaging Systems Lead' },
    ],
    eol: [
      { item: 'Storage arrays (primary data center)', count: 2, sites: 'Data center', risk: 'R', replacement: 'Jan 18 (storage refresh)' },
      { item: 'Thin clients, 5+ years', count: 90, sites: 'Hospital A', risk: 'A', replacement: 'Jan 31 (refresh project)' },
      { item: 'Unsupported server OS', count: 6, sites: 'Hospitals B, C, F', risk: 'A', replacement: 'Mar 31' },
      { item: 'Network switches past vendor support', count: 14, sites: 'Critical access hospitals, rural clinics', risk: 'A', replacement: 'Feb 28' },
    ],
    siteActions: {
      0: ['Test storage controller failover after the firmware fix; Infrastructure Lead; Nov 22', 'Finish thin-client units 4-6; Field Services Lead; Dec 12', 'Close ICU monitor interface patch; Integration Lead; Dec 5'],
      1: ['Remap remaining print queues; Infrastructure Lead; Nov 20', 'Add a floor-walker for two weeks to clear backlog; Service Desk Manager; Nov 30', 'Survey users after printing fix; Service Desk Manager; Dec 10'],
      2: ['Fix backup job schedule overlap; Backup Lead; Nov 15', 'Pilot self-service portal; Service Desk Manager; Jan 8', 'Reduce critical patch gap; Endpoint Lead; Nov 30'],
      3: ['Complete automated WAN failover test; Network Lead; Nov 19', 'Replace two end-of-life switches; Network Lead; Feb 28', 'Refresh downtime procedure binders; Site IT Lead; Dec 1'],
      4: ['Schedule failover test (missed for 3 months); Site IT Lead; Nov 26', 'Install LTE backup circuit; Network Lead; Jan 15', 'Replace end-of-life switches; Network Lead; Feb 28'],
      5: ['Retire unsupported server OS; Infrastructure Lead; Mar 31', 'Badge reader firmware baseline; Endpoint Lead; Nov 25', 'Quarterly downtime drill; Site IT Lead; Dec 8'],
      6: ['Install LTE backup circuit; Network Lead; Jan 15', 'Telehealth cart Wi-Fi survey; Network Lead; Dec 12', 'Train two super-users on downtime procedures; Site IT Lead; Dec 5'],
      7: ['Replace aging lab printers; Field Services Lead; Dec 19', 'Review admin accounts (quarterly); Identity Lead; Dec 31', 'Patch two medical-device exceptions; Vulnerability Mgmt Lead; Jan 10'],
      8: ['Upgrade site circuit to 100 Mbps; Network Lead; Jan 20', 'Inventory reconciliation; Asset Lead; Dec 15', 'Install LTE backup circuit; Network Lead; Jan 15'],
      9: ['Add to telehealth bandwidth upgrade (decision Dec 3); Network Lead; Feb 15', 'Install LTE backup circuit; Network Lead; Jan 30', 'Replace end-of-life switch; Network Lead; Feb 28'],
      10: ['Close out network standardization; Network Lead; Nov 28', 'Finish MFA final wave; Identity Lead; Nov 30', 'Inventory reconciliation at 3 clinics; Asset Lead; Dec 15'],
      11: ['Install LTE backup circuit; Network Lead; Jan 15', 'Winter storm downtime drill; Site IT Lead; Dec 10', 'Replace end-of-life switch; Network Lead; Feb 28'],
    },
    commentary: {
      brief: '',
      keyPoints: [],
      serviceDesk: 'Demand rose on a printing spike at Hospital B after the print-server migration missed 38 queues. That spike pushed Hospital B backlog and reopen rates up and pulled P3/P4 SLA below target there. P2 SLA missed target enterprise-wide; a dedicated P2 dispatch queue starts Nov 18. Password tickets continue to fall as self-service reset adoption grows.',
      clinical: 'EHR availability missed target after the Oct 14 storage controller failure (192 unplanned minutes). All sites used downtime procedures. Patient monitoring integration had 260 unplanned minutes in the hub ICU while the vendor works a gateway defect. The telehealth platform loses video on thin rural circuits; the bandwidth upgrade is in planning. Other P1 clinical systems met target.',
      infrastructure: 'Unscheduled downtime was the highest in 18 months, driven by the storage failure. Nine backup jobs failed (seven re-ran within 24 hours; two at Hospital C did not). Rural carrier circuits at the critical access hospitals remain the main network risk; LTE backup circuits are being installed. Storage peaked above 80% for the second month; the storage refresh cutover on Jan 18 needs a decision. One certificate expires inside 14 days.',
      incidents: 'One P1 and three P2 incidents. The P1 EHR outage (3.2 hrs) is the main event this month; the root cause is under vendor review and the firmware fix is scheduled for Nov 22. The Hospital B printing P2 missed the response target. One corrective action from September is overdue.',
      security: 'No PHI exposure events. Critical vulnerabilities continue to fall and mean time to patch critical CVEs is inside target. The phishing click rate (6.1%) is above the 5% target; three departments account for half of the clicks. Failed logins and lockouts spiked mid-month from a password-spray attempt that MFA blocked.',
    },
    nextReview: { when: 'December 10, 2026, 10:00 AM, Hospital A boardroom and video link', preRead: 'December 5, 2026', distribution: 'IT steering committee' },
    servicesInScope: [
      { service: 'Service desk and end-user support', inScope: true, page: 'service-desk', pageLabel: 'Service Desk' },
      { service: 'Clinical application and EHR support', inScope: true, page: 'clinical', pageLabel: 'Clinical Applications' },
      { service: 'Network, hosting, email and backup', inScope: true, page: 'infrastructure', pageLabel: 'Infrastructure Health' },
      { service: 'Managed security services', inScope: true, page: 'security', pageLabel: 'Security and Compliance' },
      { service: 'Compliance support (HIPAA)', inScope: true, page: 'security', pageLabel: 'Security and Compliance' },
      { service: 'Projects and advisory', inScope: true, page: 'projects', pageLabel: 'Projects and Initiatives' },
    ],
    team: [
      { role: 'Client Service Executive', contact: 'cse@example.com' },
      { role: 'IT Service Delivery Lead', contact: 'delivery@example.com' },
      { role: 'General inquiries', contact: 'support@example.com · (000) 000-0000' },
    ],
    dataThrough: 'Oct 31, 2026', refreshed: 'Nov 12, 2026 6:00 AM',
  };
  return ds;
}
