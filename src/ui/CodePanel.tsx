export function CodePanel({
  code,
  activeLine,
}: {
  code: string[];
  activeLine: number | undefined;
}) {
  return (
    <section className="panel code" aria-label="Source code">
      <h3 className="panel-title">Code</h3>
      <ol className="code-lines">
        {code.map((text, i) => {
          const n = i + 1;
          const active = n === activeLine;
          return (
            <li
              key={n}
              className={active ? "active" : ""}
              aria-current={active ? "step" : undefined}
            >
              <span className="ln" aria-hidden="true">
                {n}
              </span>
              <code>{text || " "}</code>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
