import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export default function MarkdownRenderer({ content }) {
  return (
    <div className="markdown-content min-w-0 text-sm leading-7 text-white/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-6 mb-4 text-2xl font-bold tracking-tight text-white first:mt-0">
              {children}
            </h1>
          ),

          h2: ({ children }) => (
            <h2 className="mt-6 mb-3 border-b border-white/10 pb-2 text-xl font-semibold text-white">
              {children}
            </h2>
          ),

          h3: ({ children }) => (
            <h3 className="mt-5 mb-2 text-lg font-semibold text-violet-200">
              {children}
            </h3>
          ),

          p: ({ children }) => (
            <p className="mb-4 leading-7 last:mb-0">{children}</p>
          ),

          ul: ({ children }) => (
            <ul className="mb-4 ml-5 list-disc space-y-2 marker:text-violet-400">
              {children}
            </ul>
          ),

          ol: ({ children }) => (
            <ol className="mb-4 ml-5 list-decimal space-y-2 marker:font-semibold marker:text-violet-400">
              {children}
            </ol>
          ),

          li: ({ children }) => (
            <li className="pl-1 leading-7">{children}</li>
          ),

          strong: ({ children }) => (
            <strong className="font-semibold text-white">{children}</strong>
          ),

          em: ({ children }) => (
            <em className="text-violet-200">{children}</em>
          ),

          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-4 border-violet-500 bg-violet-500/5 py-2 pl-4 pr-3 text-white/75">
              {children}
            </blockquote>
          ),

          hr: () => <hr className="my-6 border-white/10" />,

          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-100 border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),

          thead: ({ children }) => (
            <thead className="bg-violet-500/15 text-white">
              {children}
            </thead>
          ),

          th: ({ children }) => (
            <th className="border-b border-white/10 px-4 py-3 font-semibold">
              {children}
            </th>
          ),

          td: ({ children }) => (
            <td className="border-b border-white/10 px-4 py-3 text-white/80">
              {children}
            </td>
          ),

          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-violet-300 underline decoration-violet-300/40 underline-offset-4 hover:text-violet-200"
            >
              {children}
            </a>
          ),

          pre: ({ children }) => (
            <pre className="my-4 max-w-full overflow-x-auto rounded-xl border border-white/10 bg-[#101014] p-4 text-sm leading-6">
              {children}
            </pre>
          ),

          code: ({ className, children }) => {
            const isBlock =
              Boolean(className) || String(children).includes("\n");

            return (
              <code
                className={
                  isBlock
                    ? `${className || ""} font-mono text-violet-200`
                    : "rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 font-mono text-violet-200"
                }
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
}