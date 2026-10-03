// Core logic: split rules, budget projection, anomaly detection, debt settlement.
const CATEGORIES = ["Food", "Stay", "Travel", "Fun", "Shopping", "Other"];
const r2 = n => Math.round(n * 100) / 100;

// How much each member owes for one expense, based on its split rule.
function sharesOf(e, members) {
  const out = Object.fromEntries(members.map(m => [m, 0]));
  const s = e.split || { type: "equal" };
  if (s.type === "percent") for (const m in s.values) out[m] = (e.amount * s.values[m]) / 100;
  else if (s.type === "exact") for (const m in s.values) out[m] = s.values[m];
  else {
    const p = s.participants && s.participants.length ? s.participants : members;
    p.forEach(m => (out[m] += e.amount / p.length));
  }
  return out;
}

// Greedy settlement: fewest payments that clear every balance.
function settle(balances) {
  const cr = [], db = [];
  for (const m in balances) {
    if (balances[m] > 0.5) cr.push({ m, v: balances[m] });
    else if (balances[m] < -0.5) db.push({ m, v: -balances[m] });
  }
  cr.sort((a, b) => b.v - a.v); db.sort((a, b) => b.v - a.v);
  const out = []; let i = 0, j = 0;
  while (i < db.length && j < cr.length) {
    const x = Math.min(db[i].v, cr[j].v);
    out.push({ from: db[i].m, to: cr[j].m, amount: r2(x) });
    db[i].v -= x; cr[j].v -= x;
    if (db[i].v < 0.5) i++;
    if (cr[j].v < 0.5) j++;
  }
  return out;
}

function analyse(g, now = new Date()) {
  const y = now.getFullYear(), mo = now.getMonth(), dayNow = now.getDate();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const parts = e => e.date.split("-").map(Number); // [Y, M, D]
  const inMonth = g.expenses.filter(e => { const [Y, M] = parts(e); return Y === y && M === mo + 1; });

  const byCategory = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  const perDay = Array(daysInMonth + 1).fill(0);
  let spent = 0;
  inMonth.forEach(e => { byCategory[e.category] += e.amount; perDay[parts(e)[2]] += e.amount; spent += e.amount; });

  let run = 0;
  const cumulative = [];
  for (let d = 1; d <= daysInMonth; d++) { run += perDay[d]; cumulative.push(d <= dayNow ? r2(run) : null); }

  const rate = spent / dayNow;
  const projected = spent + rate * (daysInMonth - dayNow);

  // Balances across ALL expenses (settling is not limited to one month)
  const paid = Object.fromEntries(g.members.map(m => [m, 0]));
  const owed = Object.fromEntries(g.members.map(m => [m, 0]));
  g.expenses.forEach(e => {
    paid[e.paidBy] += e.amount;
    const sh = sharesOf(e, g.members);
    for (const m in sh) owed[m] += sh[m];
  });
  const balances = Object.fromEntries(g.members.map(m => [m, r2(paid[m] - owed[m])]));

  // Unusual expense: more than 2.5x the average of the others in its category
  const anomalies = [];
  g.expenses.forEach(e => {
    const others = g.expenses.filter(x => x.category === e.category && x.id !== e.id);
    if (others.length >= 2 && e.amount > 2.5 * (others.reduce((s, x) => s + x.amount, 0) / others.length)) anomalies.push(e.id);
  });

  return {
    spent: r2(spent), budget: g.budget, remaining: r2(g.budget - spent),
    projected: r2(projected), willOverrun: projected > g.budget,
    dayNow, daysInMonth, byCategory, cumulative,
    paid: Object.fromEntries(Object.entries(paid).map(([k, v]) => [k, r2(v)])),
    owed: Object.fromEntries(Object.entries(owed).map(([k, v]) => [k, r2(v)])),
    balances, settlements: settle(balances), anomalies
  };
}

module.exports = { analyse, settle, sharesOf, CATEGORIES };
