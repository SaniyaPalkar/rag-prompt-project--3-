import { useEffect, useState } from "react";
import {
  Sparkles, Search, PanelLeft, Plus, MessageSquare, Library, Network,
  Pin, PinOff, Trash2, HardDrive, LogOut, X,
} from "lucide-react";
import { getChats, getLibrary, updateChat, deleteChat } from "../api";

const nav = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "library", label: "Library", icon: Library },
  { id: "graph", label: "Knowledge Graph", icon: Network },
];

const KINDS = [
  ["pdf", "PDF", "PDFs"],
  ["image", "photo", "photos"],
  ["audio", "audio recording", "audio recordings"],
  ["text", "text file", "text files"],
];

function groupChats(chats) {
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = dayStart(new Date());
  const DAY = 86400000;
  const groups = { Pinned: [], Today: [], Yesterday: [], Earlier: [] };
  for (const c of chats) {
    if (c.pinned) groups.Pinned.push(c);
    else {
      const t = dayStart(new Date(c.updatedAt));
      if (t >= today) groups.Today.push(c);
      else if (t >= today - DAY) groups.Yesterday.push(c);
      else groups.Earlier.push(c);
    }
  }
  return Object.entries(groups).filter(([, list]) => list.length);
}

export default function Sidebar({
  view, onNavigate, onNewChat, onSelectChat, onChatDeleted, activeChatId, refreshKey, collapsed, onToggleCollapse, user, onLogout,
}) {
  const [chats, setChats] = useState([]);
  const [docs, setDocs] = useState([]);
  const [version, setVersion] = useState(0); // bumped after pin or delete
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getChats(), getLibrary()])
      .then(([c, d]) => {
        if (!cancelled) {
          setChats(c);
          setDocs(d);
        }
      })
      .catch(() => {}); // backend offline: keep what we have
    return () => {
      cancelled = true;
    };
  }, [refreshKey, version]);

  const togglePin = async (e, chat) => {
    e.stopPropagation();
    await updateChat(chat.id, { pinned: !chat.pinned }).catch(() => {});
    setVersion((v) => v + 1);
  };

  const remove = async (e, chat) => {
    e.stopPropagation();
    if (!window.confirm(`Delete the chat "${chat.title}"?`)) return;
    await deleteChat(chat.id).catch(() => {});
    if (chat.id === activeChatId) onChatDeleted();
    setVersion((v) => v + 1);
  };

  const kindSummary = KINDS.map(([kind, one, many]) => {
    const n = docs.filter((d) => d.kind === kind).length;
    return n ? `${n} ${n === 1 ? one : many}` : null;
  })
    .filter(Boolean)
    .join(", ");
  const passages = docs.reduce((sum, d) => sum + (d.chunkCount || 0), 0);

  const term = q.trim().toLowerCase();
  const visible = term ? chats.filter((c) => c.title.toLowerCase().includes(term)) : chats;

  const closeSearch = () => {
    setSearching(false);
    setQ("");
  };

  // slim icon rail when the sidebar is collapsed
  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-white/10 bg-[#1b1b1f] py-4">
        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-400 to-violet-600">
          <Sparkles size={15} />
        </div>
        <button onClick={onToggleCollapse} title="Open sidebar" className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
          <PanelLeft size={18} />
        </button>
        <button
          onClick={() => {
            setSearching(true);
            onToggleCollapse();
          }}
          title="Search chats"
          className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
        >
          <Search size={18} />
        </button>
        <button onClick={onNewChat} title="New chat" className="my-1 rounded-xl border border-violet-400/60 p-2 hover:bg-violet-500/10">
          <Plus size={18} />
        </button>
        <div className="my-1 w-6 border-t border-white/10" />
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            title={label}
            className={`rounded-lg p-2 ${view === id ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
          >
            <Icon size={18} />
          </button>
        ))}
        <button
          onClick={onLogout}
          title={`Log out (${user?.name || ""})`}
          className="mt-auto rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-red-300"
        >
          <LogOut size={18} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-white/10 bg-[#1b1b1f] px-3 py-4">
      {/* logo row */}
      <div className="mb-4 flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-400 to-violet-600">
            <Sparkles size={14} />
          </div>
          <span className="text-sm font-medium">NoteFusion</span>
        </div>
        <div className="flex items-center gap-1 text-white/50">
          <button
            onClick={() => (searching ? closeSearch() : setSearching(true))}
            title="Search chats"
            className={`rounded-lg p-1.5 hover:bg-white/10 hover:text-white ${searching ? "bg-white/10 text-white" : ""}`}
          >
            <Search size={16} />
          </button>
          <button onClick={onToggleCollapse} title="Collapse sidebar" className="rounded-lg p-1.5 hover:bg-white/10 hover:text-white">
            <PanelLeft size={16} />
          </button>
        </div>
      </div>

      {searching && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-[#222226] px-3 py-2">
          <Search size={14} className="shrink-0 text-white/40" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && closeSearch()}
            placeholder="Search your chats"
            className="w-full bg-transparent text-sm outline-none placeholder-white/40"
          />
          <button onClick={closeSearch} title="Close search" className="text-white/40 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* new chat */}
      <button
        onClick={onNewChat}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/60 bg-transparent py-2 text-sm hover:bg-violet-500/10"
      >
        <Plus size={16} /> New Chat
      </button>

      {/* nav */}
      <nav className="mb-4 space-y-1">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm ${
              view === id ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>

      <div className="mb-3 border-t border-white/10" />

      {/* chat history */}
      <div className="sidebar-scroll flex-1 space-y-4 overflow-y-auto pr-1">
        {chats.length === 0 && <p className="px-3 text-xs text-white/30">No chats yet. Ask your first question.</p>}
        {chats.length > 0 && visible.length === 0 && <p className="px-3 text-xs text-white/30">No chats match "{q}".</p>}

        {groupChats(visible).map(([label, list]) => (
          <div key={label}>
            <div className="mb-1 flex items-center gap-1.5 px-3 text-[11px] tracking-wide text-white/40">
              {label === "Pinned" && <Pin size={11} />} {label}
            </div>
            {list.map((chat) => {
              const active = chat.id === activeChatId && view === "chat";
              return (
                <div
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className={`group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] ${
                    active ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white/80"
                  }`}
                >
                  <MessageSquare size={14} className="shrink-0" />
                  <span className="flex-1 truncate">{chat.title}</span>
                  <span className="hidden items-center gap-1.5 group-hover:flex">
                    <button onClick={(e) => togglePin(e, chat)} title={chat.pinned ? "Unpin" : "Pin"} className="hover:text-white">
                      {chat.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                    </button>
                    <button onClick={(e) => remove(e, chat)} title="Delete chat" className="hover:text-red-300">
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* library summary */}
      <button
        onClick={() => onNavigate("library")}
        className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10"
      >
        <div className="mb-1.5 flex items-center gap-2 text-sm">
          <HardDrive size={16} className="text-violet-300" /> Study library
        </div>
        <p className="text-[11px] leading-snug text-white/40">
          {docs.length === 0
            ? "No files yet. Upload notes, PDFs or audio to get started."
            : `${docs.length} ${docs.length === 1 ? "file" : "files"} (${kindSummary}), ${passages} passages indexed.`}
        </p>
      </button>

      {/* user row */}
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg px-2 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/40 text-xs uppercase">
            {user?.name?.[0] || "U"}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm">{user?.name}</div>
            <div className="truncate text-[11px] text-white/40">{user?.email}</div>
          </div>
        </div>
        <button onClick={onLogout} title="Log out" className="shrink-0 rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-red-300">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}