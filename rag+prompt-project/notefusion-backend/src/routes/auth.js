import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { User } from "../models/User.js";
import { publicUser, setAuthCookie, clearAuthCookie, requireAuth } from "../middleware/auth.js";

const router = Router();

// slows down password guessing
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// compared against when the email is unknown, so response time does not reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

router.post("/register", limiter, async (req, res, next) => {
  try {
    // String() stops objects like {"$gt": ""} from reaching the database query (NoSQL injection)
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!name || name.length > 60) return res.status(400).json({ error: "Enter your name (up to 60 characters)" });
    if (!EMAIL_RE.test(email) || email.length > 120) return res.status(400).json({ error: "Enter a valid email address" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    if (password.length > 72) return res.status(400).json({ error: "Password must be 72 characters or fewer" });

    const passwordHash = await bcrypt.hash(password, 10);
    let user;
    try {
      user = await User.create({ name, email, passwordHash });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: "An account with this email already exists" });
      throw err;
    }

    setAuthCookie(res, user._id);
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post("/login", limiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const user = await User.findOne({ email }).select("+passwordHash").lean();
    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: "Invalid email or password" });

    setAuthCookie(res, user._id);
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

export default router;