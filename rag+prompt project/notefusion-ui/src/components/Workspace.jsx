import { useState, useRef, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Welcome from "./components/Welcome";
import InputBar from "./components/InputBar";
import GraphView from "./components/GraphView";
import LibraryView from "./components/LibraryView";
import { Volume2, VolumeX } from "lucide-react";
import { sendChat, uploadFiles, getChat } from "./api";
import MarkdownRenderer from "./components/MarkdownRenderer";

export default function Workspace({ user, onLogout }) {
  const [view, setView] = useState("chat"); // "chat" | "library" | "graph"
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("openrouter/free");
  const [chatId, setChatId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
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
    const parts = (
      text
        .replace(/\[\d+\]/g, "")
        .replace(/[*#_`>]/g, "")
        .match(/[^.!?\n]+[.!?]*/g) || []
    )
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const flash = (text, ms = 8000) => {
    setStatus(text);
    setTimeout(() => setStatus(""), ms);
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
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources,
          concepts: data.concepts,
        },
      ]);
      refreshSidebar();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: " + err.message },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleFiles = async (files) => {
    if (!files.length) return;
    setStatus(`Processing ${files.length} file(s). This can take a minute...`);
    try {
      const data = await uploadFiles(files);
      const failed = data.errors || [];
      let msg = `${data.documents?.length || 0} file(s) added to your library.`;
      if (failed.length)
        msg += ` Failed: ${failed.map((e) => `${e.filename} (${e.error})`).join("; ")}`;
      flash(msg, 12000);
      refreshSidebar();
    } catch (err) {
      flash("Upload failed: " + err.message);
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
        chat.messages.map((m) => ({
          role: m.role,
          content: m.content,
          sources: m.sources,
          concepts: m.concepts,
        })),
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
        <div className="pointer-events-none absolute -top-40 -right-32 h-130 w-130 rounded-full bg-purple-500/30 blur-3xl" />

        {status && (
          <div className="absolute left-1/2 top-4 z-10 max-w-xl -translate-x-1/2 rounded-xl border border-violet-400/40 bg-[#1c1c20] px-4 py-2 text-sm text-white/80 shadow-lg">
            {status}
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
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "flex justify-end"
                      : "flex justify-start"
                  }
                >
                  <div className="max-w-[85%]">
                    <div
                      className={
                        m.role === "user"
                          ? "whitespace-pre-wrap rounded-2xl bg-violet-500/20 px-4 py-3 text-sm"
                          : "whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-white/90"
                      }
                    >
                      <div
                        className={
                          m.role === "user"
                            ? "whitespace-pre-wrap rounded-2xl bg-violet-500/20 px-4 py-3 text-sm leading-6"
                            : "rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/90"
                        }
                      >
                        {m.role === "assistant" ? (
                          <MarkdownRenderer content={m.content} />
                        ) : (
                          m.content
                        )}
                      </div>
                    </div>

                    {m.role === "assistant" && (
                      <button
                        onClick={() => toggleSpeak(i, m.content)}
                        className="mt-1.5 flex items-center gap-1.5 text-xs text-white/40 hover:text-white"
                      >
                        {speakingIdx === i ? (
                          <VolumeX size={13} />
                        ) : (
                          <Volume2 size={13} />
                        )}
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
                              <a
                                key={"img" + s.n}
                                href={s.imageUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
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

              {loading && (
                <div className="text-sm text-white/40">
                  Searching your notes...
                </div>
              )}
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
            model={model}
            onModelChange={setModel}
          />
        )}
      </main>
    </div>
  );
}
