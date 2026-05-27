// Page content: Sandbox.Component reference + tutorial

const CodeBlock = ({ lang, file, children }) => (
  <div className="code-block">
    <div className="ch-header">
      <span className="file">
        <Icon.File />
        {file ||
          (lang === "cs"
            ? "Example.cs"
            : (lang === "json"
              ? "settings.json"
              : "snippet"))}
      </span>
      <button
        className="icon-btn"
        style={{ color: "var(--text-faint)", height: 24, width: 24 }}
        title="Copy"
      >
        <Icon.Copy />
      </button>
    </div>
    <div className="ch-body">
      <pre
        dangerouslySetInnerHTML={{
          __html: typeof children === "string" ? children : "",
        }}
      />
    </div>
  </div>
);

// -------------- Sandbox.Component reference --------------
const ComponentPage = () => (
  <div className="content">
    <nav className="breadcrumb">
      <a href="#">API</a>
      <span className="sep">/</span>
      <a href="#">Sandbox</a>
      <span className="sep">/</span>
      <span className="current">Component</span>
    </nav>

    <h1 className="page-title">
      Component
      <span className="kind">Class</span>
    </h1>
    <p className="page-summary">
      Base class for behaviours attached to{" "}
      <code
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 3,
          fontFamily: "Geist Mono",
          fontSize: 13,
          padding: "1px 5px",
        }}
      >
        GameObject
      </code>
      s. Implements lifecycle callbacks, transform access, and sibling component
      lookup. All custom gameplay scripts inherit from this class.
    </p>

    <div className="inheritance">
      <span className="crumb">object</span>
      <span className="arrow">→</span>
      <span className="crumb">BaseComponent</span>
      <span className="arrow">→</span>
      <span className="crumb cur">Component</span>
    </div>

    <dl className="meta-grid">
      <dt>Namespace</dt>
      <dd>Sandbox</dd>
      <dt>Assembly</dt>
      <dd>Sandbox.Game.dll</dd>
      <dt>Declaration</dt>
      <dd>
        <span style={{ color: "var(--syn-kw)" }}>public abstract class</span>{" "}
        <span style={{ color: "var(--syn-type)" }}>Component</span>{" "}
        <span className="arrow">:</span> <a href="#">BaseComponent</a>
      </dd>
      <dt>Inherited by</dt>
      <dd>
        <a href="#">Camera</a>, <a href="#">ModelRenderer</a>,{" "}
        <a href="#">Rigidbody</a>, <a href="#">SoundEmitter</a>
        <span style={{ color: "var(--text-faint)" }}> · 240 more</span>
      </dd>
    </dl>

    {/* Properties */}
    <h2 className="h2" id="properties">
      Properties <span className="count">7</span>
    </h2>
    <div className="member-list">
      <Member
        id="prop-GameObject"
        sig={
          <>
            <span className="kw">public</span>{" "}
            <span className="ret">GameObject</span>{" "}
            <span className="name">GameObject</span> {"{ "}
            <span className="kw">get</span>;{" }"}
          </>
        }
        tags={["get"]}
        desc="The GameObject this component is attached to. Set when the component is created and never changes for the component's lifetime."
      />

      <Member
        id="prop-Transform"
        sig={
          <>
            <span className="kw">public</span>{" "}
            <span className="ret">GameTransform</span>{" "}
            <span className="name">Transform</span> {"{ "}
            <span className="kw">get</span>;{" }"}
          </>
        }
        tags={["get"]}
        desc="Shortcut to GameObject.Transform. Read or write Position, Rotation, and Scale through this property."
      />

      <Member
        id="prop-Tags"
        sig={
          <>
            <span className="kw">public</span>{" "}
            <span className="ret">TagSet</span>{" "}
            <span className="name">Tags</span> {"{ "}
            <span className="kw">get</span>;{" }"}
          </>
        }
        tags={["get"]}
        desc="The tag set of the owning GameObject. Used for fast filtered lookups and physics layer matching."
      />

      <Member
        id="prop-Enabled"
        sig={
          <>
            <span className="kw">public</span> <span className="ret">bool</span>{" "}
            <span className="name">Enabled</span> {"{ "}
            <span className="kw">get</span>; <span className="kw">set</span>;
            {" }"}
          </>
        }
        tags={["get", "set"]}
        desc="Whether this component is enabled. Disabling a component invokes OnDisabled() and stops Update calls until re-enabled."
      />

      <Member
        id="prop-Active"
        sig={
          <>
            <span className="kw">public</span> <span className="ret">bool</span>{" "}
            <span className="name">Active</span> {"{ "}
            <span className="kw">get</span>;{" }"}
          </>
        }
        tags={["get"]}
        desc="True if this component is Enabled AND its GameObject is active in the scene. This is the value the runtime checks before invoking lifecycle callbacks."
      />

      <Member
        id="prop-Network"
        sig={
          <>
            <span className="kw">public</span>{" "}
            <span className="ret">ComponentNetwork</span>{" "}
            <span className="name">Network</span> {"{ "}
            <span className="kw">get</span>;{" }"}
          </>
        }
        tags={["get"]}
        desc="Networking interface — replication, ownership, RPC targets. Returns null if the scene is not networked."
      />

      <Member
        id="prop-Scene"
        sig={
          <>
            <span className="kw">public</span>{" "}
            <span className="ret">Scene</span>{" "}
            <span className="name">Scene</span> {"{ "}
            <span className="kw">get</span>;{" }"}
          </>
        }
        tags={["get"]}
        desc="The Scene this component belongs to. Equivalent to GameObject.Scene."
      />
    </div>

    {/* Methods */}
    <h2 className="h2" id="methods">
      Methods <span className="count">9</span>
    </h2>
    <div className="member-list">
      <Member
        id="method-OnAwake"
        sig={
          <>
            <span className="kw">protected virtual void</span>{" "}
            <span className="name">OnAwake</span>
            <span className="punc">()</span>
          </>
        }
        tags={["virtual", "lifecycle"]}
        desc="Called once when the component is created, before OnStart and before any OnEnabled call. Use for one-time setup that does not depend on other components being initialized."
      />

      <Member
        id="method-OnStart"
        sig={
          <>
            <span className="kw">protected virtual void</span>{" "}
            <span className="name">OnStart</span>
            <span className="punc">()</span>
          </>
        }
        tags={["virtual", "lifecycle"]}
        desc="Called once before the first OnUpdate, after every component in the scene has had OnAwake invoked. Safe to reference sibling components here."
      />

      <Member
        id="method-OnUpdate"
        sig={
          <>
            <span className="kw">protected virtual void</span>{" "}
            <span className="name">OnUpdate</span>
            <span className="punc">()</span>
          </>
        }
        tags={["virtual", "per-frame"]}
        desc="Called once per frame while Active. Use Time.Delta to scale frame-rate-dependent values."
      />

      <Member
        id="method-OnFixedUpdate"
        sig={
          <>
            <span className="kw">protected virtual void</span>{" "}
            <span className="name">OnFixedUpdate</span>
            <span className="punc">()</span>
          </>
        }
        tags={["virtual", "fixed"]}
        desc="Called at a fixed interval (50Hz by default). Use for physics-coupled logic."
      />

      <Member
        id="method-OnEnabled"
        sig={
          <>
            <span className="kw">protected virtual void</span>{" "}
            <span className="name">OnEnabled</span>
            <span className="punc">()</span>
          </>
        }
        tags={["virtual"]}
        desc="Called whenever the component transitions from disabled to enabled. May fire multiple times during a component's lifetime."
      />

      <Member
        id="method-OnDisabled"
        sig={
          <>
            <span className="kw">protected virtual void</span>{" "}
            <span className="name">OnDisabled</span>
            <span className="punc">()</span>
          </>
        }
        tags={["virtual"]}
        desc="Called whenever the component transitions from enabled to disabled. Pair with OnEnabled to manage subscriptions."
      />

      <Member
        id="method-OnDestroy"
        sig={
          <>
            <span className="kw">protected virtual void</span>{" "}
            <span className="name">OnDestroy</span>
            <span className="punc">()</span>
          </>
        }
        tags={["virtual"]}
        desc="Called once just before the component is removed and references to it become invalid."
      />

      <Member
        id="method-GetComponent"
        sig={
          <>
            <span className="kw">public</span> <span className="ret">T</span>{" "}
            <span className="name">GetComponent</span>
            <span className="punc">&lt;</span>
            <span className="ret">T</span>
            <span className="punc">&gt;(</span>
            <span className="kw">bool</span>{" "}
            <span className="param-name">includeDisabled</span>{" "}
            <span className="punc">=</span>{" "}
            <span className="default">false</span>
            <span className="punc">)</span>
          </>
        }
        tags={["generic"]}
        desc="Find a sibling component of type T on the same GameObject. Returns null if no match. Set includeDisabled to true to scan disabled components."
        params={[
          {
            default: "false",
            desc: "Include components whose Enabled flag is false.",
            name: "includeDisabled",
            type: "bool",
          },
        ]}
        returns={{ desc: "First matching component, or null.", type: "T" }}
      />

      <Member
        id="method-Destroy"
        sig={
          <>
            <span className="kw">public void</span>{" "}
            <span className="name">Destroy</span>
            <span className="punc">()</span>
          </>
        }
        tags={[]}
        desc="Removes this component from its GameObject. OnDestroy is invoked on the next tick before memory is reclaimed."
      />
    </div>

    {/* Events */}
    <h2 className="h2" id="events">
      Events <span className="count">2</span>
    </h2>
    <div className="member-list">
      <Member
        id="event-ComponentEnabled"
        sig={
          <>
            <span className="kw">public event</span>{" "}
            <span className="ret">Action</span>{" "}
            <span className="name">ComponentEnabled</span>
          </>
        }
        tags={["event"]}
        desc="Raised after OnEnabled returns."
      />
      <Member
        id="event-ComponentDisabled"
        sig={
          <>
            <span className="kw">public event</span>{" "}
            <span className="ret">Action</span>{" "}
            <span className="name">ComponentDisabled</span>
          </>
        }
        tags={["event"]}
        desc="Raised after OnDisabled returns."
      />
    </div>

    {/* Example */}
    <h2 className="h2" id="example">
      Example
    </h2>
    <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 14px" }}>
      A minimal health component.{" "}
      <code
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 3,
          fontFamily: "Geist Mono",
          fontSize: 12.5,
          padding: "1px 5px",
        }}
      >
        [Property]
      </code>{" "}
      exposes fields in the editor inspector.
    </p>
    <CodeBlock lang="cs" file="PlayerHealth.cs">
      {`<span class="tok-kw">using</span> Sandbox<span class="tok-punc">;</span>

<span class="tok-kw">public class</span> <span class="tok-type">PlayerHealth</span> <span class="tok-punc">:</span> <span class="tok-type">Component</span>
<span class="tok-punc">{</span>
    <span class="tok-punc">[</span><span class="tok-attr">Property</span><span class="tok-punc">]</span> <span class="tok-kw">public float</span> <span class="tok-id">MaxHealth</span> <span class="tok-punc">{</span> <span class="tok-kw">get</span><span class="tok-punc">;</span> <span class="tok-kw">set</span><span class="tok-punc">;</span> <span class="tok-punc">}</span> <span class="tok-punc">=</span> <span class="tok-num">100f</span><span class="tok-punc">;</span>
    <span class="tok-punc">[</span><span class="tok-attr">Sync</span><span class="tok-punc">]</span> <span class="tok-kw">public float</span> <span class="tok-id">Current</span> <span class="tok-punc">{</span> <span class="tok-kw">get</span><span class="tok-punc">;</span> <span class="tok-kw">set</span><span class="tok-punc">;</span> <span class="tok-punc">}</span>

    <span class="tok-kw">protected override void</span> <span class="tok-fn">OnStart</span><span class="tok-punc">()</span>
    <span class="tok-punc">{</span>
        <span class="tok-id">Current</span> <span class="tok-punc">=</span> <span class="tok-id">MaxHealth</span><span class="tok-punc">;</span>
    <span class="tok-punc">}</span>

    <span class="tok-kw">public void</span> <span class="tok-fn">TakeDamage</span><span class="tok-punc">(</span> <span class="tok-kw">float</span> <span class="tok-id">amount</span> <span class="tok-punc">)</span>
    <span class="tok-punc">{</span>
        <span class="tok-id">Current</span> <span class="tok-punc">=</span> <span class="tok-type">MathF</span><span class="tok-punc">.</span><span class="tok-fn">Max</span><span class="tok-punc">(</span> <span class="tok-num">0</span><span class="tok-punc">,</span> <span class="tok-id">Current</span> <span class="tok-punc">-</span> <span class="tok-id">amount</span> <span class="tok-punc">);</span>
        <span class="tok-cmt">// Component.Destroy() removes this script;</span>
        <span class="tok-cmt">// GameObject.Destroy() removes the whole object.</span>
        <span class="tok-kw">if</span> <span class="tok-punc">(</span> <span class="tok-id">Current</span> <span class="tok-punc">&lt;=</span> <span class="tok-num">0</span> <span class="tok-punc">)</span>
            <span class="tok-id">GameObject</span><span class="tok-punc">.</span><span class="tok-fn">Destroy</span><span class="tok-punc">();</span>
    <span class="tok-punc">}</span>
<span class="tok-punc">}</span>`}
    </CodeBlock>

    {/* AI assist */}
    <div className="ai-assist">
      <span className="icon">
        <Icon.Sparkle />
      </span>
      <div className="text">
        <p className="title">Need a hand with this API?</p>
        <p className="subtitle">
          Your AI assistant has the docs MCP installed. Ask:{" "}
          <em>"How do I subscribe to OnDisabled cleanly?"</em>
        </p>
      </div>
      <a href="index.html" className="btn sm">
        <Icon.Plug />
        Setup MCP
      </a>
    </div>

    <nav className="page-foot-nav">
      <a href="#">
        <span className="dir">← Previous</span>
        <span className="ttl">Sandbox.GameObject</span>
      </a>
      <a href="#" className="next">
        <span className="dir">Next →</span>
        <span className="ttl">Sandbox.Scene</span>
      </a>
    </nav>
  </div>
);

// ----- Member row -----
const Member = ({ id, sig, tags, desc, params, returns }) => (
  <article className="member" id={id}>
    <div className="member-head">
      <a
        href={"#" + id}
        className="member-sig"
        style={{ color: "inherit", textDecoration: "none" }}
      >
        {sig}
      </a>
      {tags && tags.length > 0 && (
        <span className="member-tags">
          {tags.map((t) => (
            <span
              key={t}
              className={
                "chip" +
                (t === "lifecycle"
                  ? " primary"
                  : (t === "event"
                    ? " primary"
                    : ""))
              }
            >
              {t}
            </span>
          ))}
        </span>
      )}
    </div>
    <p className="member-desc">{desc}</p>
    {params && params.length > 0 && (
      <table className="param-table">
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name}>
              <td>
                {p.name}
                {p.default && (
                  <span style={{ color: "var(--text-faint)" }}>
                    {" "}
                    = {p.default}
                  </span>
                )}
              </td>
              <td>{p.type}</td>
              <td>{p.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    {returns && (
      <table className="param-table">
        <thead>
          <tr>
            <th>Returns</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>—</td>
            <td>{returns.type}</td>
            <td>{returns.desc}</td>
          </tr>
        </tbody>
      </table>
    )}
  </article>
);

// -------------- Tutorial page --------------
const TutorialComponentPage = () => (
  <div className="content">
    <nav className="breadcrumb">
      <a href="#">Tutorials</a>
      <span className="sep">/</span>
      <span className="current">Writing a Component</span>
    </nav>

    <h1 className="page-title">Writing a Component</h1>
    <p className="page-summary">
      Components are how you add behaviour to a GameObject in s&box. In five
      minutes you'll have a Component that rotates an object, exposes a
      tweakable speed in the inspector, and reacts to the player pressing Space.
    </p>

    <dl className="meta-grid">
      <dt>Updated</dt>
      <dd style={{ fontFamily: "inherit" }}>May 18, 2026 · 5 min read</dd>
      <dt>Difficulty</dt>
      <dd style={{ fontFamily: "inherit" }}>Beginner</dd>
      <dt>Prerequisites</dt>
      <dd style={{ fontFamily: "inherit" }}>
        C# basics, s&box editor installed
      </dd>
    </dl>

    <div className="prose">
      <h2 id="tut-step-1">1. Create the script</h2>
      <p>
        In the s&box editor, open the <em>Code</em> tab and click{" "}
        <strong>New → C# Component</strong>. Name it <code>Spinner</code>. The
        editor generates a stub that inherits from{" "}
        <a href="#">Sandbox.Component</a>.
      </p>

      <CodeBlock lang="cs" file="Spinner.cs">
        {`<span class="tok-kw">using</span> Sandbox<span class="tok-punc">;</span>

<span class="tok-kw">public sealed class</span> <span class="tok-type">Spinner</span> <span class="tok-punc">:</span> <span class="tok-type">Component</span>
<span class="tok-punc">{</span>
    <span class="tok-kw">protected override void</span> <span class="tok-fn">OnUpdate</span><span class="tok-punc">()</span>
    <span class="tok-punc">{</span>
        <span class="tok-cmt">// runs once per frame</span>
    <span class="tok-punc">}</span>
<span class="tok-punc">}</span>`}
      </CodeBlock>

      <h2 id="tut-step-2">2. Expose a property</h2>
      <p>
        Decorate a field or auto-property with <code>[Property]</code> to make
        it editable in the inspector. Default values you assign in C# become the
        default in the editor.
      </p>

      <CodeBlock lang="cs" file="Spinner.cs">
        {`<span class="tok-punc">[</span><span class="tok-attr">Property</span><span class="tok-punc">]</span> <span class="tok-kw">public float</span> <span class="tok-id">DegreesPerSecond</span> <span class="tok-punc">{</span> <span class="tok-kw">get</span><span class="tok-punc">;</span> <span class="tok-kw">set</span><span class="tok-punc">;</span> <span class="tok-punc">}</span> <span class="tok-punc">=</span> <span class="tok-num">90f</span><span class="tok-punc">;</span>`}
      </CodeBlock>

      <h2 id="tut-step-3">3. Rotate the transform</h2>
      <p>
        <code>Transform</code> is a shortcut to the owning GameObject's
        transform. Multiply your rotation rate by <code>Time.Delta</code> so the
        speed is independent of frame rate.
      </p>

      <CodeBlock lang="cs" file="Spinner.cs">
        {`<span class="tok-kw">protected override void</span> <span class="tok-fn">OnUpdate</span><span class="tok-punc">()</span>
<span class="tok-punc">{</span>
    <span class="tok-kw">var</span> <span class="tok-id">delta</span> <span class="tok-punc">=</span> <span class="tok-id">DegreesPerSecond</span> <span class="tok-punc">*</span> <span class="tok-type">Time</span><span class="tok-punc">.</span><span class="tok-id">Delta</span><span class="tok-punc">;</span>
    <span class="tok-id">Transform</span><span class="tok-punc">.</span><span class="tok-id">LocalRotation</span> <span class="tok-punc">*=</span> <span class="tok-type">Rotation</span><span class="tok-punc">.</span><span class="tok-fn">FromYaw</span><span class="tok-punc">(</span> <span class="tok-id">delta</span> <span class="tok-punc">);</span>
<span class="tok-punc">}</span>`}
      </CodeBlock>

      <div className="callout">
        <span className="iconwrap">
          <Icon.Info />
        </span>
        <div>
          <p>
            <strong>Why LocalRotation?</strong> Multiplying world rotation
            accumulates drift from parent transforms. Local-space changes are
            predictable for behaviour that should ignore parenting.
          </p>
        </div>
      </div>

      <h2 id="tut-step-4">4. React to input</h2>
      <p>
        The static <a href="#">Input</a> class exposes button state. Toggle a
        flag on Space, and only spin when the flag is on.
      </p>

      <CodeBlock lang="cs" file="Spinner.cs">
        {`<span class="tok-kw">private bool</span> <span class="tok-id">_spinning</span> <span class="tok-punc">=</span> <span class="tok-kw">true</span><span class="tok-punc">;</span>

<span class="tok-kw">protected override void</span> <span class="tok-fn">OnUpdate</span><span class="tok-punc">()</span>
<span class="tok-punc">{</span>
    <span class="tok-kw">if</span> <span class="tok-punc">(</span> <span class="tok-type">Input</span><span class="tok-punc">.</span><span class="tok-fn">Pressed</span><span class="tok-punc">(</span> <span class="tok-str">"jump"</span> <span class="tok-punc">)</span> <span class="tok-punc">)</span>
        <span class="tok-id">_spinning</span> <span class="tok-punc">=</span> <span class="tok-punc">!</span><span class="tok-id">_spinning</span><span class="tok-punc">;</span>

    <span class="tok-kw">if</span> <span class="tok-punc">(</span> <span class="tok-punc">!</span><span class="tok-id">_spinning</span> <span class="tok-punc">)</span> <span class="tok-kw">return</span><span class="tok-punc">;</span>

    <span class="tok-kw">var</span> <span class="tok-id">delta</span> <span class="tok-punc">=</span> <span class="tok-id">DegreesPerSecond</span> <span class="tok-punc">*</span> <span class="tok-type">Time</span><span class="tok-punc">.</span><span class="tok-id">Delta</span><span class="tok-punc">;</span>
    <span class="tok-id">Transform</span><span class="tok-punc">.</span><span class="tok-id">LocalRotation</span> <span class="tok-punc">*=</span> <span class="tok-type">Rotation</span><span class="tok-punc">.</span><span class="tok-fn">FromYaw</span><span class="tok-punc">(</span> <span class="tok-id">delta</span> <span class="tok-punc">);</span>
<span class="tok-punc">}</span>`}
      </CodeBlock>

      <h2 id="tut-step-5">Next steps</h2>
      <ul>
        <li>
          Try the <a href="#">Networking basics</a> tutorial to sync the spin
          state across clients.
        </li>
        <li>
          Add a sound when toggling — see <a href="#">SoundEmitter</a>.
        </li>
        <li>
          Read the full <a href="#">Sandbox.Component</a> API reference for
          every callback.
        </li>
      </ul>
    </div>

    <div className="ai-assist">
      <span className="icon">
        <Icon.Sparkle />
      </span>
      <div className="text">
        <p className="title">
          Stuck? Pull this tutorial into your AI assistant.
        </p>
        <p className="subtitle">
          The MCP exposes every page on this site as a tool your model can read
          directly.
        </p>
      </div>
      <a href="index.html" className="btn sm">
        <Icon.ArrowRight />
        Get the MCP
      </a>
    </div>
  </div>
);

window.ComponentPage = ComponentPage;
window.TutorialComponentPage = TutorialComponentPage;
window.CodeBlock = CodeBlock;
