import { GitBranch, History, MessageSquare, Users } from "lucide-react";
import React from "react";
import { Logo } from "../components/Logo";

const POINTS = [
  { icon: Users, title: "Edit together, live", text: "See collaborators' cursors and changes as they type." },
  { icon: GitBranch, title: "Documents with a lifecycle", text: "Draft, review and approve — with an audit trail." },
  { icon: History, title: "Time travel", text: "Every editing session is saved. Restore any version." },
  { icon: MessageSquare, title: "Discuss in context", text: "Threaded comments anchored to the exact text." },
];

export default function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-zinc-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#4f46e5" />
            <path d="M9 16a7 7 0 0 1 14 0M9 16a7 7 0 0 0 14 0" stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </svg>
          <span className="text-lg font-semibold tracking-tight">Converge</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">The workspace where engineering docs get written, reviewed and shipped.</h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map(({ icon: Icon, title: t, text }) => (
              <li key={t} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-200"><Icon size={17} /></span>
                <span>
                  <span className="block text-sm font-medium">{t}</span>
                  <span className="block text-sm text-zinc-400">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-zinc-500">Real-time collaboration · Role-based access · Versioned history</p>
      </div>

      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          <p className="mb-7 mt-1.5 text-sm text-zinc-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
