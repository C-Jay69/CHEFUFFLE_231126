'use client';

import Link from 'next/link';
import { useState } from 'react';

const LINKS = [
  { href: '/#product', label: 'Product' },
  { href: '/#modules', label: 'Modules' },
  { href: '/#why', label: 'Why Whiteout' },
  { href: '/pricing', label: 'Pricing' },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#060a13]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center" onClick={() => setOpen(false)}>
          <img
            src="/whiteout-logo.png"
            alt="Whiteout"
            className="h-8 w-auto object-contain"
          />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-body-sm text-body-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className="flex h-10 items-center rounded-lg px-3 font-body-sm text-body-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            Sign in
          </Link>
          <Link
            href="/serve"
            className="flex h-10 items-center gap-1.5 rounded-lg bg-white px-4 font-body-sm text-body-sm font-bold text-[#0c1322] transition-colors hover:bg-white/90"
          >
            Open the terminal
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary hover:bg-white/5 hover:text-text-primary md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          <span className="material-symbols-outlined">{open ? 'close' : 'menu'}</span>
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-[#060a13] px-4 pb-4 md:hidden">
          <nav className="flex flex-col gap-1 pt-3">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 font-body-sm text-body-sm font-semibold text-text-secondary hover:bg-white/5 hover:text-text-primary"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 font-body-sm text-body-sm font-semibold text-text-secondary hover:bg-white/5 hover:text-text-primary"
            >
              Sign in
            </Link>
          </nav>
          <Link
            href="/serve"
            onClick={() => setOpen(false)}
            className="mt-2 flex h-11 items-center justify-center gap-1.5 rounded-lg bg-white font-body-sm text-body-sm font-bold text-[#0c1322]"
          >
            Open the terminal
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </div>
      )}
    </header>
  );
}
