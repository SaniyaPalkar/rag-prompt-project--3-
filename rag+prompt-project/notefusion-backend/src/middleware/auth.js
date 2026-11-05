import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { config } from "../config.js";
import { User } from "../models/User.js";

const COOKIE = "nf_token";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// httpOnly: JavaScript in the page cannot read the token, which limits damage from XSS.
// sameSite=lax: the browser will not send it on cross-site POSTs, which blocks CSRF.
const cookieOptions = { httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/" };

export const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role });

export function setAuthCookie(res, userId) {
  const token = jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: "7d" });
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: WEEK_MS });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE, cookieOptions);
}

// Authentication: who is this? Sets req.user from a verified token and a database lookup,
// so a deleted account stops working immediately. Everything downstream uses req.user.id
// and never an id sent by the client.
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: "Please log in" });

  let sub;
  try {
    ({ sub } = jwt.verify(token, config.jwtSecret));
  } catch {
    return res.status(401).json({ error: "Your session expired. Please log in again." });
  }
  if (!mongoose.isValidObjectId(sub)) return res.status(401).json({ error: "Please log in" });

  try {
    const user = await User.findById(sub).lean();
    if (!user) return res.status(401).json({ error: "Please log in" });
    req.user = publicUser(user);
    next();
  } catch (err) {
    next(err);
  }
}

// Authorization by role, for admin-only routes: router.get("/x", requireAuth, requireRole("admin"), ...)
export const requireRole = (role) => (req, res, next) =>
  req.user?.role === role ? next() : res.status(403).json({ error: "You do not have permission to do that" });