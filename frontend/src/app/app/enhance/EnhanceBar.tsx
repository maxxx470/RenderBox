'use client';

// The Enhance page's command bar (owner, 2026-10-08): the same white frame,
// glow and big send button as the workspace's CommandBar, with less in it —
// the user's own description of what to improve (enough on its own, with
// nothing ticked in the column), the paperclip that brings the render in,
// then the ratio and the image size. Intensity and engine live in the right
// column with the improvements. One height whatever is pinned, as the
// CommandBar: the thumbnail sits beside the paperclip.
import { useEffect, useRef } from 'react';
import { Send } from 'react-iconly';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { EngineName } from '@/lib/server/generation/engines/types';
import type { RatioKey } from '@/lib/server/generation/ratios';
import type { ResolutionKey } from '@/lib/server/generation/resolutions';
import { GLOW, Pinned, ROUND, type PinnedImage } from '../CommandBar';
import { Glyph } from '../RailIcon';
import { RatioSelect } from '../RatioSelect';
import { ResolutionSelect } from '../ResolutionSelect';
import { ACCEPTED_UPLOAD_TYPES } from '../upload-types';

export function EnhanceBar({
  instruction,
  onInstructionChange,
  onAttach,
  pinned,
  ratio,
  onRatioChange,
  resolution,
  onResolutionChange,
  engine,
  onSubmit,
  sendDisabled,
  sendHint,
  working,
}: {
  instruction: string;
  onInstructionChange: (v: string) => void;
  onAttach: (file: File) => void;
  /** The render being improved, once attached. */
  pinned: PinnedImage | null;
  ratio: RatioKey;
  onRatioChange: (ratio: RatioKey) => void;
  resolution: ResolutionKey;
  onResolutionChange: (resolution: ResolutionKey) => void;
  engine: EngineName;
  onSubmit: () => void;
  sendDisabled: boolean;
  /** Why the send button is off. */
  sendHint?: string | undefined;
  working: boolean;
}) {
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const showHint = Boolean(sendHint && sendDisabled && !working);

  // The text grows with what is typed, up to four lines, then scrolls.
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 104)}px`;
  }, [instruction]);

  const send = (big: boolean) => (
    <button
      type="button"
      disabled={sendDisabled || working}
      onClick={onSubmit}
      aria-label={t('enhance.submit')}
      title={t('enhance.submit')}
      className={
        big
          ? 'group hidden w-[104px] flex-shrink-0 flex-col items-center justify-center gap-2 rounded-[18px] bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] text-[12px] font-semibold text-white shadow-[0_10px_22px_-10px_rgba(41,72,252,0.8)] transition-[filter,transform] duration-150 ease-out enabled:hover:brightness-110 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none min-[640px]:flex'
          : 'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 min-[640px]:hidden'
      }
    >
      {working ? (
        <span className="rb-spin h-5 w-5 rounded-full border-2 border-white/40 border-t-white" />
      ) : (
        <span className="transition-transform duration-150 ease-out group-enabled:group-hover:-translate-y-0.5">
          <Send set="curved" size={big ? 26 : 18} primaryColor="#ffffff" />
        </span>
      )}
      {big && <span className="px-1 text-center leading-tight">{t('enhance.submit')}</span>}
    </button>
  );

  return (
    // z-20 like the CommandBar: the ratio and size menus open upwards.
    <div className="relative isolate z-20 px-2.5 pb-2.5 pt-3 min-[640px]:px-5 min-[640px]:pb-4 min-[640px]:pt-5">
      <div className="relative">
        <div aria-hidden className={GLOW} />
        <div className="rounded-[24px] bg-white p-2 shadow-[0_24px_60px_-28px_rgba(41,72,252,0.55),0_1px_2px_rgba(23,22,31,0.06)]">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_UPLOAD_TYPES.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAttach(file);
              e.target.value = '';
            }}
          />
          <div className="flex gap-2">
            <div className="flex min-w-0 flex-1 flex-col rounded-[18px] bg-[#F4F4F7] px-3 pb-2.5 pt-3 min-[640px]:px-4">
              <textarea
                ref={promptRef}
                rows={1}
                placeholder={t('enhance.barPlaceholder')}
                value={instruction}
                disabled={working}
                maxLength={2000}
                onChange={(e) => onInstructionChange(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter breaks the line — as in a chat.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!sendDisabled && !working) onSubmit();
                  }
                }}
                className="block w-full resize-none bg-transparent px-0.5 py-1 text-[15px] leading-[1.5] text-[#17161F] caret-[#2948FC] outline-none placeholder:text-[#8A8896] disabled:cursor-not-allowed min-[640px]:text-[17px]"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={working}
                  onClick={() => fileRef.current?.click()}
                  aria-label={t('enhance.attach')}
                  title={t('enhance.attach')}
                  className={ROUND}
                >
                  <Glyph name="clip" size={15} color="#3D3B49" />
                </button>
                {pinned && <Pinned image={pinned} removeLabel={t('app.cmdRemoveAttachment')} />}
                <span
                  className={`min-w-0 flex-1 truncate text-[12px] ${
                    showHint ? 'text-[#6B6878]' : 'text-[#8A8896]'
                  }`}
                >
                  {showHint ? sendHint : pinned ? '' : t('enhance.attach')}
                </span>
                {send(false)}
              </div>
            </div>
            {send(true)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-0.5 pb-0.5 pt-2">
            <RatioSelect
              ratio={ratio}
              onChange={onRatioChange}
              engine={engine}
              disabled={working}
            />
            <ResolutionSelect
              resolution={resolution}
              onChange={onResolutionChange}
              engine={engine}
              disabled={working}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
