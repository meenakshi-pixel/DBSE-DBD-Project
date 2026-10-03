// PostgreSQL database layer (pg). All SQL lives here.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool, types } = require("pg");

types.setTypeParser(1700, Number); // NUMERIC -> JS number
types.setTypeParser(1082, v => v); // DATE -> "YYYY-MM-DD" string

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (text, params) => pool.query(text, params).then(r => r.rows);
const id = () => crypto.randomUUID();

async function tx(fn) {
  const c = await pool.connect();
  try { await c.query("BEGIN"); const r = await fn(c); await c.query("COMMIT"); return r; }
  catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}

async function init() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing. Copy .env.example to .env and fill it in.");
  await pool.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  if (process.env.SEED_SAMPLE_DATA !== "false") await seedIfEmpty();
}

async function listGroups() {
  return (await q("SELECT id, name FROM expense_groups ORDER BY created_at")).map(g => ({ id: g.id, name: g.name }));
}

// Rebuilds the plain object shape that analytics.js expects.
async function getGroup(gid) {
  const g = (await q("SELECT id, name, budget FROM expense_groups WHERE id = $1", [gid]))[0];
  if (!g) return undefined;
  const members = await q("SELECT id, name FROM members WHERE group_id = $1 ORDER BY id", [gid]);
  const names = {}; members.forEach(m => (names[m.id] = m.name));
  const splits = {};
  (await q("SELECT es.expense_id, es.member_id, es.value FROM expense_splits es JOIN expenses e ON e.id = es.expense_id WHERE e.group_id = $1", [gid]))
    .forEach(r => (splits[r.expense_id] ??= []).push(r));
  const rows = await q("SELECT id, description, amount, category, paid_by, expense_date, split_type FROM expenses WHERE group_id = $1 ORDER BY expense_date, created_at", [gid]);
  const expenses = rows.map(e => {
    const sp = splits[e.id] || [];
    const split = e.split_type === "equal"
      ? { type: "equal", participants: sp.map(r => names[r.member_id]) }
      : { type: e.split_type, values: Object.fromEntries(sp.map(r => [names[r.member_id], r.value])) };
    return { id: e.id, desc: e.description, amount: e.amount, category: e.category, paidBy: names[e.paid_by], date: e.expense_date, split };
  });
  return { id: g.id, name: g.name, budget: g.budget, members: members.map(m => m.name), expenses };
}

async function createGroup(name, budget, memberNames) {
  const gid = id();
  await tx(async c => {
    await c.query("INSERT INTO expense_groups (id, name, budget) VALUES ($1, $2, $3)", [gid, name, budget]);
    for (const m of memberNames) await c.query("INSERT INTO members (group_id, name) VALUES ($1, $2)", [gid, m]);
  });
  return gid;
}

async function setBudget(gid, budget) { await q("UPDATE expense_groups SET budget = $1 WHERE id = $2", [budget, gid]); }
async function deleteGroup(gid) { await q("DELETE FROM expense_groups WHERE id = $1", [gid]); }

async function addExpense(gid, e) {
  const eid = id();
  await tx(async c => {
    const mid = {};
    (await c.query("SELECT id, name FROM members WHERE group_id = $1", [gid])).rows.forEach(m => (mid[m.name] = m.id));
    await c.query(
      "INSERT INTO expenses (id, group_id, description, amount, category, paid_by, expense_date, split_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [eid, gid, e.desc, e.amount, e.category, mid[e.paidBy], e.date, e.split.type]);
    const ins = "INSERT INTO expense_splits (expense_id, member_id, value) VALUES ($1, $2, $3)";
    if (e.split.type === "equal") for (const m of e.split.participants) await c.query(ins, [eid, mid[m], 1]);
    else for (const m in e.split.values) await c.query(ins, [eid, mid[m], e.split.values[m]]);
  });
  return eid;
}

async function clearExpenses(gid) { await q("DELETE FROM expenses WHERE group_id = $1", [gid]); }
async function addMember(gid, name) { await q("INSERT INTO members (group_id, name) VALUES ($1, $2)", [gid, name]); }

// Returns "ok", "missing", or "used" (member still appears in expenses).
async function removeMember(gid, name) {
  const m = (await q("SELECT id FROM members WHERE group_id = $1 AND name = $2", [gid, name]))[0];
  if (!m) return "missing";
  const used = await q("SELECT 1 FROM expenses WHERE paid_by = $1 UNION ALL SELECT 1 FROM expense_splits WHERE member_id = $1 LIMIT 1", [m.id]);
  if (used.length) return "used";
  await q("DELETE FROM members WHERE id = $1", [m.id]);
  return "ok";
}

async function deleteExpense(gid, eid) { await q("DELETE FROM expenses WHERE id = $1 AND group_id = $2", [eid, gid]); }

async function seedIfEmpty() {
  if ((await q("SELECT COUNT(*)::int AS n FROM expense_groups"))[0].n > 0) return;
  const t = new Date();
  const day = n => { const d = new Date(t.getFullYear(), t.getMonth(), Math.min(n, t.getDate())); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const members = ["Rohan", "Ananya", "Karthik", "Meera"];
  const gid = await createGroup("Goa Trip", 40000, members);
  const rows = [[1, "Hotel booking", 9000, "Stay", "Rohan"], [2, "Airport cab", 1800, "Travel", "Meera"], [3, "Beach shack lunch", 2400, "Food", "Ananya"],
    [5, "Scooter rental", 1600, "Travel", "Karthik"], [6, "Water sports", 3200, "Fun", "Rohan"], [8, "Seafood dinner", 3100, "Food", "Meera"],
    [10, "Souvenirs", 1500, "Shopping", "Ananya"], [12, "Club entry", 2800, "Fun", "Karthik"], [14, "Breakfast cafe", 1200, "Food", "Rohan"],
    [16, "Cruise tickets", 12800, "Fun", "Ananya"]];
  for (const [d, desc, amount, category, paidBy] of rows)
    await addExpense(gid, { desc, amount, category, paidBy, date: day(d), split: { type: "equal", participants: members } });
}

module.exports = { init, listGroups, getGroup, createGroup, setBudget, deleteGroup, addExpense, deleteExpense, clearExpenses, addMember, removeMember };
