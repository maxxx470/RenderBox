import type { ReactNode } from 'react';

/**
 * The head of every app page, after Metrio's (owner, 2026-10-07: "un titre
 * pour chaque page, le titre en gras et un petit texte"): a small uppercase
 * eyebrow, the page title in Poppins Black, an optional one-line subtitle,
 * and an optional action on the right ("Demander à l'assistant" on Metrio's
 * dashboard). The header bar above still names the page too, as on Metrio.
 *
 * `align="center"` is Metrio's subscription head: the eyebrow becomes a small
 * green-tinted pill and the block is centred over the page.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  align = 'left',
  className = 'mb-6',
}: {
  eyebrow: string;
  title: string;
  subtitle?: string | undefined;
  action?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  if (align === 'center') {
    return (
      <div className={`text-center ${className}`}>
        <span className="mb-1.5 inline-block rounded-full bg-[#E8F5EC] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-widest text-[#166534]">
          {eyebrow}
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-[24px] font-black leading-tight tracking-tight text-[#17161F] min-[640px]:text-[30px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-[12.5px] font-medium text-[#6B6878] min-[640px]:text-[14px]">
            {subtitle}
          </p>
        )}
      </div>
    );
  }
  return (
    <div
      className={`flex flex-col gap-3 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between ${className}`}
    >
      <div className="min-w-0">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-[#4B4A57]">
          {eyebrow}
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-[22px] font-black leading-none tracking-tight text-[#17161F] min-[640px]:text-[24px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-[13px] text-[#6B6878]">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0 self-start min-[640px]:self-auto">{action}</div>}
    </div>
  );
}
