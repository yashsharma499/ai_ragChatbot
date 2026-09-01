import Icon from "../../components/ui/Icon";

/**
 * The marketing panel and background treatment shared by Login and Signup.
 * These two pages previously duplicated ~350 identical lines each, including
 * two separate copies of the same keyframes.
 */

const PILLARS = [
  {
    icon: "search",
    title: "Retrieval",
    body: "Your document is split into passages and indexed as vectors, so the most relevant parts of it can be found by meaning rather than keywords.",
    accent: "from-purple-500 to-purple-600",
    hover: "group-hover:text-purple-300",
    border: "hover:border-purple-500/40",
  },
  {
    icon: "cpu",
    title: "Augmentation",
    body: "The passages that actually matter are attached to your question, giving the model real source material instead of guesswork.",
    accent: "from-cyan-500 to-cyan-600",
    hover: "group-hover:text-cyan-300",
    border: "hover:border-cyan-500/40",
  },
  {
    icon: "bolt",
    title: "Generation",
    body: "The answer is written from those passages and cites them, so you can check every claim against your own document.",
    accent: "from-pink-500 to-pink-600",
    hover: "group-hover:text-pink-300",
    border: "hover:border-pink-500/40",
  },
];

export default function AuthLayout({ icon, title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen bg-[#020617]">
      {/* Form panel */}
      <div className="relative flex w-full items-center justify-center px-6 py-10 lg:w-1/2 lg:px-12">
        <div className="animate-pulseGlow pointer-events-none absolute left-10 top-16 h-56 w-56 rounded-full bg-purple-600/20 blur-3xl" />
        <div className="animate-pulseGlow pointer-events-none absolute bottom-16 right-10 h-72 w-72 rounded-full bg-cyan-600/20 blur-3xl" />

        <div className="relative z-10 w-full max-w-sm">
          <div className="mb-7">
            <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 shadow-lg shadow-purple-900/40">
              <Icon name={icon} className="h-6 w-6 text-white" strokeWidth={2.4} />
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>
            <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>
          </div>

          {children}

          {footer && <div className="mt-6 text-center text-xs text-slate-400">{footer}</div>}
        </div>
      </div>

      {/* Explainer panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900/20 to-cyan-900/20 lg:flex lg:w-1/2">
        <div className="bg-grid-pattern absolute inset-0 opacity-10" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-purple-600/10 blur-3xl" />
        <div className="pointer-events-none absolute left-0 top-0 h-72 w-72 rounded-full bg-cyan-600/10 blur-3xl" />

        <div className="animate-floatY absolute left-1/4 top-1/4 h-1.5 w-1.5 rounded-full bg-purple-500" />
        <div
          className="animate-floatY absolute right-1/3 top-1/3 h-2 w-2 rounded-full bg-cyan-500"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="animate-floatY absolute bottom-1/4 left-1/3 h-1.5 w-1.5 rounded-full bg-pink-500"
          style={{ animationDelay: "2s" }}
        />

        <div className="relative z-10 flex max-w-xl flex-col justify-center p-12">
          <h2 className="text-4xl font-bold leading-tight text-white">
            Retrieval Augmented
            <br />
            <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Generation
            </span>
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-400">
            Ask questions in plain language and get answers grounded in the
            documents you upload — with citations back to the source.
          </p>

          <div className="mt-8 space-y-3">
            {PILLARS.map((pillar, index) => (
              <div key={pillar.title}>
                <div
                  className={`group flex items-start gap-3 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 backdrop-blur-sm transition-all duration-300 hover:bg-slate-800/50 ${pillar.border}`}
                >
                  <span
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${pillar.accent} shadow-lg transition-transform duration-300 group-hover:scale-110`}
                  >
                    <Icon name={pillar.icon} className="h-5 w-5 text-white" />
                  </span>
                  <div>
                    <h3
                      className={`text-base font-bold text-white transition-colors ${pillar.hover}`}
                    >
                      {pillar.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">
                      {pillar.body}
                    </p>
                  </div>
                </div>

                {index < PILLARS.length - 1 && (
                  <div className="flex justify-center py-1.5">
                    <span className="h-5 w-0.5 bg-gradient-to-b from-purple-500/50 to-cyan-500/50" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
