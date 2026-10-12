import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Source } from "../lib/types";

/** Turns [1] / [1, 2] markers into clickable citation chips. */
function linkCitations(text: string) {
  return text.replace(/[\[【](\d+(?:\s*,\s*\d+)*)[\]】]/g, (_, g: string) =>
    g.split(",").map((n) => `[${n.trim()}](#cite-${n.trim()})`).join(""));
}

export default function Markdown({ text, sources, onCite, streaming }: {
  text: string; sources?: Source[]; onCite?: (n: number) => void; streaming?: boolean;
}) {
  return (
    <div className={`prose prose-sm max-w-none break-words dark:prose-invert prose-p:leading-relaxed ${streaming ? "opacity-95" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const m = href?.match(/^#cite-(\d+)$/);
            if (m) {
              const n = Number(m[1]);
              const ok = !!sources && n >= 1 && n <= sources.length;
              return <button type="button" className="cite" title={ok ? `${sources![n - 1].filename} · p.${sources![n - 1].page}` : ""} onClick={() => ok && onCite?.(n)}>{n}</button>;
            }
            return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
          },
          table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
        }}
      >{linkCitations(text)}</ReactMarkdown>
    </div>
  );
}
