import React from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Shield, BarChart2, ArrowRight, CheckCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { HeroSection } from '../components/kol/HeroSection';

const VALUE_PROPS = [
  {
    icon: <Shield size={16} className="text-[var(--color-accent)]" />,
    title: 'Verified Track Records',
    desc: 'Win rates and returns auto-computed from real published calls. No self-reported numbers.',
  },
  {
    icon: <BarChart2 size={16} className="text-[var(--color-accent)]" />,
    title: 'Structured Trade Calls',
    desc: 'Entry, target, stop-loss, conviction — full context before you commit.',
  },
  {
    icon: <TrendingUp size={16} className="text-[var(--color-accent)]" />,
    title: 'Expert Monetization',
    desc: 'Experts earn via subscriptions, unlocks, and tips. Aligned incentives.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] flex flex-col">

      {/* ── Nav ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-base)]/90 backdrop-blur-sm">
        <Link to="/" className="flex items-center gap-2">
          <TrendingUp size={20} className="text-[var(--color-accent)]" />
          <span className="font-display font-bold text-lg text-[var(--color-text-primary)] tracking-tight">
            Hamilton
          </span>
        </Link>

        <nav className="hidden sm:flex items-center gap-6">
          <a href="#how-it-works" className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
            How it works
          </a>
          <a href="#for-experts" className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
            For experts
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="secondary" size="sm">Sign in</Button>
          </Link>
          <Link to="/register">
            <Button variant="primary" size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      {/* ── Hero copy ─────────────────────────────────────────── */}
      <section className="px-6 pt-14 pb-8 text-center max-w-3xl mx-auto w-full">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-border-accent)] bg-[var(--color-accent-muted)] mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
          <span className="text-xs font-medium text-[var(--color-accent)] font-mono uppercase tracking-wider">
            Live market data
          </span>
        </div>

        <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-[var(--color-text-primary)] leading-tight mb-4">
          Follow traders with{' '}
          <span className="text-[var(--color-accent)]">proven track records.</span>
        </h1>

        <p className="text-base text-[var(--color-text-secondary)] max-w-xl mx-auto mb-8 leading-relaxed">
          Hamilton independently verifies expert credibility from real trade calls.
          Discover who's actually right — and follow their next move.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
          <Link to="/register">
            <Button variant="primary" size="lg" className="gap-2">
              Start for free <ArrowRight size={15} />
            </Button>
          </Link>
          <Link to="/register?role=expert">
            <Button variant="secondary" size="lg">
              Publish as an expert
            </Button>
          </Link>
        </div>

        <p className="text-xs text-[var(--color-text-tertiary)]">
          No credit card required · Free to browse
        </p>
      </section>

      {/* ── Market Pulse Hero Section ─────────────────────────── */}
      <section className="px-6 pb-12 max-w-6xl mx-auto w-full">
        <HeroSection isLoggedIn={false} />
      </section>

      {/* ── Value props (compact) ─────────────────────────────── */}
      <section id="how-it-works" className="border-t border-[var(--color-border)] bg-[var(--color-bg-surface)] px-6 py-10">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-display font-bold text-xl text-[var(--color-text-primary)] text-center mb-8">
            Built for accountability
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {VALUE_PROPS.map((v) => (
              <div key={v.title} className="flex gap-3">
                <div className="p-2 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-border-accent)] h-fit flex-shrink-0">
                  {v.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">{v.title}</p>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For experts callout ───────────────────────────────── */}
      <section id="for-experts" className="px-6 py-10 border-t border-[var(--color-border)]">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="flex-1">
            <p className="text-xs font-mono text-[var(--color-accent)] uppercase tracking-widest mb-2">For experts</p>
            <h3 className="font-display font-bold text-xl text-[var(--color-text-primary)] mb-2">
              Monetize your edge directly
            </h3>
            <div className="flex flex-col gap-1.5">
              {['Recurring subscriber revenue', 'Per-post unlock pricing', 'Tips from your audience'].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle size={13} className="text-[var(--color-accent)] flex-shrink-0" />
                  <span className="text-sm text-[var(--color-text-secondary)]">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <Link to="/register?role=expert">
            <Button variant="primary" size="md" className="gap-2 whitespace-nowrap">
              Apply as expert <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────── */}
      <section className="px-6 py-12 border-t border-[var(--color-border)] bg-[var(--color-bg-surface)]">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="font-display font-bold text-2xl text-[var(--color-text-primary)] mb-3">
            Ready to trade smarter?
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            Join Hamilton and access the only marketplace with independently verified expert credibility scores.
          </p>
          <Link to="/register">
            <Button variant="primary" size="lg">Create free account</Button>
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="px-6 py-5 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-[var(--color-accent)]" />
          <span className="font-display font-bold text-sm text-[var(--color-text-tertiary)]">Hamilton</span>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          © {new Date().getFullYear()} Hamilton. All rights reserved.
        </p>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors">
            Sign in
          </Link>
          <Link to="/register" className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors">
            Register
          </Link>
        </div>
      </footer>
    </div>
  );
}
