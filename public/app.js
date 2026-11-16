/* Agent Platform Prep: single-page app, no build step, no dependencies. */
(function () {
  "use strict";

  const WEEKS = window.CURRICULUM;
  const VIDEOS = window.VIDEOS;
  const ALL_DAYS = WEEKS.flatMap((w) => w.days.map((d) => ({ ...d, week: w.week })));
  const ALL_TASKS = ALL_DAYS.flatMap((d) => d.tasks.map((t) => ({ ...t, day: d.day })));
  const TOTAL_DAYS = ALL_DAYS.length;
  const LS_KEY = "agent-prep-progress-v1";

  /* ---------------- state + persistence ---------------- */

  const blank = () => ({
    version: 1, startDate: null, tasks: {}, notes: {}, videos: {}, interview: {},
    interviewNotes: {}, activity: {}, updatedAt: null,
  });
  let state = blank();
  let serverOk = false;
  let saveTimer = null;

  function todayISO(d = new Date()) {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }
  function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return todayISO(d); }

  function merge(base, incoming) {
    const out = blank();
    for (const k of Object.keys(out)) {
      if (incoming && incoming[k] !== undefined) out[k] = incoming[k];
      else if (base && base[k] !== undefined) out[k] = base[k];
    }
    return out;
  }

  async function load() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch { /* storage unavailable */ }
    let remote = null;
    try {
      const r = await fetch("/api/progress", { cache: "no-store" });
      if (r.ok) { remote = (await r.json()).progress; serverOk = true; }
    } catch { serverOk = false; }
    // Prefer whichever copy was saved most recently.
    const pick = [remote, local].filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    state = merge(blank(), pick || {});
    setSaveStatus(serverOk ? (pick ? "Loaded from disk" : "Ready") : "Server offline: saving in browser only");
  }

  function save() {
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const r = await fetch("/api/progress", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state),
        });
        serverOk = r.ok;
        setSaveStatus(r.ok ? "Saved to disk " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Save failed (kept in browser)");
      } catch {
        serverOk = false;
        setSaveStatus("Server offline: saved in browser");
      }
    }, 300);
    renderFooter();
  }

  function setSaveStatus(t) { const el = document.getElementById("save-status"); if (el) el.textContent = t; }

  function logActivity(delta) {
    const t = todayISO();
    state.activity[t] = Math.max(0, (state.activity[t] || 0) + delta);
  }

  /* ---------------- derived numbers ---------------- */

  const isDone = (id) => !!(state.tasks[id] && state.tasks[id].done);
  const dayDone = (d) => d.tasks.filter((t) => isDone(t.id)).length;
  const pctAll = () => Math.round((ALL_TASKS.filter((t) => isDone(t.id)).length / ALL_TASKS.length) * 100);

  function scheduledDay() {
    if (!state.startDate) return 1;
    return Math.min(TOTAL_DAYS, Math.max(1, daysBetween(state.startDate, todayISO()) + 1));
  }
  function firstUnfinishedDay() {
    const d = ALL_DAYS.find((x) => dayDone(x) < x.tasks.length);
    return d ? d.day : TOTAL_DAYS;
  }
  function streak() {
    let n = 0;
    let d = todayISO();
    if (!state.activity[d]) d = addDays(d, -1); // today not started yet: don't break the streak
    while (state.activity[d] > 0) { n++; d = addDays(d, -1); }
    return n;
  }
  function minutesLeft() {
    return ALL_TASKS.filter((t) => !isDone(t.id)).reduce((s, t) => s + (t.minutes || 0), 0);
  }

  /* ---------------- helpers ---------------- */

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? " " + (m % 60) + "m" : ""}` : `${m}m`);
  const TYPE_LABEL = { video: "Video", course: "Course", read: "Read", build: "Build", reflect: "Reflect", practice: "Practice", decide: "Decide" };

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 1800);
  }

  /* ---------------- rendering ---------------- */

  const main = () => document.getElementById("main");

  function renderFooter() {
    const p = pctAll();
    document.getElementById("ring-fg").style.strokeDashoffset = String(97.4 * (1 - p / 100));
    document.getElementById("ring-pct").textContent = p + "%";
    const s = streak();
    document.getElementById("foot-streak").textContent = `${s}-day streak`;
  }

  function taskHTML(t) {
    const done = isDone(t.id);
    const v = t.video ? VIDEOS[t.video] : null;
    const hasBody = (t.steps && t.steps.length) || t.code || v || t.url;
    const open = !done;
    return `
    <article class="task ${done ? "done" : ""}" data-task="${esc(t.id)}">
      <div class="task-top">
        <input type="checkbox" class="check" data-check="${esc(t.id)}" ${done ? "checked" : ""} aria-label="Mark '${esc(t.title)}' done">
        <div>
          <div class="task-title">${inline(t.title)}</div>
          <div class="task-meta"><span class="badge ${esc(t.type)}">${TYPE_LABEL[t.type] || t.type}</span>
            ${t.minutes ? `<span>~${fmtMin(t.minutes)}</span>` : ""}
            ${v ? `<span>${esc(v.speaker)}</span>` : ""}
          </div>
        </div>
        ${hasBody ? `<button class="toggle" data-toggle="${esc(t.id)}" aria-expanded="${open}">${open ? "Hide" : "Details"}</button>` : "<span></span>"}
      </div>
      <div class="task-body" ${open ? "" : "hidden"}>
        ${v ? `<p class="muted">${esc(v.why)}</p>` : ""}
        ${t.steps ? `<ol>${t.steps.map((s) => `<li>${inline(s)}</li>`).join("")}</ol>` : ""}
        ${t.code ? `<pre class="code"><button class="copy" data-copy>Copy</button><code>${esc(t.code)}</code></pre>` : ""}
        <div class="task-actions">
          ${v ? `<button class="btn primary" data-play="${esc(t.video)}">▶ Play here</button>` : ""}
          ${t.url ? `<a class="btn" href="${esc(t.url)}" target="_blank" rel="noopener">Open ${t.type === "course" ? "course" : "link"} ↗</a>` : ""}
        </div>
      </div>
    </article>`;
  }

  function dayView(n, isToday) {
    const d = ALL_DAYS.find((x) => x.day === n);
    const w = WEEKS.find((x) => x.week === d.week);
    const done = dayDone(d), total = d.tasks.length;
    const mins = d.tasks.reduce((s, t) => s + (t.minutes || 0), 0);
    const date = state.startDate ? parseISO(addDays(state.startDate, n - 1)).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "";
    return `
      <div class="day-head">
        <div>
          <div class="muted">Week ${w.week}: ${esc(w.title)}${date ? " · " + date : ""}</div>
          <h1>Day ${n}: ${esc(d.title)}</h1>
          <div class="muted">${done}/${total} done · about ${fmtMin(mins)} total</div>
        </div>
        <div class="day-nav">
          <a class="btn" href="#/day/${Math.max(1, n - 1)}" ${n === 1 ? 'aria-disabled="true"' : ""}>← Day ${Math.max(1, n - 1)}</a>
          <a class="btn" href="#/day/${Math.min(TOTAL_DAYS, n + 1)}">Day ${Math.min(TOTAL_DAYS, n + 1)} →</a>
        </div>
      </div>
      ${d.tasks.map(taskHTML).join("")}
      <h2>Notes for day ${n}</h2>
      <p class="muted" style="margin-top:-6px">Include your one-line agent observation for the day.</p>
      <textarea data-note="${n}" placeholder="What did you learn? What did the agent get right or wrong?">${esc(state.notes[n] || "")}</textarea>
      ${done === total && isToday ? `<div class="banner" style="margin-top:16px">Day complete. ${n < TOTAL_DAYS ? `Want a head start? <a href="#/day/${n + 1}">Preview day ${n + 1}</a>.` : "That's all 6 weeks. Go apply!"}</div>` : ""}
    `;
  }

  function viewToday() {
    if (!state.startDate) {
      return `
        <h1>Welcome. Let's get you ready.</h1>
        <p class="sub">42 days, about 60–120 minutes a day. Pick your start date. The app works out which day you're on, keeps your streak, and saves everything to a file on your Mac.</p>
        <div class="week">
          <label for="start">Start date</label><br>
          <div class="row" style="margin-top:8px"><input type="date" id="start" value="${todayISO()}"><button class="btn primary" id="start-btn">Start the plan</button></div>
        </div>
        <h2>How each day works</h2>
        <ol class="list">
          <li>Open <b>Today</b>. Work through the cards from top to bottom. Each card has steps written for someone who hasn't built an AI app before.</li>
          <li><b>Build</b> cards include copy-paste code or a ready-made prompt for Claude Code.</li>
          <li><b>Video</b> cards play right here in the app.</li>
          <li>Tick each card when it's done, and write one line in the day's notes.</li>
        </ol>`;
    }
    const sched = scheduledDay();
    const next = firstUnfinishedDay();
    const behind = next < sched;
    const show = behind ? next : sched;
    const total = ALL_TASKS.length, doneN = ALL_TASKS.filter((t) => isDone(t.id)).length;
    return `
      <div class="stats">
        <div class="stat"><div class="v">Day ${sched}<span class="muted" style="font-size:14px"> / ${TOTAL_DAYS}</span></div><div class="l">on the calendar</div></div>
        <div class="stat"><div class="v">${pctAll()}%</div><div class="l">${doneN} of ${total} tasks done</div></div>
        <div class="stat"><div class="v">${streak()}🔥</div><div class="l">day streak</div></div>
        <div class="stat"><div class="v">${fmtMin(minutesLeft())}</div><div class="l">of work left</div></div>
      </div>
      ${behind ? `<div class="banner warn">You're on calendar day ${sched}, but day ${next} still has open tasks. Showing day ${next}. <a href="#/day/${sched}">Jump to day ${sched}</a> instead.</div>` : ""}
      ${dayView(show, true)}`;
  }

  function viewPlan() {
    const sched = state.startDate ? scheduledDay() : 0;
    return `
      <h1>6-week plan</h1>
      <p class="sub">Click any day to open it. Green means every task for that day is done.</p>
      ${WEEKS.map((w) => {
        const tasks = w.days.flatMap((d) => d.tasks);
        const p = Math.round((tasks.filter((t) => isDone(t.id)).length / tasks.length) * 100);
        return `<section class="week">
          <div class="week-head"><h2 style="margin:0">Week ${w.week}: ${esc(w.title)}</h2><span class="muted">${p}%</span></div>
          <p class="muted" style="margin:6px 0 0">${esc(w.goal)}</p>
          <div class="bar"><span style="width:${p}%"></span></div>
          <div class="days">${w.days.map((d) => {
            const dn = dayDone(d), tot = d.tasks.length;
            return `<a href="#/day/${d.day}" class="daycell ${dn === tot ? "complete" : ""} ${d.day === sched ? "today" : ""}">
              <span class="n">Day ${d.day}</span><span>${esc(d.title)}</span>
              <span class="mini"><span style="width:${(dn / tot) * 100}%"></span></span></a>`;
          }).join("")}</div>
        </section>`;
      }).join("")}`;
  }

  function viewVideos() {
    const usedOn = {};
    ALL_TASKS.forEach((t) => { if (t.video) usedOn[t.video] = t.day; });
    return `
      <h1>Videos</h1>
      <p class="sub">They play inside the app. Your watched status syncs with the matching day's task.</p>
      <div class="grid-cards">${Object.entries(VIDEOS).map(([k, v]) => `
        <div class="vcard">
          <img src="https://i.ytimg.com/vi/${esc(v.youtubeId)}/hqdefault.jpg" alt="" data-play="${esc(k)}" loading="lazy">
          <div class="vb">
            <div class="vt">${esc(v.title)}</div>
            <div class="muted" style="font-size:13px">${esc(v.speaker)} · ${fmtMin(v.minutes)}${usedOn[k] ? ` · <a href="#/day/${usedOn[k]}">Day ${usedOn[k]}</a>` : ""}</div>
            <div class="muted" style="font-size:13px">${esc(v.why)}</div>
            <div class="vf">${state.videos[k] ? `<span class="pill-ok">✓ Watched</span>` : "<span></span>"}<button class="btn primary small" data-play="${esc(k)}">▶ Play</button></div>
          </div>
        </div>`).join("")}</div>`;
  }

  function viewProject() {
    const P = window.PROJECT;
    const msTask = (id) => ALL_TASKS.find((t) => t.milestone === id);
    return `
      <h1>Project: ${esc(P.name)}</h1>
      <p class="sub">${esc(P.pitch)}</p>
      <section class="week"><h2 style="margin-top:0">Guarantees it must keep</h2>
        <ul class="list">${P.guarantees.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
        <p class="muted"><b>Stack:</b> ${esc(P.stack)}</p></section>
      <section class="week"><h2 style="margin-top:0">Milestones</h2>
        ${P.milestones.map((m) => { const t = msTask(m.id); const d = t && isDone(t.id); return `
          <div class="milestone"><span>${d ? "✅" : "⬜️"}</span><div style="flex:1"><b>${m.id.toUpperCase()}</b> · ${esc(m.title)}</div><a class="btn small" href="#/day/${m.day}">Day ${m.day}</a></div>`; }).join("")}
      </section>
      <section class="week"><h2 style="margin-top:0">How to work on it</h2>
        <ul class="list">${P.howToWork.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></section>`;
  }

  function viewInterview() {
    const areas = [...new Set(window.INTERVIEW.map((q) => q.area))];
    const done = window.INTERVIEW.filter((q) => state.interview[q.id]).length;
    return `
      <h1>Interview prep</h1>
      <p class="sub">${done}/${window.INTERVIEW.length} practiced. Answer out loud, then write a 3-bullet outline. Tick a question once you can answer it in under 3 minutes.</p>
      ${areas.map((a) => `<h2>${esc(a)}</h2>${window.INTERVIEW.filter((q) => q.area === a).map((q) => `
        <div class="qrow">
          <input type="checkbox" class="check" data-iq="${esc(q.id)}" ${state.interview[q.id] ? "checked" : ""} aria-label="Practiced">
          <div><div class="area">${esc(q.area)}</div><div>${esc(q.q)}</div>
            <textarea data-iqnote="${esc(q.id)}" placeholder="Your answer outline">${esc(state.interviewNotes[q.id] || "")}</textarea></div>
        </div>`).join("")}`).join("")}`;
  }

  function viewResources() {
    return `<h1>Resources</h1><p class="sub">Everything the plan links to, in one place.</p>
      ${window.RESOURCES.map((g) => `<section class="week"><h2 style="margin-top:0">${esc(g.group)}</h2>
        <ul class="list">${g.items.map((i) => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a></li>`).join("")}</ul></section>`).join("")}`;
  }

  function viewSettings() {
    return `<h1>Settings</h1>
      <section class="week"><h2 style="margin-top:0">Start date</h2>
        <p class="muted">Changing it moves which day counts as "today". Your ticks are kept.</p>
        <div class="row"><input type="date" id="start" value="${esc(state.startDate || todayISO())}"><button class="btn primary" id="start-btn">Save start date</button></div></section>
      <section class="week"><h2 style="margin-top:0">Your data</h2>
        <p class="muted">${serverOk ? "Progress is saved to <code>data/progress.json</code> in the app folder, and also cached in this browser." : "The local server isn't reachable, so progress is only saved in this browser. Start the app with <code>./start.command</code> to save to disk."}</p>
        <div class="row"><button class="btn" id="export">Export backup (.json)</button>
          <label class="btn">Import backup<input type="file" id="import" accept="application/json" hidden></label>
          <button class="btn danger" id="reset">Reset all progress</button></div></section>`;
  }

  /* ---------------- video modal ---------------- */

  let currentVideo = null;
  function openVideo(key) {
    const v = VIDEOS[key]; if (!v) return;
    currentVideo = key;
    const m = document.getElementById("video-modal");
    document.getElementById("vm-title").textContent = v.title;
    document.getElementById("vm-speaker").textContent = `${v.speaker} · ${fmtMin(v.minutes)}`;
    document.getElementById("vm-why").textContent = v.why;
    document.getElementById("vm-yt").href = `https://www.youtube.com/watch?v=${v.youtubeId}`;
    document.getElementById("vm-iframe").src = `https://www.youtube-nocookie.com/embed/${v.youtubeId}?rel=0&modestbranding=1&autoplay=1`;
    updateWatchedBtn();
    m.hidden = false;
    document.getElementById("vm-close").focus();
  }
  function closeVideo() {
    document.getElementById("video-modal").hidden = true;
    document.getElementById("vm-iframe").src = "about:blank";
    currentVideo = null;
  }
  function updateWatchedBtn() {
    const b = document.getElementById("vm-watched");
    const w = !!state.videos[currentVideo];
    b.textContent = w ? "✓ Watched" : "Mark watched";
    b.classList.toggle("primary", !w);
  }
  function setVideoWatched(key, watched) {
    state.videos[key] = watched;
    // Keep the matching day task in sync.
    ALL_TASKS.filter((t) => t.video === key).forEach((t) => setTask(t.id, watched, false));
  }

  /* ---------------- mutations ---------------- */

  function setTask(id, done, alsoVideo = true) {
    const was = isDone(id);
    if (was === done) return;
    if (done) state.tasks[id] = { done: true, at: todayISO() };
    else delete state.tasks[id];
    logActivity(done ? 1 : -1);
    const t = ALL_TASKS.find((x) => x.id === id);
    if (alsoVideo && t && t.video) state.videos[t.video] = done;
  }

  /* ---------------- router + events ---------------- */

  function route() {
    const h = location.hash.replace(/^#\/?/, "") || "today";
    const [name, arg] = h.split("/");
    let html;
    switch (name) {
      case "plan": html = viewPlan(); break;
      case "day": { const n = Math.min(TOTAL_DAYS, Math.max(1, parseInt(arg, 10) || 1)); html = dayView(n, false); break; }
      case "videos": html = viewVideos(); break;
      case "project": html = viewProject(); break;
      case "interview": html = viewInterview(); break;
      case "resources": html = viewResources(); break;
      case "settings": html = viewSettings(); break;
      default: html = viewToday();
    }
    main().innerHTML = html;
    document.querySelectorAll(".sidebar a").forEach((a) => a.classList.toggle("active", a.dataset.route === (name === "day" ? "plan" : name || "today")));
    renderFooter();
  }

  function rerenderKeepScroll() { const y = window.scrollY; route(); window.scrollTo(0, y); }

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.check) { setTask(el.dataset.check, el.checked); save(); rerenderKeepScroll(); if (el.checked) toast("Nice, task done"); }
    else if (el.dataset.iq) { state.interview[el.dataset.iq] = el.checked; save(); }
    else if (el.id === "import" && el.files[0]) {
      el.files[0].text().then((txt) => {
        try { state = merge(blank(), JSON.parse(txt)); save(); route(); toast("Backup imported"); }
        catch { toast("That file isn't a valid backup"); }
      });
    }
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.note) { state.notes[el.dataset.note] = el.value; save(); }
    else if (el.dataset.iqnote) { state.interviewNotes[el.dataset.iqnote] = el.value; save(); }
  });

  document.addEventListener("click", (e) => {
    const el = e.target.closest("button, img, a");
    if (!el) return;
    if (el.dataset.play) { openVideo(el.dataset.play); return; }
    if (el.dataset.toggle !== undefined && el.dataset.toggle) {
      const body = el.closest(".task").querySelector(".task-body");
      body.hidden = !body.hidden;
      el.textContent = body.hidden ? "Details" : "Hide";
      el.setAttribute("aria-expanded", String(!body.hidden));
      return;
    }
    if (el.hasAttribute("data-copy")) {
      const code = el.parentElement.querySelector("code").textContent;
      navigator.clipboard.writeText(code).then(() => { el.textContent = "Copied"; setTimeout(() => (el.textContent = "Copy"), 1200); }, () => toast("Copy failed: select the text manually"));
      return;
    }
    if (el.id === "start-btn") {
      const v = document.getElementById("start").value;
      if (!v) return toast("Pick a date first");
      state.startDate = v; save(); location.hash = "#/today"; route(); toast("Plan started. Day " + scheduledDay());
      return;
    }
    if (el.id === "export") {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `agent-prep-backup-${todayISO()}.json`; a.click();
      URL.revokeObjectURL(a.href); return;
    }
    if (el.id === "reset") {
      if (confirm("Erase all progress, notes and your start date? Export a backup first if unsure.")) { state = blank(); save(); location.hash = "#/today"; route(); }
      return;
    }
    if (el.id === "vm-close") { closeVideo(); return; }
    if (el.id === "vm-watched") {
      setVideoWatched(currentVideo, !state.videos[currentVideo]); save(); updateWatchedBtn(); rerenderKeepScroll(); return;
    }
  });

  document.getElementById("video-modal").addEventListener("click", (e) => { if (e.target.id === "video-modal") closeVideo(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && currentVideo) closeVideo(); });
  window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });

  // Exposed for automated tests only.
  window.__prep = { get state() { return state; }, ALL_TASKS, ALL_DAYS };

  load().then(route);
})();
