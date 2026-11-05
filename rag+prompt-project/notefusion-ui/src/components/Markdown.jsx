
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Styles for each markdown element, so answers look like part of the app.
// `node` is dropped from the props so React does not put it on the HTML element.
const components = {
  // big headings are shrunk: this is a chat bubble, not a document
  h1: ({ node, ...p }) => <h3 className="mb-2 mt-4 text-[15px] font-semibold text-white first:mt-0" {...p} />,
  h2: ({ node, ...p }) => <h3 className="mb-2 mt-4 text-[15px] font-semibold text-white first:mt-0" {...p} />,
  h3: ({ node, ...p }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold text-white first:mt-0" {...p} />,
  h4: ({ node, ...p }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold text-white first:mt-0" {...p} />,
  p: ({ node, ...p }) => <p className="my-2 first:mt-0 last:mb-0" {...p} />,
  ul: ({ node, ...p }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-violet-300" {...p} />,
  ol: ({ node, ...p }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-violet-300" {...p} />,
  li: ({ node, ...p }) => <li className="pl-0.5 [&>ol]:my-1 [&>ul]:my-1" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold text-white" {...p} />,
  em: ({ node, ...p }) => <em className="italic" {...p} />,
  a: ({ node, ...p }) => (
    <a className="text-violet-300 underline hover:text-violet-200" target="_blank" rel="noreferrer" {...p} />
  ),
  hr: ({ node, ...p }) => <hr className="my-3 border-white/10" {...p} />,
  blockquote: ({ node, ...p }) => (
    <blockquote className="my-2 border-l-2 border-violet-400/60 pl-3 text-white/70" {...p} />
  ),
  pre: ({ node, ...p }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed" {...p} />
  ),
  code: ({ node, className, children, ...p }) => {
    const isBlock = /language-/.test(className || "") || String(children).includes("\n");
    return isBlock ? (
      <code className={`font-mono ${className || ""}`} {...p}>
        {children}
      </code>
    ) : (
      <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em] text-violet-100" {...p}>
        {children}
      </code>
    );
  },
  // wide tables scroll sideways inside the bubble instead of breaking the layout
  table: ({ node, ...p }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px]" {...p} />
    </div>
  ),
  th: ({ node, ...p }) => <th className="border-b border-white/20 px-3 py-1.5 font-medium text-white" {...p} />,
  td: ({ node, ...p }) => <td className="border-b border-white/10 px-3 py-1.5" {...p} />,
};

export default function Markdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}