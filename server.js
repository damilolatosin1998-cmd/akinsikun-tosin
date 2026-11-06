// server.js
const express = require("express");
const cookieSession = require("cookie-session");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-please";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const ROOT = __dirname;
const UPLOADS = path.join(ROOT, "uploads");
const PAGE = path.join(ROOT, "index.html");
const STATE_FILE = path.join(ROOT, "state.json");

if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS);

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(cookieSession({
  name: "sess",
  secret: SESSION_SECRET,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
}));

// ---------- auth ----------
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: "unauthorized" });
}

app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "wrong password" });
});

app.post("/api/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  res.json({ admin: !!(req.session && req.session.admin) });
});

// ---------- state ----------
function seedStateIfMissing() {
  if (fs.existsSync(STATE_FILE)) return;
  const html = fs.readFileSync(PAGE, "utf8");
  const m = html.match(/<script id="state" type="application\/json">([\s\S]*?)<\/script>/);
  if (m) fs.writeFileSync(STATE_FILE, m[1], "utf8");
}
seedStateIfMissing();

app.get("/api/state", (req, res) => {
  res.type("application/json").send(fs.readFileSync(STATE_FILE, "utf8"));
});

app.post("/api/state", requireAuth, (req, res) => {
  fs.writeFileSync(STATE_FILE, JSON.stringify(req.body), "utf8");
  res.json({ ok: true });
});

// ---------- uploads ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => {
      const id = crypto.randomBytes(12).toString("hex");
      const ext = path.extname(file.originalname).toLowerCase() || ".bin";
      cb(null, id + ext);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.post("/api/upload", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  res.json({
    id: path.basename(req.file.filename),
    url: "/uploads/" + req.file.filename,
    name: req.file.originalname,
  });
});

app.use("/uploads", express.static(UPLOADS, { maxAge: "30d" }));

// ---------- serve the page ----------
app.get(["/", "/index.html"], (req, res) => {
  let html = fs.readFileSync(PAGE, "utf8");
  const state = fs.readFileSync(STATE_FILE, "utf8");
  html = html.replace(
    /(<script id="state" type="application\/json">)[\s\S]*?(<\/script>)/,
    (_, a, b) => a + state + b
  );
  res.type("html").send(html);
});

/* ▼ CHANGED: bind to 0.0.0.0 so phones on the same Wi-Fi can reach it */
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running:");
  console.log("  Local:   http://localhost:" + PORT);
  console.log("  Network: http://<your-computer-ip>:" + PORT + "  (find it with `ipconfig`)");
  console.log("  Admin:   append #admin to the URL, or press Ctrl+Shift+A");
});