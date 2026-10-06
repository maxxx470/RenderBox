'use client';

// The public pages' menu below the breakpoint where their section links no
// longer fit, after the owner's Metrio reference (Metrio 4.0,
// src/pages/landing/components/Header.tsx): a round three-bar button that
// turns into a cross, and a panel under the header with the links, one per
// row, then the language choice and the call to action at full width.
//
// Before this, the links simply disappeared below 860-920px: on a phone the
// landing and the public pages had no navigation at all.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageInlineSwitch } from '@/components/LanguageToggle';

export interface PublicMenuLink {
  href: string;
  label: string;
}

export function PublicMobileMenu({
  links,
  cta,
  className = '',
}: {
  links: PublicMenuLink[];
  cta?: PublicMenuLink | undefined;
  /** Breakpoint class that hides the whole thing where the inline links
      show, e.g. 'min-[920px]:hidden'. */
  className?: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const bar =
    'absolute left-1/2 h-[1.6px] w-[18px] -translate-x-1/2 rounded-full bg-[#17161F] transition-transform duration-200 ease-out';

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t(open ? 'landing.menuClose' : 'app.openMenu')}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#ECECF2] bg-white"
      >
        <span className={`${bar} ${open ? 'top-1/2 rotate-45' : 'top-[13px]'}`} />
        <span className={`${bar} top-1/2 ${open ? 'opacity-0' : ''}`} />
        <span className={`${bar} ${open ? 'top-1/2 -rotate-45' : 'top-[25px]'}`} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 top-[72px] z-30 bg-black/20"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="rb-pop-down absolute inset-x-3 top-full z-40 mt-1 rounded-[22px] border border-[#ECECF2] bg-white p-3 shadow-[0_24px_48px_-20px_rgba(23,22,31,0.35)]">
            <nav className="flex flex-col">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-[#ECECF2] px-3 py-3.5 text-[15px] font-medium text-[#17161F] last:border-b-0"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="mt-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-center rounded-full border border-[#ECECF2] py-3">
                <LanguageInlineSwitch className="text-[13px]" />
              </div>
              {cta && (
                <Link
                  href={cta.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center rounded-full bg-gradient-to-br from-[#16A34A] via-[#15803D] to-[#166534] py-3 text-[14px] font-semibold text-white"
                >
                  {cta.label}
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
