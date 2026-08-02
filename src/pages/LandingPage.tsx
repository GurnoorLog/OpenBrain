import { useEffect, useRef } from 'react'
import { useAuth } from '../core/auth/useAuth'
import { useNavigation } from '../core/navigation'
import './landing.css'

function useRevealObserver() {
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.classList.add('visible')
        }
      },
      { threshold: 0.1 },
    )
    root.querySelectorAll('.landing-reveal').forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])
  return containerRef
}

export default function LandingPage() {
  const { user } = useAuth()
  const { go } = useNavigation()
  const pageRef = useRevealObserver()

  const enter = () => {
    if (user) go('dashboard')
    else go('auth', { authMode: 'signup' })
  }

  return (
    <div ref={pageRef} className="landing-root relative h-screen overflow-y-auto overflow-x-hidden">
      <div className="dot-grid"></div>
      <div
        className="glow-orb top-[-100px] left-[-100px] w-[500px] h-[500px]"
        style={{ background: 'radial-gradient(circle, #14b8a6 0%, transparent 70%)' }}
      ></div>
      <div
        className="glow-orb bottom-[-100px] right-[-100px] w-[600px] h-[600px]"
        style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
      ></div>

      <nav className="fixed w-full z-50 top-0 flex justify-center py-6">
        <div className="w-full max-w-7xl px-8 flex items-center justify-between backdrop-blur-md bg-black/20 rounded-full border border-white/5 mx-4 mt-2 h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <iconify-icon icon="lucide:brain" className="text-black text-xl"></iconify-icon>
            </div>
            <span className="text-lg font-black tracking-tighter">OPENBRAIN</span>
            <span className="px-2 py-0.5 bg-white/10 text-white/60 text-[9px] font-bold rounded-full border border-white/10 tracking-widest">
              ALPHA v1.2
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="landing-nav-link">FEATURES</a>
            <a href="#marketplace" className="landing-nav-link">MARKETPLACE</a>
            <a href="#pricing" className="landing-nav-link">PRICING</a>
            <a href="#docs" className="landing-nav-link">DOCS</a>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => go('auth', { authMode: 'login' })} className="landing-nav-link font-semibold">
              LOGIN
            </button>
            <button
              onClick={enter}
              className="landing-shine-btn bg-white text-black px-5 h-9 flex items-center rounded-full text-xs font-black tracking-tighter hover:bg-gray-200 transition-all"
            >
              LAUNCH STUDIO
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-32">
        <section className="pt-24 pb-32 px-6 flex flex-col items-center relative overflow-hidden">
          <div className="landing-reveal inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-teal-400 mb-10 shadow-lg">
            <span className="flex h-2 w-2 rounded-full bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.8)]"></span>
            The Future of AI Architecture
          </div>
          <h1 className="landing-reveal text-6xl md:text-8xl lg:text-9xl font-black text-center tracking-tighter mb-8 max-w-6xl leading-[0.9]">
            Build AI <span className="landing-gradient-text">Visually.</span>
          </h1>
          <p className="landing-reveal text-xl text-gray-400 text-center max-w-2xl mb-14 leading-relaxed font-medium" style={{ transitionDelay: '0.2s' }}>
            Architect custom AI brains in minutes. Simply describe your vision, and our architect builds the entire node network live on canvas.
          </p>
          <div className="landing-reveal flex flex-col sm:flex-row items-center gap-6" style={{ transitionDelay: '0.3s' }}>
            <button
              onClick={enter}
              className="landing-shine-btn bg-white text-black px-12 h-14 rounded-2xl font-black text-lg flex items-center gap-3 hover:scale-105 transition-transform"
            >
              START BUILDING <iconify-icon icon="lucide:zap" className="text-xl"></iconify-icon>
            </button>
            <button
              onClick={enter}
              className="px-12 h-14 rounded-2xl font-black text-lg flex items-center gap-3 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              WATCH DEMO
            </button>
          </div>
          <div className="landing-reveal mt-28 w-full max-w-6xl mx-auto landing-glass-card p-2 shadow-2xl" style={{ transitionDelay: '0.4s' }}>
            <div className="relative aspect-video rounded-[22px] bg-[#0c0c0c] border border-white/5 overflow-hidden flex items-center justify-center shadow-inner">
              <div className="absolute inset-0 dot-grid opacity-10"></div>
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <path d="M 400 300 Q 550 300 700 300" fill="none" stroke="url(#grad1)" strokeWidth="2" className="landing-flow-line" />
                <path d="M 700 300 Q 850 300 1000 300" fill="none" stroke="url(#grad2)" strokeWidth="2" className="landing-flow-line" />
                <defs>
                  <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style={{ stopColor: '#14b8a6', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
                  </linearGradient>
                  <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: '#3b82f6', stopOpacity: 1 }} />
                  </linearGradient>
                </defs>
              </svg>
              <div className="flex items-center gap-10 md:gap-16 z-10">
                <div className="landing-node-animate w-28 h-28 md:w-36 md:h-36 landing-glass-card flex flex-col items-center justify-center gap-3 border-teal-500/30 bg-teal-500/[0.03]">
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-teal-500/10 flex items-center justify-center">
                    <iconify-icon icon="lucide:sparkles" className="text-2xl md:text-3xl text-teal-400"></iconify-icon>
                  </div>
                  <span className="text-[10px] md:text-[11px] uppercase font-black text-teal-400 tracking-[0.2em]">Architect</span>
                </div>
                <div className="landing-node-animate w-28 h-28 md:w-36 md:h-36 landing-glass-card flex flex-col items-center justify-center gap-3 border-purple-500/30 bg-purple-500/[0.03]" style={{ animationDelay: '1s' }}>
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                    <iconify-icon icon="lucide:database" className="text-2xl md:text-3xl text-purple-400"></iconify-icon>
                  </div>
                  <span className="text-[10px] md:text-[11px] uppercase font-black text-purple-400 tracking-[0.2em]">Brain</span>
                </div>
                <div className="landing-node-animate w-28 h-28 md:w-36 md:h-36 landing-glass-card flex flex-col items-center justify-center gap-3 border-blue-500/30 bg-blue-500/[0.03]" style={{ animationDelay: '2s' }}>
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                    <iconify-icon icon="lucide:terminal" className="text-2xl md:text-3xl text-blue-400"></iconify-icon>
                  </div>
                  <span className="text-[10px] md:text-[11px] uppercase font-black text-blue-400 tracking-[0.2em]">Action</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-40 px-6 max-w-7xl mx-auto">
          <div className="landing-reveal flex flex-col items-center mb-24 text-center">
            <h2 className="text-5xl font-black mb-6 tracking-tighter">Built for the Agentic Era.</h2>
            <p className="text-gray-400 max-w-xl text-lg">From deep RAG to specialized fine-tuning, manage every intelligence component as a visual node.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              {
                icon: 'lucide:wand-2',
                color: 'from-teal-500/20 to-teal-900/20 border-teal-500/20 text-teal-400',
                title: 'Natural Language Architect',
                body: 'Stop configuring JSON. Just tell us what you want to build and our architect generates the validated node graph for you.',
              },
              {
                icon: 'lucide:layers',
                color: 'from-purple-500/20 to-purple-900/20 border-purple-500/20 text-purple-400',
                title: 'Deep MCP Integration',
                body: 'Instant connectivity to your entire stack. Drag Slack, Notion, or GitHub nodes to give your Brain hands and feet.',
              },
              {
                icon: 'lucide:cpu',
                color: 'from-blue-500/20 to-blue-900/20 border-blue-500/20 text-blue-400',
                title: 'Model Agnostic Core',
                body: 'Run Llama-3 locally via Ollama or switch to Claude-3.5 or GPT-4o with a single click. Zero lock-in, infinite power.',
              },
            ].map((feature, index) => (
              <div key={feature.title} className="landing-reveal landing-glass-card p-10 flex flex-col gap-8" style={{ transitionDelay: `${(index + 1) * 0.1}s` }}>
                <div className={`w-16 h-16 bg-gradient-to-br ${feature.color} rounded-2xl flex items-center justify-center border shadow-xl`}>
                  <iconify-icon icon={feature.icon} className={`${feature.color.split(' ').pop()} text-3xl`}></iconify-icon>
                </div>
                <div>
                  <h3 className="text-2xl font-black mb-4 tracking-tight">{feature.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed font-medium">{feature.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="marketplace" className="py-40 px-6 bg-gradient-to-b from-transparent via-white/[0.01] to-transparent">
          <div className="max-w-7xl mx-auto">
            <div className="landing-reveal flex flex-col md:flex-row items-end justify-between mb-20 gap-8">
              <div className="max-w-2xl">
                <h2 className="text-5xl font-black mb-6 tracking-tighter">Intelligence Reimagined.</h2>
                <p className="text-gray-400 text-lg">Explore pre-built Brains in our marketplace. Clone a production-ready AI in seconds and start customizing.</p>
              </div>
              <button onClick={enter} className="flex items-center gap-3 text-teal-400 font-black tracking-tighter hover:text-teal-300 transition-colors group">
                EXPLORE MARKETPLACE <iconify-icon icon="lucide:arrow-right" className="group-hover:translate-x-1 transition-transform"></iconify-icon>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { icon: 'lucide:shield-check', color: 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20', top: 'border-t-blue-500', title: 'Cyber Sentinel', body: 'Autonomous threat detection with MCP-connected firewall triggers.' },
                { icon: 'lucide:heart-pulse', color: 'bg-teal-500/10 text-teal-400 group-hover:bg-teal-500/20', top: 'border-t-teal-500', title: 'Bio Research', body: 'Deep RAG system specialized in parsing complex medical whitepapers.' },
                { icon: 'lucide:code-2', color: 'bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20', top: 'border-t-purple-500', title: 'Code Architect', body: 'End-to-end coding agent with sandbox execution and GitHub sync.' },
                { icon: 'lucide:bar-chart-3', color: 'bg-orange-500/10 text-orange-400 group-hover:bg-orange-500/20', top: 'border-t-orange-500', title: 'Growth Engine', body: 'Data synthesis agent for real-time marketing attribution & insights.' },
              ].map((brain, index) => (
                <button key={brain.title} onClick={enter} className={`landing-reveal landing-glass-card p-8 group cursor-pointer border-t-2 ${brain.top}`} style={{ transitionDelay: `${(index + 1) * 0.1}s` }}>
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`w-12 h-12 ${brain.color} rounded-xl flex items-center justify-center transition-colors`}>
                      <iconify-icon icon={brain.icon} className="text-2xl"></iconify-icon>
                    </div>
                    <h4 className="font-black text-lg tracking-tight">{brain.title}</h4>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed font-medium">{brain.body}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="py-40 px-6 max-w-7xl mx-auto">
          <div className="landing-reveal text-center mb-24">
            <h2 className="text-6xl font-black mb-6 tracking-tighter">Choose your Power.</h2>
            <p className="text-gray-400 text-lg">From local nodes to enterprise-scale cloud deployments.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {[
              {
                tier: 'Local Only',
                price: '$0',
                featured: false,
                items: [
                  { text: 'Unlimited Ollama Inference', muted: false },
                  { text: 'Local Canvas Persistence', muted: false },
                  { text: 'No Cloud Providers', muted: true },
                ],
                cta: 'GET STARTED',
              },
              {
                tier: 'Pro Creator',
                price: '$49',
                featured: true,
                items: [
                  { text: 'All Cloud Providers', muted: false },
                  { text: 'Unlimited Projects', muted: false },
                  { text: 'Advanced Fine-Tuning', muted: false },
                ],
                cta: 'UPGRADE TO PRO',
              },
              {
                tier: 'Enterprise',
                price: '$199',
                featured: false,
                items: [
                  { text: 'Dedicated Inference Clusters', muted: false },
                  { text: 'Custom MCP Connectors', muted: false },
                  { text: 'SLA & 24/7 Support', muted: false },
                ],
                cta: 'CONTACT SALES',
              },
            ].map((plan, index) => (
              <div
                key={plan.tier}
                className={`landing-reveal landing-glass-card p-12 flex flex-col ${plan.featured ? 'ring-2 ring-teal-500/50 scale-105 z-10 relative overflow-hidden' : ''}`}
                style={{ transitionDelay: `${(index + 1) * 0.1}s` }}
              >
                {plan.featured && (
                  <div className="absolute top-8 right-[-35px] bg-teal-500 text-black py-1 px-12 text-[10px] font-black rotate-45 uppercase tracking-tighter">
                    Best Value
                  </div>
                )}
                <h3 className={`text-lg font-black uppercase tracking-widest mb-4 ${plan.featured ? 'text-white' : 'text-gray-500'}`}>{plan.tier}</h3>
                <div className="text-5xl font-black my-8">
                  {plan.price}
                  <span className="text-base text-gray-600 font-medium">/month</span>
                </div>
                <ul className="space-y-5 mb-14 flex-1">
                  {plan.items.map((item) => (
                    <li key={item.text} className={`flex items-center gap-4 text-sm ${plan.featured ? 'font-black' : 'font-medium'} ${item.muted ? 'text-gray-600' : ''}`}>
                      <iconify-icon icon={item.muted ? 'lucide:x-circle' : 'lucide:check-circle-2'} className={`text-lg ${item.muted ? 'text-gray-700' : 'text-teal-400'}`}></iconify-icon>
                      {item.text}
                    </li>
                  ))}
                </ul>
                {plan.featured ? (
                  <button
                    onClick={enter}
                    className="landing-shine-btn w-full py-5 text-center bg-teal-500 text-black rounded-2xl font-black tracking-tight hover:bg-teal-400 transition-colors shadow-[0_0_30px_rgba(20,184,166,0.4)]"
                  >
                    {plan.cta}
                  </button>
                ) : (
                  <button onClick={enter} className="w-full py-5 text-center rounded-2xl font-black tracking-tight border border-white/10 hover:bg-white/5 transition-all">
                    {plan.cta}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="py-40 px-6 flex flex-col items-center text-center">
          <div className="landing-reveal landing-glass-card w-full max-w-5xl p-16 md:p-24 bg-gradient-to-b from-teal-500/10 via-transparent to-transparent flex flex-col items-center">
            <h2 className="text-5xl md:text-6xl font-black mb-10 tracking-tighter max-w-2xl leading-none">Ready to give your idea a Brain?</h2>
            <p className="text-gray-400 max-w-xl mb-14 text-xl font-medium">Join the 50,000+ architects building the next generation of autonomous systems.</p>
            <button onClick={enter} className="landing-shine-btn bg-white text-black px-16 py-6 rounded-2xl font-black text-2xl hover:scale-105 transition-transform inline-block shadow-2xl">
              LAUNCH THE STUDIO
            </button>
          </div>
        </section>
      </main>

      <footer className="py-24 px-6 border-t border-white/5 relative z-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-20">
          <div className="md:col-span-1">
            <div className="flex items-center gap-3 mb-10">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                <iconify-icon icon="lucide:brain" className="text-black text-xl"></iconify-icon>
              </div>
              <span className="text-xl font-black tracking-tighter uppercase">OpenBrain</span>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed mb-10 font-medium">
              The visual operating system for the agentic era. Build, deploy, and scale intelligent systems with zero friction.
            </p>
            <div className="flex items-center gap-6 text-gray-400">
              <a href="#" className="hover:text-white transition-colors"><iconify-icon icon="simple-icons:x" className="text-2xl"></iconify-icon></a>
              <a href="#" className="hover:text-white transition-colors"><iconify-icon icon="mdi:github" className="text-2xl"></iconify-icon></a>
              <a href="#" className="hover:text-white transition-colors"><iconify-icon icon="mdi:discord" className="text-2xl"></iconify-icon></a>
            </div>
          </div>
          {[
            { title: 'Engine', links: ['Architect Core', 'Visual Canvas', 'MCP Ecosystem', 'Universal Inference'] },
            { title: 'Knowledge', links: ['Documentation', 'Brain Marketplace', 'API Reference', 'System Status'] },
            { title: 'Organization', links: ['Our Vision', 'Careers', 'Legal & Privacy', 'Contact Support'] },
          ].map((column) => (
            <div key={column.title}>
              <h4 className="font-black text-sm uppercase tracking-widest mb-10">{column.title}</h4>
              <ul className="space-y-6 text-sm text-gray-500 font-medium">
                {column.links.map((link) => (
                  <li key={link} className="hover:text-white cursor-pointer transition-colors">{link}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="max-w-7xl mx-auto mt-24 pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-gray-600 text-xs font-black uppercase tracking-widest">© 2026 OPENBRAIN. ALL RIGHTS RESERVED.</p>
          <div className="flex items-center gap-8">
            <span className="flex items-center gap-3 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse"></span> System Healthy
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
