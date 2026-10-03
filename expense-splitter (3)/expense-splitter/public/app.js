const $ = id => document.getElementById(id);
const inr = n => "₹" + Math.round(n).toLocaleString("en-IN");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const PAL = {
  yellow: ["#f2b705", "#1f2433", "#f08c00", "#e64980", "#9aa1ad", "#3b5bdb"],
  pink: ["#db2777", "#1f2433", "#f59f00", "#7048e8", "#9aa1ad", "#0ca678"]
};
let colors = PAL.yellow, groups = [], gid = null, data = null, charts = {}, cuts = {};

async function api(url, opt = {}) {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opt });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong. Try again.");
  return j;
}
const post = (u, b) => api(u, { method: "POST", body: JSON.stringify(b) });
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const say = (el, text, ok) => { el.textContent = text; el.className = "msg " + (ok ? "ok" : "err"); };

async function loadGroups(select) {
  groups = await api("/api/groups");
  if (select) gid = select;
  if (!groups.find(g => g.id === gid)) gid = groups[0] && groups[0].id;
  $("group-select").innerHTML = groups.map(g => `<option value="${g.id}" ${g.id === gid ? "selected" : ""}>${esc(g.name)}</option>`).join("");
  $("dash").hidden = !gid;
  $("budget").disabled = !gid;
  $("del-group").hidden = !gid;
  if (gid) await loadGroup(); else { $("title").textContent = "No groups yet"; $("subtitle").textContent = "Create your first group below to start tracking expenses."; }
}
async function loadGroup() { data = await api("/api/groups/" + gid); fillForms(); render(); }

function fillForms() {
  const g = data.group;
  $("f-cat").innerHTML = data.categories.map(c => `<option>${c}</option>`).join("");
  const bc = data.stats.byCategory;
  $("sim-grid").innerHTML = data.categories.map(c => `<label class="simrow"><span>${c}<small>${inr(bc[c] || 0)} this month</small></span><b id="cut-${c}">${cuts[c] || 0}%</b><input type="range" min="0" max="100" step="5" value="${cuts[c] || 0}" data-cat="${c}" aria-label="Cut ${c} by percent"></label>`).join("");
  $("f-by").innerHTML = g.members.map(m => `<option>${esc(m)}</option>`).join("");
  $("f-date").value = todayISO();
  renderSplit();
}
function renderSplit() {
  const t = $("f-split").value;
  $("split-box").innerHTML = data.group.members.map(m => t === "equal"
    ? `<label class="chk"><input type="checkbox" value="${esc(m)}" checked> ${esc(m)}</label>`
    : `<label>${esc(m)} ${t === "percent" ? "(%)" : "(₹)"}<input type="number" min="0" step="any" data-m="${esc(m)}"></label>`).join("");
}

function chart(key, canvas, cfg) {
  if (!charts[key]) charts[key] = new Chart($(canvas), cfg);
  return charts[key];
}

function render() {
  const { group: g, stats: s } = data;
  $("title").textContent = g.name;
  $("subtitle").textContent = `Day ${s.dayNow} of ${s.daysInMonth} · ${g.members.length} members`;
  $("budget").value = g.budget;
  $("k-spent").textContent = inr(s.spent);
  $("k-left").textContent = inr(s.remaining);
  $("k-proj").textContent = inr(s.projected);
  const st = $("k-status"); st.textContent = s.willOverrun ? "Likely to overshoot" : "On track"; st.className = "badge " + (s.willOverrun ? "b-warn" : "b-ok");

  // what-if simulator: any number of categories can be cut at once
  const rate = s.spent / s.dayNow, left = s.daysInMonth - s.dayNow;
  let cutRate = 0;
  data.categories.forEach(c => { cutRate += ((s.byCategory[c] || 0) / s.dayNow) * (cuts[c] || 0) / 100; });
  const projSim = s.spent + (rate - cutRate) * left;
  const anyCut = data.categories.some(c => cuts[c] > 0);
  const nt = $("sim-note"); nt.className = "note" + (projSim > g.budget ? " warn" : "");
  nt.textContent = !anyCut
    ? "Move the sliders to see how cutting spending changes your month-end total."
    : projSim > g.budget
      ? `With these cuts you'd save about ${inr(s.projected - projSim)} but still end ${inr(projSim - g.budget)} over budget. Try bigger cuts.`
      : `With these cuts you'd save about ${inr(s.projected - projSim)} and finish with ${inr(g.budget - projSim)} to spare (projected ${inr(projSim)}).`;

  // charts
  const ac = css("--accent"), ink = css("--ink"), grid = css("--line"), warn = css("--warn");
  Chart.defaults.font.family = "Manrope, system-ui, sans-serif"; Chart.defaults.color = css("--muted");
  const labels = Array.from({ length: s.daysInMonth }, (_, i) => i + 1);
  const runNow = s.cumulative[s.dayNow - 1] || 0;
  const dotted = labels.map(d => d < s.dayNow ? null : d === s.dayNow ? runNow : left ? Math.round(runNow + (projSim - runNow) * (d - s.dayNow) / left) : null);
  const kfmt = v => "₹" + v / 1000 + "k";
  const burn = chart("burn", "c-burn", { type: "line", data: { labels, datasets: [] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, scales: { x: { grid: { display: false }, title: { display: true, text: "Day of month" } }, y: { grid: { color: grid }, ticks: { callback: kfmt } } }, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => c.dataset.label + ": " + inr(c.parsed.y) } } } } });
  burn.data.labels = labels;
  burn.data.datasets = [
    { label: "Spent", data: s.cumulative, borderColor: ac, backgroundColor: ac + "22", fill: true, tension: .25, pointRadius: 0, borderWidth: 3 },
    { label: "Projected", data: dotted, borderColor: projSim > g.budget ? warn : ac, borderDash: [6, 5], tension: .25, pointRadius: 0, borderWidth: 2 },
    { label: "Budget", data: labels.map(() => g.budget), borderColor: ink, borderWidth: 1, borderDash: [2, 3], pointRadius: 0 }
  ];
  burn.update();

  const cats = data.categories;
  const cat = chart("cat", "c-cat", { type: "doughnut", data: { labels: cats, datasets: [{ data: [], backgroundColor: colors, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => c.label + ": " + inr(c.parsed) } } } } });
  cat.data.datasets[0].data = cats.map(c => s.byCategory[c]); cat.update();

  const mem = chart("mem", "c-mem", { type: "bar", data: { labels: [], datasets: [{ label: "Paid", data: [], backgroundColor: colors[0], borderRadius: 6 }, { label: "Fair share", data: [], backgroundColor: colors[1], borderRadius: 6 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { grid: { color: grid }, ticks: { callback: kfmt } } }, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => c.dataset.label + ": " + inr(c.parsed.y) } } } } });
  mem.data.labels = g.members; mem.data.datasets[0].data = g.members.map(m => s.paid[m]); mem.data.datasets[1].data = g.members.map(m => s.owed[m]); mem.update();

  // settle up, members, expenses
  $("settle-list").innerHTML = s.settlements.length
    ? s.settlements.map(t => `<li><span><b>${esc(t.from)}</b> pays <b>${esc(t.to)}</b></span><b>${inr(t.amount)}</b></li>`).join("")
    : `<li class="empty">Everyone is settled. Add an expense to see who owes whom.</li>`;
  $("mem-body").innerHTML = g.members.map(m => { const b = s.balances[m]; return `<tr><td>${esc(m)}</td><td class="n">${inr(s.paid[m])}</td><td class="n">${inr(s.owed[m])}</td><td class="n"><span class="badge ${b >= 0 ? "b-ok" : "b-warn"}">${b >= 0 ? "gets back " : "owes "}${inr(Math.abs(b))}</span></td><td><button class="del" data-member="${esc(m)}">Remove</button></td></tr>`; }).join("");
  const desc = { equal: "Equal", percent: "Percent", exact: "Exact" };
  $("ex-body").innerHTML = g.expenses.length ? [...g.expenses].sort((a, b) => b.date.localeCompare(a.date)).map(e =>
    `<tr><td>${e.date}</td><td>${esc(e.desc)}</td><td>${e.category}</td><td>${esc(e.paidBy)}</td><td>${desc[e.split.type]}</td><td class="n">${inr(e.amount)}</td><td>${s.anomalies.includes(e.id) ? '<span class="badge b-warn">Unusually high</span> ' : ""}<button class="del" data-id="${e.id}">Delete</button></td></tr>`).join("")
    : `<tr><td colspan="7" class="empty">No expenses yet. Add your first one above.</td></tr>`;
}

// ---- events ----
$("group-select").addEventListener("change", e => { gid = e.target.value; cuts = {}; loadGroup(); });
$("budget").addEventListener("change", async e => {
  try { await api("/api/groups/" + gid, { method: "PUT", body: JSON.stringify({ budget: +e.target.value }) }); await loadGroup(); }
  catch (err) { say($("msg"), err.message); await loadGroup(); }
});
$("sim-grid").addEventListener("input", e => {
  const c = e.target.dataset && e.target.dataset.cat; if (!c) return;
  cuts[c] = +e.target.value; $("cut-" + c).textContent = cuts[c] + "%"; render();
});
$("sim-reset").addEventListener("click", () => { cuts = {}; fillForms(); render(); });
$("f-split").addEventListener("change", renderSplit);

$("form").addEventListener("submit", async e => {
  e.preventDefault();
  const type = $("f-split").value, split = { type };
  if (type === "equal") split.participants = [...$("split-box").querySelectorAll("input:checked")].map(i => i.value);
  else { split.values = {}; $("split-box").querySelectorAll("input").forEach(i => { if (+i.value > 0) split.values[i.dataset.m] = +i.value; }); }
  try {
    await post(`/api/groups/${gid}/expenses`, { desc: $("f-desc").value, amount: +$("f-amt").value, category: $("f-cat").value, paidBy: $("f-by").value, date: $("f-date").value, split });
    await loadGroup(); say($("msg"), "Expense saved.", true);
    $("f-desc").value = ""; $("f-amt").value = "";
  } catch (err) { say($("msg"), err.message); }
});

$("ex-body").addEventListener("click", async e => {
  const id = e.target.dataset && e.target.dataset.id; if (!id) return;
  await api(`/api/groups/${gid}/expenses/${id}`, { method: "DELETE" }); loadGroup();
});

$("gform").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    const r = await post("/api/groups", { name: $("g-name").value, budget: +$("g-budget").value, members: $("g-members").value.split(",") });
    $("gform").reset(); say($("gmsg"), "Group created.", true);
    await loadGroups(r.id); window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) { say($("gmsg"), err.message); }
});

$("del-group").addEventListener("click", async () => {
  if (!confirm("Delete this group and all its expenses? This can't be undone.")) return;
  await api("/api/groups/" + gid, { method: "DELETE" }); gid = null; await loadGroups();
});

$("mem-body").addEventListener("click", async e => {
  const name = e.target.dataset && e.target.dataset.member; if (!name) return;
  if (!confirm(`Remove ${name} from this group?`)) return;
  try { await api(`/api/groups/${gid}/members/${encodeURIComponent(name)}`, { method: "DELETE" }); say($("mmsg"), `${name} removed.`, true); await loadGroup(); }
  catch (err) { say($("mmsg"), err.message); }
});
$("mform").addEventListener("submit", async e => {
  e.preventDefault();
  try { await post(`/api/groups/${gid}/members`, { name: $("m-name").value }); $("mform").reset(); await loadGroup(); say($("mmsg"), "Member added.", true); }
  catch (err) { say($("mmsg"), err.message); }
});
$("clear-ex").addEventListener("click", async () => {
  if (!confirm("Delete ALL expenses in this group? This can't be undone.")) return;
  await api(`/api/groups/${gid}/expenses`, { method: "DELETE" }); await loadGroup();
});

document.querySelectorAll("[data-pal]").forEach(b => b.addEventListener("click", () => {
  const k = b.dataset.pal; document.documentElement.dataset.palette = k; colors = PAL[k];
  document.querySelectorAll("[data-pal]").forEach(x => x.setAttribute("aria-pressed", x === b));
  Object.values(charts).forEach(c => c.destroy()); charts = {}; if (data) render();
}));
document.querySelectorAll("nav a").forEach(a => a.addEventListener("click", () => { document.querySelectorAll("nav a").forEach(x => x.classList.remove("on")); a.classList.add("on"); }));

loadGroups().catch(err => { $("title").textContent = "Can't reach the server"; $("subtitle").textContent = err.message + " Make sure `npm start` is running."; });
