import { useState } from "react";
import { Sparkles, Mail, Lock, User, Eye, EyeOff, Loader2 } from "lucide-react";
import { login, register } from "../api";

function Field({ icon: Icon, right, ...props }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1c1c20] px-3.5 py-3 focus-within:border-violet-400/60">
      <Icon size={16} className="shrink-0 text-white/40" />
      <input {...props} className="w-full bg-transparent text-sm text-white placeholder-white/40 outline-none" />
      {right}
    </label>
  );
}

export default function AuthPage({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const signup = mode === "signup";

  const switchMode = (next) => {
    setMode(next);
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = signup ? await register(name, email, password) : await login(email, password);
      onAuthed(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#17171a] px-4 text-white">
      {/* purple glow, top right */}
      <div className="pointer-events-none absolute -top-40 -right-32 h-[520px] w-[520px] rounded-full bg-purple-500/30 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-400 to-violet-600 shadow-[0_0_40px_rgba(168,85,247,0.6)]">
            <Sparkles size={24} />
          </div>
          <p className="text-sm text-white/50">Welcome to NoteFusion AI</p>
          <h1 className="mt-1 text-3xl font-light tracking-tight">{signup ? "Create your account" : "Log in to continue"}</h1>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#1b1b1f] p-6 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
          {/* tabs */}
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1 text-sm">
            {[
              ["login", "Log in"],
              ["signup", "Sign up"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => switchMode(id)}
                className={`rounded-lg py-2 ${mode === id ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {signup && (
              <Field
                icon={User}
                type="text"
                name="name"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
              />
            )}
            <Field
              icon={Mail}
              type="email"
              name="email"
              autoComplete="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Field
              icon={Lock}
              type={showPw ? "text" : "password"}
              name="password"
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder={signup ? "Password (at least 8 characters)" : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={signup ? 8 : undefined}
              maxLength={72}
              right={
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  title={showPw ? "Hide password" : "Show password"}
                  className="text-white/40 hover:text-white"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            {error && (
              <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 py-3 text-sm font-medium shadow-[0_0_24px_rgba(168,85,247,0.35)] hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {signup ? "Create account" : "Log in"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-white/40">
          Your notes, files and chats are private to your account.
        </p>
      </div>
    </div>
  );
}
