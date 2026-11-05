import { Sparkles, FileText, Network, HelpCircle } from "lucide-react";

const cards = [
  { text: "Summarize last week's lectures", icon: FileText },
  { text: "Connect concepts across my notes", icon: Network },
  { text: "Quiz me on Unit 2", icon: HelpCircle },
];

export default function Welcome({ onPick }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6 pb-24">
      {/* glowing logo */}
      <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-400 to-violet-600 shadow-[0_0_40px_rgba(168,85,247,0.6)]">
        <Sparkles size={28} />
      </div>

      <p className="mb-2 text-xl text-white/50">Welcome to NoteFusion AI</p>
      <h1 className="mb-12 text-center text-5xl font-light tracking-tight">
        What would you like to revise?
      </h1>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map(({ text, icon: Icon }) => (
          <button
            key={text}
            onClick={() => onPick(text)}
            className="flex h-28 flex-col justify-between rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-sm text-white/70 hover:bg-white/10 hover:text-white"
          >
            {text}
            <Icon size={20} className="text-white/50" />
          </button>
        ))}
      </div>
    </div>
  );
}
