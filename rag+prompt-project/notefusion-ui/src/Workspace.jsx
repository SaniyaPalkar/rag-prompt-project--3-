
import { useState, useRef, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Welcome from "./components/Welcome";
import InputBar from "./components/InputBar";
import GraphView from "./components/GraphView";
import LibraryView from "./components/LibraryView";
import Markdown from "./components/Markdown";
import { Volume2, VolumeX, Loader2, X } from "lucide-react";
import { sendChat, uploadFiles, getChat, getModels } from "./api";

export default function Workspace({ user, onLogout }) {
  const [view, setView] = useState("chat"); // "chat" | "library" | "graph"
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [models, setModels] = useState([]); // installed Ollama models (or OpenRouter choices)
  const [model, setModel] = useState("");
  const [chatId, setChatId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [statusBusy, setStatusBusy] = useState(false); // show a spinner while a file is processing
  const statusTimer = useRef(null);
  const [refreshKey, setRefreshKey] = useState(0); // tells the sidebar to reload chats and library
  const [collapsed, setCollapsed] = useState(false); // sidebar collapsed to an icon rail
  const [speakingIdx, setSpeakingIdx] = useState(null); // which answer is being read aloud
  const speakToken = useRef(0);
  const bottomRef = useRef(null);

  const refreshSidebar = () => setRefreshKey((k) => k + 1);

  // ---- read answers aloud (browser speech synthesis)
  const stopSpeaking = () => {
    speakToken.current++;
    window.speechSynthesis?.cancel();
    setSpeakingIdx(null);
  };

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const toggleSpeak = (idx, text) => {
    if (!("speechSynthesis" in window)) {
      flash("Reading aloud is not supported in this browser.");
      return;
    }
    if (speakingIdx === idx) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    const token = speakToken.current;
    // drop citation markers and markdown symbols, then speak sentence by sentence
    // (long single utterances get cut off in some browsers)
    const parts = (text.replace(/\[\d+\]/g, "").replace(/[*#_`>]/g, "").match(/[^.!?\n]+[.!?]*/g) || [])
      .map((s) => s.trim())
      .filter(Boolean);
    parts.forEach((part, k) => {
      const u = new SpeechSynthesisUtterance(part);
      if (k === parts.length - 1) {
        u.onend = () => {
          if (speakToken.current === token) setSpeakingIdx(null);
        };
      }
      window.speechSynthesis.speak(u);
    });
    setSpeakingIdx(idx);
  };

  useEffect(() => {
    getModels()
      .then((d) => {
        setModels(d.models);
        setModel(d.default);
        if (d.error) flash(d.error, 15000);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ms = 0 keeps the message on screen until the user closes it
  const flash = (text, ms = 8000) => {
    clearTimeout(statusTimer.current);
    setStatusBusy(false);
    setStatus(text);
    if (ms) statusTimer.current = setTimeout(() => setStatus(""), ms);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    try {
      const data = await sendChat({ chatId, message: text, model });
      setChatId(data.chatId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, sources: data.sources, concepts: data.concepts },
      ]);
      refreshSidebar();
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error: " + err.message }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFiles = async (files) => {
    if (!files.length) return;
    clearTimeout(statusTimer.current);
    setStatusBusy(true);
    setStatus(`Processing ${files.length} file(s). This can take a minute or more with a local model...`);
    try {
      const data = await uploadFiles(files);
      const docs = data.documents || [];
      const failed = data.errors || [];

      const lines = docs.map(
        (d) => `${d.filename}: ${d.chunkCount} passages indexed, ${d.conceptCount} concepts${d.warning ? `\n  Note: ${d.warning}` : ""}`
      );
      failed.forEach((e) => lines.push(`${e.filename}: failed (${e.error})`));
      const heading = docs.length ? `${docs.length} file(s) added to your library.` : "Nothing was added.";

      // stay on screen until closed when something needs attention
      const needsAttention = failed.length > 0 || docs.some((d) => d.warning);
      flash([heading, ...lines].join("\n"), needsAttention ? 0 : 12000);
      refreshSidebar();
    } catch (err) {
      flash("Upload failed: " + err.message, 0);
    }
  };

  const resetChat = () => {
    stopSpeaking();
    setMessages([]);
    setInput("");
    setChatId(null);
  };

  const handleNewChat = () => {
    resetChat();
    setView("chat");
  };

  const handleSelectChat = async (id) => {
    try {
      const chat = await getChat(id);
      stopSpeaking();
      setMessages(
        chat.messages.map((m) => ({ role: m.role, content: m.content, sources: m.sources, concepts: m.concepts }))
      );
      setChatId(chat.id);
      setInput("");
      setView("chat");
    } catch (err) {
      flash("Could not open that chat: " + err.message);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#17171a] text-white">
      <Sidebar
        view={view}
        onNavigate={setView}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onChatDeleted={resetChat}
        activeChatId={chatId}
        refreshKey={refreshKey}
        collapsed={collapsed}
        user={user}
        onLogout={onLogout}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />

      <main className="relative flex-1 overflow-hidden">
        {/* purple glow, top right */}
        <div className="pointer-events-none absolute -top-40 -right-32 h-[520px] w-[520px] rounded-full bg-purple-500/30 blur-3xl" />

        {status && (
          <div className="absolute left-1/2 top-4 z-10 flex w-[min(40rem,90%)] -translate-x-1/2 items-start gap-3 rounded-xl border border-violet-400/40 bg-[#1c1c20] px-4 py-3 text-sm text-white/85 shadow-lg">
            {statusBusy && <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-violet-300" />}
            <div className="min-w-0 flex-1 whitespace-pre-line break-words">{status}</div>
            {!statusBusy && (
              <button onClick={() => flash("", 0)} title="Dismiss" className="shrink-0 text-white/40 hover:text-white">
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {view === "graph" && <GraphView />}
        {view === "library" && <LibraryView onChanged={refreshSidebar} />}

        {view === "chat" &&
          (messages.length === 0 ? (
            <Welcome onPick={setInput} />
          ) : (
            <div className="relative mx-auto h-full max-w-3xl space-y-6 overflow-y-auto px-6 pb-44 pt-12">
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[85%]">
                    {m.role === "user" ? (
                      <div className="whitespace-pre-wrap rounded-2xl bg-violet-500/20 px-4 py-3 text-sm">{m.content}</div>
                    ) : (
                      <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-white/90">
                        <Markdown>{m.content}</Markdown>
                      </div>
                    )}

                    {m.role === "assistant" && (
                      <button
                        onClick={() => toggleSpeak(i, m.content)}
                        className="mt-1.5 flex items-center gap-1.5 text-xs text-white/40 hover:text-white"
                      >
                        {speakingIdx === i ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        {speakingIdx === i ? "Stop" : "Listen"}
                      </button>
                    )}

                    {m.sources?.length > 0 && (
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {m.sources.map((s) => (
                            <a
                              key={s.n}
                              href={s.fileUrl || "#"}
                              target="_blank"
                              rel="noreferrer"
                              title={s.snippet}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60 hover:text-white"
                            >
                              [{s.n}] {s.filename}
                              {s.via === "graph" ? " (graph link)" : ""}
                            </a>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {m.sources
                            .filter((s) => s.imageUrl)
                            .map((s) => (
                              <a key={"img" + s.n} href={s.imageUrl} target="_blank" rel="noreferrer">
                                <img
                                  src={s.imageUrl}
                                  alt={s.filename}
                                  className="h-24 rounded-lg border border-white/10 object-cover"
                                />
                              </a>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && <div className="text-sm text-white/40">Searching your notes...</div>}
              <div ref={bottomRef} />
            </div>
          ))}

        {view === "chat" && (
          <InputBar
            value={input}
            onChange={setInput}
            onSend={handleSend}
            onFiles={handleFiles}
            onNotice={flash}
            disabled={loading}
            models={models}
            model={model}
            onModelChange={setModel}
          />
        )}
      </main>
    </div>
  );
}