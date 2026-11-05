import React from "react";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#4f46e5" />
      <path d="M9 16a7 7 0 0 1 14 0M9 16a7 7 0 0 0 14 0" stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-[15px] font-semibold tracking-tight text-zinc-900">Converge</span>
    </span>
  );
}
