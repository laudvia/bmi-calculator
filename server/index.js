const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const crypto = require("crypto");

dotenv.config();

const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL. Copy server/.env.example to server/.env and set DATABASE_URL.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function sql(q, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(q, params);
  } finally {
    client.release();
  }
}

function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role, name: user.name || "" },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer (.+)$/i);
  if (!m) return res.status(401).json({ ok: false, message: "Unauthorized" });

  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "Invalid token" });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ ok: false, message: "Forbidden" });
  }
  next();
}

async function ensureSchema() {
  // create tables if not exist (for non-docker usage)
  await sql(`
    CREATE TABLE IF NOT EXISTS users (
      id            BIGSERIAL PRIMARY KEY,
      name          TEXT NOT NULL DEFAULT '',
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Backward compatible: add 'name' for existing schemas
  await sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT ''`);
  await sql(`
    CREATE TABLE IF NOT EXISTS bmi_history (
      id         TEXT PRIMARY KEY,
      user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      at         TIMESTAMPTZ NOT NULL,
      weight_kg  NUMERIC(6,2) NOT NULL,
      height_cm  NUMERIC(6,2) NOT NULL,
      bmi        NUMERIC(6,2) NOT NULL,
      category   TEXT NOT NULL
    );
  `);
  await sql(`CREATE INDEX IF NOT EXISTS idx_bmi_history_user_at ON bmi_history(user_id, at DESC);`);
}

async function ensureAdminUser() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = (process.env.ADMIN_PASSWORD || "").trim();
  if (!email || !password) return;

  const existing = await sql(`SELECT id, email, role FROM users WHERE email=$1`, [email]);
  if (existing.rows.length > 0) {
    const u = existing.rows[0];
    if (u.role !== "admin") {
      await sql(`UPDATE users SET role='admin' WHERE id=$1`, [u.id]);
      console.log("Admin role updated:", email);
    }
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await sql(`INSERT INTO users(email, password_hash, role) VALUES ($1,$2,'admin')`, [email, hash]);
  console.log("Admin user created:", email);
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await sql("SELECT 1 as ok");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: "DB not reachable" });
  }
});

// Auth
app.post("/auth/register", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ ok: false, message: "Некорректные данные." });
  }

  const exists = await sql(`SELECT id FROM users WHERE email=$1`, [email]);
  if (exists.rows.length) {
    return res.status(409).json({ ok: false, message: "Пользователь уже существует." });
  }

  const hash = await bcrypt.hash(password, 10);
  const created = await sql(
    `INSERT INTO users(name, email, password_hash, role) VALUES ($1,$2,$3,'user') RETURNING id, name, email, role`,
    [name, email, hash]
  );

  const user = created.rows[0];
  const token = signToken(user);
  return res.json({ ok: true, token, name: user.name || "", email: user.email, role: user.role });
});

app.post("/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  const q = await sql(`SELECT id, name, email, role, password_hash FROM users WHERE email=$1`, [email]);
  if (!q.rows.length) {
    return res.status(401).json({ ok: false, message: "Неверная почта или пароль." });
  }
  const user = q.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ ok: false, message: "Неверная почта или пароль." });
  }

  const token = signToken(user);
  return res.json({ ok: true, token, name: user.name || "", email: user.email, role: user.role });
});

app.post("/auth/change-password", authRequired, async (req, res) => {
  const newPassword = String(req.body?.newPassword || "");
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ ok: false, message: "Пароль слишком короткий." });
  }
  const userId = Number(req.user.sub);
  const hash = await bcrypt.hash(newPassword, 10);
  await sql(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hash, userId]);
  return res.json({ ok: true });
});

app.get("/me", authRequired, async (req, res) => {
  const userId = Number(req.user.sub);
  const q = await sql(`SELECT id, name, email, role FROM users WHERE id=$1`, [userId]);
  if (!q.rows.length) return res.status(404).json({ ok: false, message: "Пользователь не найден." });
  const u = q.rows[0];
  return res.json({ ok: true, name: u.name || "", email: u.email, role: u.role });
});

// Update profile (name/email)
app.put("/me", authRequired, async (req, res) => {
  const userId = Number(req.user.sub);
  const name = String(req.body?.name || "").trim();
  const emailRaw = String(req.body?.email || "").trim().toLowerCase();

  if (!emailRaw) {
    return res.status(400).json({ ok: false, message: "Email не может быть пустым." });
  }
  // Minimal email format check
  if (!/^\S+@\S+\.[A-Za-z]{2,}$/.test(emailRaw)) {
    return res.status(400).json({ ok: false, message: "Некорректный email." });
  }

  const current = await sql(`SELECT id, name, email, role FROM users WHERE id=$1`, [userId]);
  if (!current.rows.length) return res.status(404).json({ ok: false, message: "Пользователь не найден." });

  if (emailRaw !== current.rows[0].email) {
    const exists = await sql(`SELECT id FROM users WHERE email=$1 AND id<>$2`, [emailRaw, userId]);
    if (exists.rows.length) {
      return res.status(409).json({ ok: false, message: "Такой email уже используется." });
    }
  }

  const updated = await sql(
    `UPDATE users SET name=$1, email=$2 WHERE id=$3 RETURNING id, name, email, role`,
    [name, emailRaw, userId]
  );
  const user = updated.rows[0];
  const token = signToken(user);
  return res.json({ ok: true, token, name: user.name || "", email: user.email, role: user.role });
});

// History (per-user)
app.get("/history", authRequired, async (req, res) => {
  const userId = Number(req.user.sub);
  const q = await sql(
    `SELECT id, at, weight_kg, height_cm, bmi, category
     FROM bmi_history
     WHERE user_id=$1
     ORDER BY at DESC
     LIMIT 50`,
    [userId]
  );
  const items = q.rows.map((r) => ({
    id: r.id,
    at: new Date(r.at).toISOString(),
    weightKg: Number(r.weight_kg),
    heightCm: Number(r.height_cm),
    bmi: Number(r.bmi),
    category: String(r.category),
  }));
  return res.json({ ok: true, items });
});

app.post("/history", authRequired, async (req, res) => {
  const userId = Number(req.user.sub);
  const at = req.body?.at ? new Date(req.body.at) : new Date();
  const weightKg = Number(req.body?.weightKg);
  const heightCm = Number(req.body?.heightCm);
  const bmi = Number(req.body?.bmi);
  const category = String(req.body?.category || "");

  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || !Number.isFinite(bmi) || !category) {
    return res.status(400).json({ ok: false, message: "Некорректные данные." });
  }

  const id = crypto.randomUUID();
  await sql(
    `INSERT INTO bmi_history(id, user_id, at, weight_kg, height_cm, bmi, category)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, userId, at, weightKg, heightCm, bmi, category]
  );

  // return fresh list
  const q = await sql(
    `SELECT id, at, weight_kg, height_cm, bmi, category
     FROM bmi_history WHERE user_id=$1 ORDER BY at DESC LIMIT 50`,
    [userId]
  );
  const items = q.rows.map((r) => ({
    id: r.id,
    at: new Date(r.at).toISOString(),
    weightKg: Number(r.weight_kg),
    heightCm: Number(r.height_cm),
    bmi: Number(r.bmi),
    category: String(r.category),
  }));
  return res.json({ ok: true, items });
});

app.delete("/history", authRequired, async (req, res) => {
  const userId = Number(req.user.sub);
  await sql(`DELETE FROM bmi_history WHERE user_id=$1`, [userId]);
  return res.json({ ok: true, items: [] });
});

// Admin minimal
app.get("/admin/users", authRequired, adminOnly, async (_req, res) => {
  const q = await sql(`SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 200`);
  return res.json({ ok: true, users: q.rows });
});

app.get("/admin/history/:userId", authRequired, adminOnly, async (req, res) => {
  const userId = Number(req.params.userId);
  const q = await sql(
    `SELECT id, at, weight_kg, height_cm, bmi, category
     FROM bmi_history WHERE user_id=$1 ORDER BY at DESC LIMIT 50`,
    [userId]
  );
  return res.json({ ok: true, items: q.rows });
});

(async () => {
  try {
    await ensureSchema();
    await ensureAdminUser();

    app.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error("Failed to start server:", e);
    process.exit(1);
  }
})();
