// Landing page app

const { useState, useEffect, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  layout: "centered",
  theme: "dark",
} /*EDITMODE-END*/;

// ----- IDE button data -----
const IDES = [
  {
    color: "#007ACC",
    glyph: "<>",
    hint: "Add to settings.json",
    id: "vscode",
    name: "VS Code",
  },
  {
    color: "#0a0a0a",
    glyph: "⌘",
    hint: "One-click install",
    id: "cursor",
    name: "Cursor",
  },
  {
    color: "#C96342",
    glyph: "C",
    hint: "Add to MCP config",
    id: "claude",
    name: "Claude Desktop",
  },
  {
    color: "#0a4d63",
    glyph: "Z",
    hint: "Add to context server",
    id: "zed",
    name: "Zed",
  },
  {
    color: "#0FB5A6",
    glyph: "W",
    hint: "Add to MCP config",
    id: "windsurf",
    name: "Windsurf",
  },
  {
    color: "#7C3AED",
    glyph: "↺",
    hint: "Add via config.json",
    id: "continue",
    name: "Continue",
  },
];

// ----- IDE button component -----
const IdeButton = ({ ide, compact }) => (
  <button className="ide-btn">
    <span className="ide-glyph" style={{ background: ide.color }}>
      {ide.glyph}
    </span>
    <span className="ide-label">
      <span>{compact ? ide.name : `Add to ${ide.name}`}</span>
      {!compact && <small>{ide.hint}</small>}
    </span>
    <svg
      className="arr"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  </button>
);

// ----- Animated terminal -----
const TERM_STEPS = [
  { text: "How do I fade out a sound when the player dies?", type: "me" },
  { text: "Searching the s&box API for sound playback…", type: "ai" },
  { text: 'search_symbols("sound fade")  →  3 results', type: "tool" },
  { text: 'read_member("SoundHandle.Volume")', type: "tool" },
  { text: 'read_tutorial("audio-fades")', type: "tool" },
  {
    text: "Tween SoundHandle.Volume to 0 over the desired duration:",
    type: "ai",
  },
  {
    text: 'var snd = Sound.Play( "death", Transform.Position );\nsnd.Volume.Tween( 0f, 0.5f );',
    type: "code",
  },
];

const Terminal = () => {
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    if (step >= TERM_STEPS.length) {
      // restart loop after pause
      const t = setTimeout(() => {
        setStep(0);
        setTyped("");
      }, 4200);
      return () => clearTimeout(t);
    }
    const cur = TERM_STEPS[step];
    // typewriter for "me" lines, instant for everything else
    if (cur.type === "me") {
      setTyped("");
      let i = 0;
      const id = setInterval(() => {
        i++;
        setTyped(cur.text.slice(0, i));
        if (i >= cur.text.length) {
          clearInterval(id);
          setTimeout(() => setStep((s) => s + 1), 650);
        }
      }, 28);
      return () => clearInterval(id);
    }
    const delay = cur.type === "tool" ? 500 : (cur.type === "code" ? 600 : 700);
    const t = setTimeout(() => setStep((s) => s + 1), delay);
    return () => clearTimeout(t);
  }, [step]);

  return (
    <div className="term" aria-hidden="true">
      <div className="term-head">
        <span className="dots">
          <span />
          <span />
          <span />
        </span>
        <span className="title">~/dev/my-game · claude code</span>
        <span className="right">MCP: sbox-docs</span>
      </div>
      <div className="term-body">
        {TERM_STEPS.slice(0, step).map((s, i) => {
          if (s.type === "me") {
            return (
              <span key={i} className="line me">
                {s.text}
              </span>
            );
          }
          if (s.type === "ai") {
            return (
              <span key={i} className="line ai">
                {s.text}
              </span>
            );
          }
          if (s.type === "tool") {
            return (
              <span key={i} className="line">
                <span className="tool">{s.text}</span>
              </span>
            );
          }
          if (s.type === "code") {
            return (
              <span
                key={i}
                className="line src"
                style={{
                  color: "#e8eaed",
                  display: "block",
                  fontStyle: "normal",
                  marginTop: 6,
                  whiteSpace: "pre",
                }}
              >
                {s.text}
              </span>
            );
          }
          return null;
        })}
        {step < TERM_STEPS.length && TERM_STEPS[step].type === "me" && (
          <span className="line me">
            {typed}
            <span className="cursor" />
          </span>
        )}
      </div>
    </div>
  );
};

// ----- Hero -----
const Hero = ({ layout }) => {
  const Inner = (
    <>
      <span className="badge">
        <span className="dot" />
        <span>
          MCP · <strong>v0.4.2</strong> live
        </span>
      </span>
      <h1>
        <span className="accent">MCP server</span> for the s&amp;box API
        reference.
      </h1>
      <p className="sub">
        Plug the entire s&amp;box documentation — C# API, hand-written
        tutorials, code samples — into your AI assistant. Streamed over stdio,
        indexed for symbol lookup, scoped to your engine version.
      </p>
      <div className="install-row">
        {IDES.slice(0, 4).map((ide) => (
          <IdeButton key={ide.id} ide={ide} compact={layout === "split"} />
        ))}
      </div>
      <div className="or-line">
        <span>or</span>
      </div>
      <div className="copy-cmd">
        <span className="prompt">$</span>
        <span className="cmd">npx @sbox/docs-mcp@latest</span>
        <button title="Copy">
          <Icon.Copy />
        </button>
      </div>
    </>
  );

  if (layout === "split") {
    return (
      <section className={"hero split"}>
        <div className="hero-inner">
          <div>{Inner}</div>
          <Terminal />
        </div>
      </section>
    );
  }
  return (
    <section className={"hero centered"}>
      <div className="hero-inner">{Inner}</div>
      <div
        style={{
          margin: "64px auto 0",
          maxWidth: 920,
          position: "relative",
          zIndex: 1,
        }}
      >
        <Terminal />
      </div>
    </section>
  );
};

// ----- How it works -----
const HowItWorks = () => (
  <section className="section" id="how">
    <div className="section-inner">
      <p className="section-eyebrow">How it works</p>
      <h2>Three pieces. Two of them are already yours.</h2>
      <p className="lede">
        The MCP is a small Node process. Your IDE talks to it over stdio. It
        indexes the entire s&amp;box documentation and exposes typed tools your
        model can call.
      </p>
      <div className="steps">
        <div className="step">
          <span className="num">01</span>
          <h3>Install the server</h3>
          <p>
            Run it under{" "}
            <code
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                fontFamily: "Geist Mono",
                padding: "1px 5px",
              }}
            >
              npx
            </code>{" "}
            or add it to your IDE's MCP config. No accounts, no keys.
          </p>
          <div className="step-code">{`{
  "mcpServers": {
    "sbox-docs": {
      "command": "npx",
      "args": ["@sbox/docs-mcp"]
    }
  }
}`}</div>
        </div>
        <div className="step">
          <span className="num">02</span>
          <h3>Your model gets the tools</h3>
          <p>
            The server advertises five typed tools. The model decides when to
            call them — no prompt engineering required.
          </p>
          <div className="step-code">{`tools:
  search_symbols(query)
  read_class(fqn)
  read_member(fqn)
  read_tutorial(slug)
  list_namespaces()`}</div>
        </div>
        <div className="step">
          <span className="num">03</span>
          <h3>Answers cite the source</h3>
          <p>
            Every response includes the canonical doc URL and the engine version
            it was indexed against. No hallucinated APIs.
          </p>
          <div className="step-code">{`→ Sandbox.SoundHandle.Volume
  docs/sandbox/sound#volume
  indexed: engine 0.4.2`}</div>
        </div>
      </div>
    </div>
  </section>
);

// ----- Features grid -----
const Features = () => (
  <section className="section" style={{ paddingTop: 24 }}>
    <div className="section-inner">
      <p className="section-eyebrow">What it indexes</p>
      <h2>Everything the docs site has, structured for retrieval.</h2>
      <div className="feat-grid">
        <div className="feat">
          <span className="ico">
            <Icon.Box />
          </span>
          <h3>C# API reference</h3>
          <p>
            1,247 classes across{" "}
            <code style={{ fontFamily: "Geist Mono" }}>Sandbox.*</code>, with
            every property, method, event and overload — typed signatures
            included.
          </p>
        </div>
        <div className="feat">
          <span className="ico">
            <Icon.Hash />
          </span>
          <h3>Member-level addressing</h3>
          <p>
            Look up{" "}
            <code style={{ fontFamily: "Geist Mono" }}>Component.OnUpdate</code>{" "}
            directly. No need to fetch a whole page when the model only needs
            one signature.
          </p>
        </div>
        <div className="feat">
          <span className="ico">
            <Icon.File />
          </span>
          <h3>Hand-written tutorials</h3>
          <p>
            Every guide on the docs site is exposed as a tool result with stable
            slug IDs and code samples kept intact.
          </p>
        </div>
        <div className="feat">
          <span className="ico">
            <Icon.Bolt />
          </span>
          <h3>Streaming over stdio</h3>
          <p>
            Standard MCP transport. Works under every host that speaks Model
            Context Protocol — no HTTP server to manage.
          </p>
        </div>
        <div className="feat">
          <span className="ico">
            <Icon.Sparkle />
          </span>
          <h3>Version-pinned</h3>
          <p>
            Indexed per engine release. Tell the server which s&amp;box version
            your project targets and answers stay accurate.
          </p>
        </div>
        <div className="feat">
          <span className="ico">
            <Icon.Plug />
          </span>
          <h3>Local-first</h3>
          <p>
            The index ships with the package. After install, the server runs
            offline. No telemetry, no remote calls.
          </p>
        </div>
      </div>
    </div>
  </section>
);

// ----- Tools detail -----
const Tools = () => (
  <section className="section">
    <div className="section-inner">
      <div className="tools-block">
        <div>
          <p className="section-eyebrow">Tools exposed</p>
          <h2>Five tools. Stable contract.</h2>
          <p className="lede">
            Every tool returns typed JSON with citations. Your model can chain
            them — search, then read, then read a member — without
            round-tripping through your prompt.
          </p>
          <a href="docs.html" className="btn primary">
            Browse the docs <Icon.ArrowRight />
          </a>
        </div>
        <div className="tools-list">
          <div className="tool-row">
            <span className="tname">
              <span className="at">@</span>search_symbols
            </span>
            <span className="tdesc">
              Fuzzy search across classes, methods, properties, attributes and
              tutorial slugs. Returns ranked results with namespace.
            </span>
          </div>
          <div className="tool-row">
            <span className="tname">
              <span className="at">@</span>read_class
            </span>
            <span className="tdesc">
              Full reference page for a class by fully-qualified name. Includes
              inheritance, members grouped by kind, and code examples.
            </span>
          </div>
          <div className="tool-row">
            <span className="tname">
              <span className="at">@</span>read_member
            </span>
            <span className="tdesc">
              A single property, method or event. Signature, parameters, return
              type, remarks, and the canonical URL.
            </span>
          </div>
          <div className="tool-row">
            <span className="tname">
              <span className="at">@</span>read_tutorial
            </span>
            <span className="tdesc">
              A hand-written guide by slug. Markdown body with code samples
              intact. Returns related tutorials in metadata.
            </span>
          </div>
          <div className="tool-row">
            <span className="tname">
              <span className="at">@</span>list_namespaces
            </span>
            <span className="tdesc">
              Tree of all namespaces and their public types. Useful as a first
              call when the model is exploring the surface area.
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ----- Final CTA -----
const FinalCta = () => (
  <section className="section">
    <div className="section-inner">
      <div className="final-cta">
        <p className="section-eyebrow" style={{ justifyContent: "center" }}>
          Ready
        </p>
        <h2>Pick your IDE. Two minutes.</h2>
        <p>
          Open the MCP config for your editor and paste in one block. The server
          installs itself on first run.
        </p>
        <div
          className="install-row"
          style={{ justifyContent: "center", margin: "0 auto", maxWidth: 760 }}
        >
          {IDES.map((ide) => (
            <IdeButton key={ide.id} ide={ide} compact />
          ))}
        </div>
      </div>
    </div>
  </section>
);

// ----- Footer -----
const Footer = () => (
  <footer className="footer">
    <div className="footer-inner">
      <a href="index.html" className="brand">
        <span className="mark">/</span>
        <span>s&amp;box docs</span>
      </a>
      <span
        style={{
          color: "var(--text-faint)",
          fontFamily: "Geist Mono, monospace",
          fontSize: 12,
        }}
      >
        MCP server · indexed against engine v0.4.2 · 1,247 classes
      </span>
      <span className="spacer" />
      <a href="docs.html">Docs</a>
      <a href="#">GitHub</a>
      <a href="#">Changelog</a>
      <a href="#">License (MIT)</a>
    </div>
  </footer>
);

// ----- Nav -----
const LandingNav = ({ theme, onToggleTheme }) => (
  <nav className="landing-nav">
    <a href="index.html" className="brand">
      <span className="mark">/</span>
      <span>s&amp;box docs</span>
      <span className="ver">MCP</span>
    </a>
    <div className="nav-links">
      <a href="#how">How it works</a>
      <a href="#tools">Tools</a>
      <a href="docs.html">Documentation</a>
      <a href="#">Changelog</a>
    </div>
    <span className="nav-spacer" />
    <div className="right-tools">
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
      <a className="btn primary" href="docs.html">
        Browse docs <Icon.ArrowRight />
      </a>
    </div>
  </nav>
);

// ----- App -----
const App = () => {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // sync the theme tweak with documentElement + localStorage
  useEffect(() => {
    document.documentElement.dataset.theme = t.theme;
    try {
      localStorage.setItem("sbox-theme", t.theme);
    } catch {}
  }, [t.theme]);

  const toggleTheme = () => {
    setTweak("theme", t.theme === "dark" ? "light" : "dark");
  };

  return (
    <>
      <LandingNav theme={t.theme} onToggleTheme={toggleTheme} />
      <Hero layout={t.layout} />
      <HowItWorks />
      <Features />
      <div id="tools" />
      <Tools />
      <FinalCta />
      <Footer />

      <TweaksPanel>
        <TweakSection label="Layout" />
        <TweakRadio
          label="Hero"
          value={t.layout}
          options={["centered", "split"]}
          onChange={(v) => setTweak("layout", v)}
        />
        <TweakSection label="Appearance" />
        <TweakRadio
          label="Theme"
          value={t.theme}
          options={["dark", "light"]}
          onChange={(v) => setTweak("theme", v)}
        />
      </TweaksPanel>
    </>
  );
};

const root = ReactDOM.createRoot(document.querySelector("#root"));
root.render(<App />);
