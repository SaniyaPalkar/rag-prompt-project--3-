import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AuthPage from "./components/AuthPage";
import Workspace from "./Workspace";
import { me, logout } from "./api";

// Decides what to show: login page or the app.
export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    me()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));

    // any API call that comes back 401 sends the user to the login page
    const onUnauthorized = () => setUser(null);
    window.addEventListener("nf-unauthorized", onUnauthorized);
    return () => window.removeEventListener("nf-unauthorized", onUnauthorized);
  }, []);

  const handleLogout = async () => {
    await logout().catch(() => {});
    setUser(null);
  };

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#17171a] text-white/50">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!user) return <AuthPage onAuthed={setUser} />;

  // key={user.id}: switching accounts starts the workspace with a clean state
  return <Workspace key={user.id} user={user} onLogout={handleLogout} />;
}