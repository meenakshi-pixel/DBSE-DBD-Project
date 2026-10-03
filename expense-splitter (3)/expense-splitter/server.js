const express = require("express");
const path = require("path");
const store = require("./db");
const { analyse, CATEGORIES } = require("./analytics");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Lets async route handlers pass errors to Express
const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const find = async (req, res) => {
  const g = await store.getGroup(req.params.id);
  if (!g) res.status(404).json({ error: "Group not found" });
  return g;
};
const bad = (res, msg) => res.status(400).json({ error: msg });

// ---- groups ----
app.get("/api/groups", h(async (req, res) => res.json(await store.listGroups())));

app.post("/api/groups", h(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const budget = Number(req.body.budget);
  const members = [...new Set((req.body.members || []).map(m => String(m).trim()).filter(Boolean))];
  if (!name) return bad(res, "Give the group a name.");
  if (!(budget > 0)) return bad(res, "Budget must be more than 0.");
  if (members.length < 2) return bad(res, "Add at least 2 different members.");
  res.status(201).json({ id: await store.createGroup(name, budget, members) });
}));

app.get("/api/groups/:id", h(async (req, res) => {
  const g = await find(req, res); if (!g) return;
  res.json({ group: g, stats: analyse(g), categories: CATEGORIES });
}));

app.put("/api/groups/:id", h(async (req, res) => {
  const g = await find(req, res); if (!g) return;
  const budget = Number(req.body.budget);
  if (!(budget > 0)) return bad(res, "Budget must be more than 0.");
  await store.setBudget(g.id, budget); res.json({ ok: true });
}));

app.delete("/api/groups/:id", h(async (req, res) => {
  const g = await find(req, res); if (!g) return;
  await store.deleteGroup(g.id); res.json({ ok: true });
}));

// ---- expenses ----
app.post("/api/groups/:id/expenses", h(async (req, res) => {
  const g = await find(req, res); if (!g) return;
  const b = req.body, amount = Number(b.amount), desc = String(b.desc || "").trim().slice(0, 60);
  if (!desc) return bad(res, "Enter what the expense was for.");
  if (!(amount > 0)) return bad(res, "Amount must be more than 0.");
  if (!CATEGORIES.includes(b.category)) return bad(res, "Pick a category.");
  if (!g.members.includes(b.paidBy)) return bad(res, "Pick who paid.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || "")) return bad(res, "Pick a valid date.");

  const s = b.split || { type: "equal" };
  let split;
  if (s.type === "equal") {
    const p = (s.participants || []).filter(m => g.members.includes(m));
    if (!p.length) return bad(res, "Select at least one person to split between.");
    split = { type: "equal", participants: [...new Set(p)] };
  } else if (s.type === "percent" || s.type === "exact") {
    const vals = {};
    for (const m in s.values || {}) if (g.members.includes(m) && Number(s.values[m]) > 0) vals[m] = Number(s.values[m]);
    const total = Object.values(vals).reduce((a, c) => a + c, 0);
    const target = s.type === "percent" ? 100 : amount;
    if (Math.abs(total - target) > 0.01) return bad(res, s.type === "percent" ? `Percentages add up to ${total}, they must add up to 100.` : `Amounts add up to ₹${total}, they must add up to ₹${amount}.`);
    split = { type: s.type, values: vals };
  } else return bad(res, "Unknown split type.");

  await store.addExpense(g.id, { desc, amount, category: b.category, paidBy: b.paidBy, date: b.date, split });
  res.status(201).json({ ok: true });
}));

app.delete("/api/groups/:id/expenses/:eid", h(async (req, res) => {
  const g = await find(req, res); if (!g) return;
  await store.deleteExpense(g.id, req.params.eid); res.json({ ok: true });
}));

app.delete("/api/groups/:id/expenses", h(async (req, res) => {
  const g = await find(req, res); if (!g) return;
  await store.clearExpenses(g.id); res.json({ ok: true });
}));

// ---- members ----
app.post("/api/groups/:id/members", h(async (req, res) => {
  const g = await find(req, res); if (!g) return;
  const name = String(req.body.name || "").trim().slice(0, 40);
  if (!name) return bad(res, "Enter the member's name.");
  if (g.members.some(m => m.toLowerCase() === name.toLowerCase())) return bad(res, `${name} is already in this group.`);
  await store.addMember(g.id, name); res.status(201).json({ ok: true });
}));

app.delete("/api/groups/:id/members/:name", h(async (req, res) => {
  const g = await find(req, res); if (!g) return;
  if (g.members.length <= 2) return bad(res, "A group needs at least 2 members.");
  const r = await store.removeMember(g.id, req.params.name);
  if (r === "missing") return res.status(404).json({ error: "Member not found." });
  if (r === "used") return bad(res, `${req.params.name} is part of existing expenses. Delete those expenses first, or use "Clear all expenses".`);
  res.json({ ok: true });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error. Check the terminal for details." });
});

const PORT = process.env.PORT || 3000;
store.init()
  .then(() => app.listen(PORT, () => console.log(`Expense Splitter running at http://localhost:${PORT}`)))
  .catch(err => { console.error("Could not start. Database error:", err.message); process.exit(1); });
