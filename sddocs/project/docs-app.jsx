// Main docs app — shell, sidebar, topbar, command palette, theme

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---------- Sidebar tree ----------
const TreeItem = ({ node, depth = 0, currentPage, onNavigate }) => {
  const hasChildren = node.children && node.children.length > 0;
  const [expanded, setExpanded] = useState(!!node.expanded);
  const isCurrent = currentPage && node.page === currentPage;

  const kindLetter = node.kind; // C, P, M, S, A
  const kindColor =
    {
      C: "var(--syn-type)", // class
      P: "var(--syn-attr)", // property
      M: "var(--syn-fn)", // method
      S: "var(--syn-kw)", // static
      A: "var(--syn-str)", // attribute
    }[kindLetter] || "var(--text-faint)";

  const handleClick = () => {
    if (hasChildren) {
      setExpanded((e) => !e);
    }
    if (node.page) {
      onNavigate(node.page, node.anchor);
    } else if (node.anchor) {
      const el = document.getElementById(node.anchor);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  return (
    <>
      <button
        type="button"
        className={
          "tree-node " +
          (expanded ? "expanded " : "") +
          (isCurrent ? "active " : "") +
          (kindLetter === "M" ? "is-method" : "")
        }
        onClick={handleClick}
      >
        {hasChildren ? (
          <span className="chev">
            <Icon.Chev />
          </span>
        ) : (kindLetter ? (
          <span
            style={{
              alignItems: "center",
              background:
                "color-mix(in srgb, " + kindColor + " 12%, transparent)",
              border:
                "1px solid color-mix(in srgb, " +
                kindColor +
                " 25%, transparent)",
              borderRadius: 3,
              color: kindColor,
              display: "inline-flex",
              flexShrink: 0,
              fontFamily: "Geist Mono, monospace",
              fontSize: 9.5,
              fontWeight: 600,
              height: 14,
              justifyContent: "center",
              width: 14,
            }}
          >
            {kindLetter}
          </span>
        ) : (
          <span className="leaf-dot" />
        ))}
        <span
          className="label"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.label}
        </span>
      </button>
      {hasChildren && expanded && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              currentPage={currentPage}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </>
  );
};

const Sidebar = ({ currentPage, onNavigate }) => (
  <aside className="sidebar">
    {SIDEBAR.map((section) => (
      <div className="section" key={section.title}>
        <h4 className="section-title">{section.title}</h4>
        <div className="tree">
          {section.items.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              currentPage={currentPage}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    ))}
    <div style={{ height: 60 }} />
  </aside>
);

// ---------- Top bar ----------
const Topbar = ({
  onOpenSearch,
  theme,
  onToggleTheme,
  currentPage,
  onNavigate,
}) => (
  <header className="topbar">
    <a href="index.html" className="brand">
      <span className="mark">/</span>
      <span>s&amp;box docs</span>
      <span className="ver">v0.4.2</span>
    </a>
    <nav className="top-nav">
      <a
        href="#"
        className={currentPage === "tut-component" ? "" : "active"}
        onClick={(e) => {
          e.preventDefault();
          onNavigate("component");
        }}
      >
        Reference
      </a>
      <a
        href="#"
        className={currentPage === "tut-component" ? "active" : ""}
        onClick={(e) => {
          e.preventDefault();
          onNavigate("tut-component");
        }}
      >
        Tutorials
      </a>
      <a href="index.html">MCP</a>
      <a href="#">Changelog</a>
    </nav>
    <div className="top-spacer" />
    <button className="search-trigger" onClick={onOpenSearch}>
      <Icon.Search />
      <span className="placeholder">Search reference, tutorials…</span>
      <span className="kbd">⌘</span>
      <span className="kbd">K</span>
    </button>
    <div className="top-tools">
      <button className="icon-btn" onClick={onToggleTheme} title="Toggle theme">
        {theme === "dark" ? <Icon.Sun /> : <Icon.Moon />}
      </button>
      <a
        className="icon-btn"
        href="#"
        title="GitHub"
        target="_blank"
        rel="noreferrer"
      >
        <Icon.Github />
      </a>
    </div>
  </header>
);

// ---------- Command palette ----------
const TYPE_ICONS = {
  attr: "A",
  class: "C",
  guide: "→",
  method: "M",
  prop: "P",
  static: "S",
};
const TYPE_LABELS = {
  attr: "Attribute",
  class: "Class",
  guide: "Guide",
  method: "Method",
  prop: "Property",
  static: "Static",
};

const fuzzyScore = (query, name, path) => {
  if (!query) {
    return 0;
  }
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  const p = path.toLowerCase();
  if (n === q) {
    return 1000;
  }
  if (n.startsWith(q)) {
    return 800;
  }
  if (n.includes(q)) {
    return 600;
  }
  if (p.includes(q)) {
    return 400;
  }
  // subsequence
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) {
      qi++;
    }
  }
  if (qi === q.length) {
    return 200;
  }
  return 0;
};

const CommandPalette = ({ open, onClose, onSelect }) => {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) {
      // Default groups when empty
      const groups = [
        {
          items: SEARCH_INDEX.filter((s) => ["class"].includes(s.type)).slice(
            0,
            6
          ),
          label: "Jump to",
        },
        {
          items: SEARCH_INDEX.filter((s) => s.type === "guide").slice(0, 4),
          label: "Tutorials",
        },
      ];
      return { flat: groups.flatMap((g) => g.items), grouped: groups };
    }
    const scored = SEARCH_INDEX.map((item) => ({
      item,
      score: fuzzyScore(query, item.name, item.path),
    }))
      .filter((s) => s.score > 0)
      .toSorted((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((s) => s.item);
    return { flat: scored, grouped: [{ items: scored, label: "Results" }] };
  }, [query]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  // scroll selected into view
  useEffect(() => {
    if (!open) {
      return;
    }
    const el = listRef.current?.querySelector(".cmdk-item.selected");
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selected, open]);

  const handleKey = useCallback(
    (e) => {
      if (!open) {
        return;
      }
      const { flat } = results;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, flat.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = flat[selected];
        if (it) {
          onSelect(it);
          onClose();
        }
      }
    },
    [open, results, selected, onSelect, onClose]
  );

  if (!open) {
    return null;
  }

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <Icon.Search />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search reference, tutorials, members…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            autoFocus
          />
          <span className="esc">ESC</span>
        </div>
        <div className="cmdk-results" ref={listRef}>
          {results.flat.length === 0 ? (
            <div className="cmdk-empty">
              No matches for "{query}". Try a class name, method, or topic.
            </div>
          ) : (
            results.grouped.map((g, gi) => {
              // Compute base index of this group in flat list
              let base = 0;
              for (let i = 0; i < gi; i++) {
                base += results.grouped[i].items.length;
              }
              return (
                <div key={g.label}>
                  <div className="cmdk-group-label">{g.label}</div>
                  {g.items.map((item, ii) => {
                    const idx = base + ii;
                    return (
                      <div
                        key={item.path + item.name}
                        className={
                          "cmdk-item " + (idx === selected ? "selected" : "")
                        }
                        onMouseEnter={() => setSelected(idx)}
                        onClick={() => {
                          onSelect(item);
                          onClose();
                        }}
                      >
                        <span className="icon">{TYPE_ICONS[item.type]}</span>
                        <span className="label">
                          <span
                            style={{ color: "var(--text)", fontWeight: 500 }}
                          >
                            {item.name}
                          </span>
                          <span className="path">{item.path}</span>
                        </span>
                        <span className="kind-chip">
                          {TYPE_LABELS[item.type]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
        <div className="cmdk-footer">
          <span className="hint">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> navigate
          </span>
          <span className="hint">
            <span className="kbd">↵</span> select
          </span>
          <span className="hint">
            <span className="kbd">esc</span> close
          </span>
          <span style={{ flex: 1 }} />
          <span
            style={{ alignItems: "center", display: "inline-flex", gap: 6 }}
          >
            <Icon.Sparkle />
            <span>{SEARCH_INDEX.length} indexed</span>
          </span>
        </div>
      </div>
    </div>
  );
};

// ---------- Table of contents ----------
const TOC = ({ items, activeId }) => (
  <aside className="toc">
    <div className="label">On this page</div>
    <ul>
      {items.map((it) => (
        <li key={it.id}>
          <a
            href={"#" + it.id}
            className={activeId === it.id ? "active" : ""}
            style={{ paddingLeft: it.depth === 2 ? 20 : 10 }}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(it.id);
              if (el) {
                window.scrollTo({ behavior: "smooth", top: el.offsetTop - 64 });
                history.replaceState(null, "", "#" + it.id);
              }
            }}
          >
            {it.label}
          </a>
        </li>
      ))}
    </ul>
  </aside>
);

const TOC_COMPONENT = [
  { depth: 1, id: "properties", label: "Properties" },
  { depth: 2, id: "prop-GameObject", label: "GameObject" },
  { depth: 2, id: "prop-Transform", label: "Transform" },
  { depth: 2, id: "prop-Enabled", label: "Enabled" },
  { depth: 2, id: "prop-Active", label: "Active" },
  { depth: 1, id: "methods", label: "Methods" },
  { depth: 2, id: "method-OnAwake", label: "OnAwake" },
  { depth: 2, id: "method-OnStart", label: "OnStart" },
  { depth: 2, id: "method-OnUpdate", label: "OnUpdate" },
  { depth: 2, id: "method-GetComponent", label: "GetComponent<T>" },
  { depth: 1, id: "events", label: "Events" },
  { depth: 1, id: "example", label: "Example" },
];

const TOC_TUTORIAL = [
  { depth: 1, id: "tut-step-1", label: "1. Create the script" },
  { depth: 1, id: "tut-step-2", label: "2. Expose a property" },
  { depth: 1, id: "tut-step-3", label: "3. Rotate the transform" },
  { depth: 1, id: "tut-step-4", label: "4. React to input" },
  { depth: 1, id: "tut-step-5", label: "Next steps" },
];

// ---------- App ----------
const App = () => {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("sbox-theme") || "dark";
    } catch {
      return "dark";
    }
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState("component"); // 'component' or 'tut-component'
  const [activeToc, setActiveToc] = useState("properties");

  // theme persistence
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("sbox-theme", theme);
    } catch {}
  }, [theme]);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // scrollspy for TOC
  useEffect(() => {
    const ids = (
      currentPage === "tut-component" ? TOC_TUTORIAL : TOC_COMPONENT
    ).map((t) => t.id);
    const onScroll = () => {
      let cur = ids[0];
      for (const id of ids) {
        const el = document.querySelector(`#${id}`);
        if (!el) {
          continue;
        }
        if (el.getBoundingClientRect().top < 120) {
          cur = id;
        }
      }
      setActiveToc(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [currentPage]);

  const handleNavigate = useCallback((page, anchor) => {
    // map sidebar page ids to our two real pages; everything else is a stub showing Component
    if (page === "tut-component") {
      setCurrentPage("tut-component");
    } else {
      setCurrentPage("component");
    }
    // scroll to anchor or top
    requestAnimationFrame(() => {
      if (anchor) {
        const el = document.querySelector(`#${anchor}`);
        if (el) {
          window.scrollTo({ behavior: "smooth", top: el.offsetTop - 64 });
        }
      } else {
        window.scrollTo({ behavior: "smooth", top: 0 });
      }
    });
  }, []);

  const handleSearchSelect = useCallback(
    (item) => {
      handleNavigate(item.page, item.anchor);
    },
    [handleNavigate]
  );

  const tocItems =
    currentPage === "tut-component" ? TOC_TUTORIAL : TOC_COMPONENT;

  return (
    <>
      <div className="docs-shell">
        <Topbar
          onOpenSearch={() => setSearchOpen(true)}
          theme={theme}
          onToggleTheme={() =>
            setTheme((t) => (t === "dark" ? "light" : "dark"))
          }
          currentPage={currentPage}
          onNavigate={handleNavigate}
        />
        <Sidebar currentPage={currentPage} onNavigate={handleNavigate} />
        <main>
          {currentPage === "tut-component" ? (
            <TutorialComponentPage />
          ) : (
            <ComponentPage />
          )}
        </main>
        <TOC items={tocItems} activeId={activeToc} />
      </div>
      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSearchSelect}
      />
    </>
  );
};

const root = ReactDOM.createRoot(document.querySelector("#root"));
root.render(<App />);
