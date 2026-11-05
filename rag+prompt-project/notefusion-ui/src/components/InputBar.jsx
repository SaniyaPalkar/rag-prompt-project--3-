import { useEffect, useRef, useState } from "react";
import {
  Wand2, MessageSquare, Image as ImageIcon, Music,
  ChevronDown, Paperclip, Mic, ArrowUp,
} from "lucide-react";

// Browser speech-to-text (Chrome, Edge, Safari). Not available in Firefox.
const SpeechRecognition =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export default function InputBar({ value, onChange, onSend, onFiles, onNotice, disabled, models = [], model, onModelChange }) {
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const baseRef = useRef(""); // text that was in the box when dictation started
  const [listening, setListening] = useState(false);

  useEffect(() => () => recRef.current?.stop(), []);

  const stopListening = () => recRef.current?.stop();

  const toggleMic = () => {
    if (!SpeechRecognition) {
      onNotice?.("Voice input is not supported in this browser. Use Chrome or Edge.");
      return;
    }
    if (listening) {
      stopListening();
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    baseRef.current = value ? value.trimEnd() + " " : "";

    rec.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      onChange(baseRef.current + transcript);
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        onNotice?.("Microphone access is blocked. Allow it in the browser's address bar and try again.");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        onNotice?.("Voice input stopped: " + e.error);
      }
    };
    rec.onend = () => setListening(false);

    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const send = () => {
    stopListening();
    onSend();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleFileChange = (e) => {
    const files = [...e.target.files];
    e.target.value = ""; // allow picking the same file again
    if (files.length) onFiles(files);
  };

  return (
    <div className="absolute bottom-8 left-1/2 w-full max-w-3xl -translate-x-1/2 px-6">
      <div className="rounded-2xl border border-violet-400/60 bg-[#1c1c20] p-4 shadow-[0_0_30px_rgba(168,85,247,0.35)]">
        {/* text row */}
        <div className="mb-4 flex items-center gap-3">
          <Wand2 size={18} className="shrink-0 text-white/50" />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={listening ? "Listening... speak now" : "Ask about your notes, lectures or textbooks..."}
            className="w-full bg-transparent text-sm text-white placeholder-white/40 outline-none"
          />
        </div>

        {/* controls row */}
        <div className="flex items-center justify-between">
          {/* mode icons */}
          <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
            <button className="rounded-md bg-white/10 p-1.5" title="Chat">
              <MessageSquare size={16} />
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-md p-1.5 text-white/50 hover:text-white"
              title="Upload notes photo"
            >
              <ImageIcon size={16} />
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-md p-1.5 text-white/50 hover:text-white"
              title="Upload audio"
            >
              <Music size={16} />
            </button>
          </div>

          {/* right side */}
          <div className="flex items-center gap-3 text-white/60">
            <div className="relative flex items-center">
              <select
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                className="max-w-[10rem] cursor-pointer appearance-none truncate bg-transparent pr-5 text-sm text-white/80 outline-none"
              >
                {models.length === 0 && <option value="">No models found</option>}
                {models.map((m) => (
                  <option key={m.id} value={m.id} className="bg-[#1c1c20]">
                    {m.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-0" />
            </div>

            <button onClick={() => fileRef.current?.click()} title="Attach files" className="hover:text-white">
              <Paperclip size={18} />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept=".pdf,.txt,.md,image/*,audio/*"
              onChange={handleFileChange}
            />

            <button
              onClick={toggleMic}
              title={listening ? "Stop listening" : "Speak your question"}
              className={
                listening
                  ? "animate-pulse rounded-full bg-red-500/20 p-1.5 text-red-300"
                  : "p-1.5 hover:text-white"
              }
            >
              <Mic size={18} />
            </button>

            <button
              onClick={send}
              disabled={disabled}
              className="rounded-lg border border-violet-400/60 bg-violet-500/20 p-2 text-violet-200 hover:bg-violet-500/40 disabled:opacity-40"
              title="Send"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}