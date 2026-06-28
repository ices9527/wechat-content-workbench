export function MarkdownPreview({ markdown }: { markdown: string }) {
  const blocks = markdown.split("\n").filter((line) => line.trim().length > 0);
  return (
    <div className="markdown-preview">
      {blocks.map((line, index) => {
        if (line.startsWith("# ")) {
          return <h1 key={index}>{line.slice(2)}</h1>;
        }
        if (line.startsWith("## ")) {
          return <h2 key={index}>{line.slice(3)}</h2>;
        }
        if (line.startsWith("- ")) {
          return <p key={index}>• {line.slice(2)}</p>;
        }
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}
