import React from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Shield, BarChart2, Users, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/Button';

const features = [
  {
    icon: <Shield size={20} className="text-[var(--color-accent)]" />,
    title: 'Verified Credibility',
    description:
      'Every expert is independently scored on their track record. No hype, no unverified claims — just data.',
  },
  {
    icon: <TrendingUp size={20} className="text-[var(--color-accent)]" />,
    title: 'Structured Trade Calls',
    description:
      'Experts publish entry, target, stop-loss, and conviction — giving you everything you need to evaluate a trade.',
  },
  {
    icon: <BarChart2 size={20} className="text-[var(--color-accent)]" />,
    title: 'Live Track Records',
    description:
      'Win rates, average returns, and call history are automatically computed and always up-to-date.',
  },
  {
    icon: <Users size={20} className="text-[var(--color-accent)]" />,
    title: 'Monetize Your Edge',
    description:
      'Experts earn directly through subscriptions, per-post unlocks, and tips — no platform intermediary cut.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <TrendingUp size={22} className="text-[var(--color-accent)]" />
          <span className="font-display font-bold text-xl text-[var(--color-text-primary)] tracking-tight">
            Hamilton
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login">
            <Button variant="secondary" size="sm">
              Sign in
            </Button>
          </Link>
          <Link to="/register">
            <Button variant="primary" size="sm">
              Get started
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="max-w-3xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-border-accent)] bg-[var(--color-accent-muted)] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
            <span className="text-xs font-medium text-[var(--color-accent)] font-mono uppercase tracking-wider">
              Now in Early Access
            </span>
          </div>

          <h1 className="font-display font-extrabold text-5xl sm:text-6xl text-[var(--color-text-primary)] leading-tight mb-6">
            Where serious investors
            <br />
            <span className="text-[var(--color-accent)]">follow serious traders.</span>
          </h1>

          <p className="text-lg text-[var(--color-text-secondary)] max-w-xl mx-auto mb-10 leading-relaxed font-body">
            Hamilton is the investment research marketplace with independently verified expert
            credibility scores, structured trade calls, and direct monetization — no fluff.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register">
              <Button variant="primary" size="lg" className="gap-2">
                Start for free <ArrowRight size={16} />
              </Button>
            </Link>
            <Link to="/register?role=expert">
              <Button variant="secondary" size="lg">
                Publish as an expert
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-bg-surface)]">
        <div className="max-w-4xl mx-auto px-6 py-6 grid grid-cols-3 gap-6 text-center">
          {[
            { value: '—', label: 'Verified Experts' },
            { value: '—', label: 'Trade Calls Published' },
            { value: '—', label: 'Avg Expert Win Rate' },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="font-mono text-2xl font-bold text-[var(--color-accent)]">{stat.value}</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1 uppercase tracking-wide">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-display font-bold text-3xl text-center text-[var(--color-text-primary)] mb-3">
            Built for the serious market participant
          </h2>
          <p className="text-center text-[var(--color-text-secondary)] mb-12 max-w-lg mx-auto">
            Everything on Hamilton is designed around accountability, transparency, and real edge.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-accent)] transition-colors duration-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-border-accent)]">
                    {feature.icon}
                  </div>
                  <h3 className="font-display font-semibold text-base text-[var(--color-text-primary)]">
                    {feature.title}
                  </h3>
                </div>
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6 border-t border-[var(--color-border)]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display font-bold text-3xl text-[var(--color-text-primary)] mb-4">
            Ready to trade with conviction?
          </h2>
          <p className="text-[var(--color-text-secondary)] mb-8">
            Join Hamilton and access independently verified expert research.
          </p>
          <Link to="/register">
            <Button variant="primary" size="lg">
              Create your account
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 py-6 border-t border-[var(--color-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-[var(--color-accent)]" />
          <span className="font-display font-bold text-sm text-[var(--color-text-tertiary)]">Hamilton</span>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          © {new Date().getFullYear()} Hamilton. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
