# Smart Expense Splitter and Group Budget Management System

Node.js + Express backend, PostgreSQL database, plain HTML/CSS/JS frontend (Chart.js for graphs).

## 1. Set up PostgreSQL (pick one)
**Local:** install PostgreSQL from postgresql.org (remember the password you set for the `postgres` user), then create the database:
`psql -U postgres -c "CREATE DATABASE expense_splitter;"`
(or create a database named `expense_splitter` in pgAdmin).

**Hosted (no install):** create a free database on neon.tech or supabase.com and copy its connection string.

## 2. Configure
Copy `.env.example` to a new file named `.env` and set `DATABASE_URL` (local password, or the hosted connection string).
Set `SEED_SAMPLE_DATA=false` if you want to start with no sample group.

## 3. Run it
1. Install Node.js 18 or newer from nodejs.org.
2. Open this folder in VS Code, then open the terminal (Terminal > New Terminal).
3. Run `npm install`, then `npm start`.
4. Open http://localhost:3000 in your browser.

The tables are created automatically on first start from `schema.sql`.
You need an internet connection for the charts and font (they load from a CDN).

## Database (see schema.sql)
- `expense_groups` (id, name, budget, created_at)
- `members` (id, group_id -> expense_groups, name), unique per group
- `expenses` (id, group_id -> expense_groups, description, amount, category, paid_by -> members, expense_date, split_type)
- `expense_splits` (expense_id -> expenses, member_id -> members, value): who an expense is split between
Foreign keys use ON DELETE CASCADE, so deleting a group removes its members, expenses and splits.
Inspect the data with pgAdmin, or the "PostgreSQL" / "Database Client" extension in VS Code.

## Folder structure
- `server.js`: REST API and input validation
- `db.js`: all SQL queries
- `schema.sql`: table definitions
- `analytics.js`: split rules, budget projection, unusual-expense detection, settlement
- `public/`: the dashboard (index.html, styles.css, app.js)
- `.env`: your database connection (never share or upload this file)

## API
- `GET /api/groups`, `POST /api/groups`
- `GET /api/groups/:id` (group + analytics), `PUT /api/groups/:id` (budget), `DELETE /api/groups/:id`
- `POST /api/groups/:id/expenses`, `DELETE /api/groups/:id/expenses/:expenseId`
