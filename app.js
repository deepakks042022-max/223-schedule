/* ShiftPro PWA - vanilla JS, offline-first */

const STORAGE = {
  csv: "shiftpro_csv_v1",
  overrides: "shiftpro_overrides_v1",
  theme: "shiftpro_theme_v1",
};

const APP_BASE = window.SHIFTPRO_BASE || "./";

/** @type {Map<string, {date:string, day:string, status:"Work"|"Off", shift:string, cycleDay:string}>} */
let baseSchedule = new Map();
/** @type {Record<string, {status:"Work"|"Off", shift:string}>} */
let overrides = {};

let monthCursor = startOfMonth(new Date());
let activeDateISO = null;

const el = (id) => document.getElementById(id);

function resolveAssetPath(path) {
  return `${APP_BASE}${path}`;
}

function dateToISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  return new Date(y, m - 1, d);
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function humanDate(d) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" }).format(d);
}

function humanShort(d) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(d);
}

function safeTrim(x) {
  return (x ?? "").toString().trim();
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map();

  // Expect header: Date,Day,Status,Shift,Cycle Day
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCSVLine(lines[i]);
    if (parts.length < 3) continue;
    const date = safeTrim(parts[0]);
    if (!date) continue;
    map.set(date, {
      date,
      day: safeTrim(parts[1]),
      status: safeTrim(parts[2]) === "Work" ? "Work" : "Off",
      shift: safeTrim(parts[3]),
      cycleDay: safeTrim(parts[4]),
    });
  }
  return map;
}

// Minimal CSV splitting (handles quoted fields)
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function loadOverrides() {
  try {
    overrides = JSON.parse(localStorage.getItem(STORAGE.overrides) || "{}") || {};
  } catch {
    overrides = {};
  }
}

function saveOverrides() {
  localStorage.setItem(STORAGE.overrides, JSON.stringify(overrides));
}

function getEntry(iso) {
  const base = baseSchedule.get(iso);
  const ov = overrides[iso];
  if (!base && !ov) return null;
  const merged = {
    date: iso,
    day: base?.day || new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(parseISODate(iso)),
    status: (ov?.status || base?.status || "Off"),
    shift: (ov?.shift ?? base?.shift ?? ""),
    cycleDay: base?.cycleDay || "",
    overridden: Boolean(ov),
  };
  return merged;
}

function badgeHTML(status) {
  const cls = status === "Work" ? "work" : "off";
  const label = status === "Work" ? "Work" : "Off";
  return `<span class="badge ${cls}">${label}</span>`;
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--work", theme.work);
  root.style.setProperty("--off", theme.off);

  // Update badge gradients based on vars
  // (Use computed vars in CSS by letting badges read --work/--off through inline style variables)
  const style = document.getElementById("dynamicBadgeStyle") || document.createElement("style");
  style.id = "dynamicBadgeStyle";
  style.textContent = `
    .badge.work { background: linear-gradient(180deg, ${theme.work}, ${hexToRgba(theme.work, 0.82)}); }
    .badge.off { background: linear-gradient(180deg, ${theme.off}, ${hexToRgba(theme.off, 0.78)}); }
    .day.today { outline-color: ${hexToRgba(theme.work, 0.55)}; }
    .day .mini.work { background: ${hexToRgba(theme.work, 0.18)}; }
    .day .mini.off { background: ${hexToRgba(theme.off, 0.16)}; }
  `;
  document.head.appendChild(style);
}

function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function loadTheme() {
  const defaults = { primary: "#0b1f3a", work: "#2ee59d", off: "#8b98a8" };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.theme) || "null");
    return { ...defaults, ...(saved || {}) };
  } catch {
    return defaults;
  }
}

function saveTheme(theme) {
  localStorage.setItem(STORAGE.theme, JSON.stringify(theme));
}

function setSubtitle() {
  const dates = [...baseSchedule.keys()].sort();
  if (dates.length === 0) {
    el("subtitle").textContent = "No schedule loaded";
    return;
  }
  el("subtitle").textContent = `Schedule: ${dates[0]} → ${dates[dates.length - 1]}`;
}

function renderHome() {
  const today = new Date();
  const iso = dateToISO(today);
  const entry = getEntry(iso);

  el("todayDate").textContent = humanDate(today);
  el("todayMeta").textContent = entry ? `${entry.day}` : "Not found in schedule";
  el("todayBadgeWrap").innerHTML = entry ? badgeHTML(entry.status) : badgeHTML("Off");
  el("todayShift").textContent = entry?.status === "Work" ? (entry.shift || "Work (no shift time)") : "Off";
  el("todayCycle").textContent = entry?.cycleDay ? `Cycle day: ${entry.cycleDay}${entry.overridden ? " • overridden" : ""}` : (entry?.overridden ? "Overridden" : "");

  const list = el("next7");
  list.innerHTML = "";
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, i);
    const iso2 = dateToISO(d);
    const e = getEntry(iso2);
    const status = e?.status || "Off";
    const shift = status === "Work" ? (e?.shift || "") : "";
    const subtitle = status === "Work" ? (shift || "Work") : "Off";
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <div class="left">
        <div class="title">${humanShort(d)}</div>
        <div class="sub">${subtitle}${e?.overridden ? " • overridden" : ""}</div>
      </div>
      ${badgeHTML(status)}
    `;
    div.addEventListener("click", () => openDayModal(iso2));
    list.appendChild(div);
  }
}

function renderCalendar() {
  const monthTitle = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(monthCursor);
  el("monthTitle").textContent = monthTitle;

  const grid = el("monthGrid");
  grid.innerHTML = "";

  const first = startOfMonth(monthCursor);
  const startDow = first.getDay(); // 0=Sun
  const start = addDays(first, -startDow);

  const today = new Date();
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const iso = dateToISO(d);
    const e = getEntry(iso);

    const cell = document.createElement("div");
    cell.className = "day";
    if (d.getMonth() !== monthCursor.getMonth()) cell.classList.add("outside");
    if (sameDay(d, today)) cell.classList.add("today");

    const mini = e ? `<div class="mini ${e.status === "Work" ? "work" : "off"}">${e.status}</div>` : "";
    cell.innerHTML = `<div class="num">${d.getDate()}</div>${mini}`;
    cell.addEventListener("click", () => openDayModal(iso));
    grid.appendChild(cell);
  }
}

function renderSearchResult(iso) {
  const e = getEntry(iso);
  if (!e) {
    el("searchResult").innerHTML = `<div class="muted">No entry found for ${iso}.</div>`;
    return;
  }
  const d = parseISODate(iso);
  el("searchResult").innerHTML = `
    <div class="list-item">
      <div class="left">
        <div class="title">${humanDate(d)}</div>
        <div class="sub">${e.day}${e.cycleDay ? ` • Cycle ${e.cycleDay}` : ""}${e.overridden ? " • overridden" : ""}</div>
        <div class="sub">${e.status === "Work" ? (e.shift || "Work (no shift time)") : "Off"}</div>
      </div>
      ${badgeHTML(e.status)}
    </div>
  `;
}

function openDayModal(iso) {
  activeDateISO = iso;
  const e = getEntry(iso) || { status: "Off", shift: "", day: "", cycleDay: "" };
  const d = parseISODate(iso);
  el("modalTitle").textContent = humanDate(d);
  el("modalSubtitle").textContent = `${e.day}${e.cycleDay ? ` • Cycle ${e.cycleDay}` : ""}${e.overridden ? " • overridden" : ""}`;
  el("editStatus").value = e.status;
  el("editShift").value = e.shift || "";
  el("dayModal").showModal();
}

function installNav() {
  const tabs = document.querySelectorAll(".tabbar .tab");
  tabs.forEach((t) => {
    t.addEventListener("click", () => {
      const page = t.getAttribute("data-nav");
      tabs.forEach((x) => x.classList.toggle("active", x === t));
      document.querySelectorAll(".page").forEach((p) => p.classList.toggle("hidden", p.getAttribute("data-page") !== page));
      if (page === "home") renderHome();
      if (page === "calendar") renderCalendar();
    });
  });
}

function wireUI() {
  installNav();

  el("btnPrevMonth").addEventListener("click", () => {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1);
    renderCalendar();
  });
  el("btnNextMonth").addEventListener("click", () => {
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
    renderCalendar();
  });

  el("btnSearch").addEventListener("click", () => {
    const iso = el("searchDate").value;
    if (iso) renderSearchResult(iso);
  });

  // Modal buttons
  el("btnSaveOverride").addEventListener("click", (ev) => {
    ev.preventDefault();
    if (!activeDateISO) return;
    overrides[activeDateISO] = {
      status: el("editStatus").value === "Work" ? "Work" : "Off",
      shift: safeTrim(el("editShift").value),
    };
    saveOverrides();
    el("dayModal").close();
    renderHome();
    renderCalendar();
    if (el("searchDate").value === activeDateISO) renderSearchResult(activeDateISO);
  });

  el("btnDeleteOverride").addEventListener("click", (ev) => {
    ev.preventDefault();
    if (!activeDateISO) return;
    delete overrides[activeDateISO];
    saveOverrides();
    el("dayModal").close();
    renderHome();
    renderCalendar();
    if (el("searchDate").value === activeDateISO) renderSearchResult(activeDateISO);
  });

  // Theme
  const theme = loadTheme();
  el("themePrimary").value = theme.primary;
  el("themeWork").value = theme.work;
  el("themeOff").value = theme.off;
  applyTheme(theme);

  el("btnSaveTheme").addEventListener("click", () => {
    const t = { primary: el("themePrimary").value, work: el("themeWork").value, off: el("themeOff").value };
    saveTheme(t);
    applyTheme(t);
  });

  el("btnResetTheme").addEventListener("click", () => {
    const t = { primary: "#0b1f3a", work: "#2ee59d", off: "#8b98a8" };
    el("themePrimary").value = t.primary;
    el("themeWork").value = t.work;
    el("themeOff").value = t.off;
    saveTheme(t);
    applyTheme(t);
  });

  // CSV import
  el("csvFile").addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const text = await file.text();
    baseSchedule = parseCSV(text);
    localStorage.setItem(STORAGE.csv, text);
    setSubtitle();
    renderHome();
    renderCalendar();
    el("settingsStatus").textContent = `Imported ${baseSchedule.size} days from ${file.name}.`;
  });

  // Overrides utilities
  el("btnClearOverrides").addEventListener("click", () => {
    overrides = {};
    saveOverrides();
    el("settingsStatus").textContent = "Overrides cleared.";
    renderHome();
    renderCalendar();
  });

  el("btnExportOverrides").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(overrides, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shiftpro-overrides.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    el("settingsStatus").textContent = "Overrides exported.";
  });

  // Install help: jump to Settings
  el("btnInstallHelp").addEventListener("click", () => {
    document.querySelector('.tabbar .tab[data-nav="settings"]').click();
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });
}

async function loadSchedule() {
  const stored = localStorage.getItem(STORAGE.csv);
  if (stored && stored.trim().length > 0) {
    baseSchedule = parseCSV(stored);
    return;
  }
  const res = await fetch(resolveAssetPath("data/schedule.csv"), { cache: "no-cache" });
  const text = await res.text();
  baseSchedule = parseCSV(text);
}

async function init() {
  loadOverrides();
  wireUI();

  try {
    await loadSchedule();
  } catch (e) {
    console.error(e);
  }

  setSubtitle();
  renderHome();
  renderCalendar();

  // Default search date = today
  el("searchDate").value = dateToISO(new Date());

  // PWA
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register(resolveAssetPath("sw.js"), {
        scope: resolveAssetPath(""),
      });
    } catch (e) {
      console.warn("Service worker registration failed", e);
    }
  }
}

window.addEventListener("DOMContentLoaded", init);
