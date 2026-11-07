'use client';

// The right-hand column of the video workspace (2026-11-07, owner: « je
// propose que les éléments … un peu comme sur la page générée où il y a une
// bande verticale à droite »).
//
// Same role as « À améliorer » on Enhance and « Images récentes » on the
// generator: a vertical white band flush against the right edge, holding the
// choices that describe the SHOT — how the camera moves, what is allowed to
// move with it, and how much. The command bar keeps what describes the FILE:
// the source, the words, the size, the duration and the engine.
//
// Splitting them that way is why the bar stopped being a wall of chips: the
// twelve movements and the eleven elements never fitted a single row, and
// laid flat across the page they read as a form rather than a workspace.
import { useLocale } from '@/lib/i18n/LocaleContext';
import { CHIP_ACTIVE, CHIP_BASE } from '../chip';
import {
  ANIMATION_INTENSITY,
  CAMERA_MOVES,
  CAMERA_MOVE_KEYS,
  ENVIRONMENT_ELEMENTS,
  ENVIRONMENT_KEYS,
  INTENSITY_KEYS,
  type CameraMoveKey,
  type EnvironmentKey,
  type IntensityKey,
} from '@/lib/server/generation/video-moves';

const LABEL =
  'mb-2 block font-[family-name:var(--font-mono)] text-[11px] font-medium uppercase tracking-[0.14em] text-[#8A8896]';

export function VideoSettings({
  camera,
  environment,
  intensity,
  onChange,
  recent,
  sourceId,
  onPickRecent,
}: {
  camera: CameraMoveKey;
  environment: EnvironmentKey[];
  intensity: IntensityKey;
  onChange: (next: {
    camera?: CameraMoveKey;
    environment?: EnvironmentKey[];
    intensity?: IntensityKey;
  }) => void;
  /** The account's own renders, in the column as on the generator. */
  recent: readonly { id: string; projectName: string }[];
  sourceId: string | null;
  onPickRecent: (id: string) => void;
}) {
  const { t, locale } = useLocale();
  const lang = locale === 'fr' ? 'fr' : 'en';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className={LABEL}>{t('video.camera')}</span>
        {/* One per line: twelve movements read as a list, not as a cloud. */}
        <div className="flex flex-col gap-1">
          {CAMERA_MOVE_KEYS.map((key) => {
            const on = key === camera;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ camera: key })}
                className={`flex w-full cursor-pointer items-center rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                  on
                    ? 'bg-[#EEF1FF] font-semibold text-[#1E36D6]'
                    : 'text-[#3D3B49] hover:bg-[#F4F4F7]'
                }`}
              >
                {CAMERA_MOVES[key][lang]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className={LABEL}>{t('video.environment')}</span>
        <div className="flex flex-wrap gap-1.5">
          {ENVIRONMENT_KEYS.map((key) => {
            const on = environment.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange({
                    environment: on ? environment.filter((k) => k !== key) : [...environment, key],
                  })
                }
                className={`cursor-pointer ${on ? CHIP_ACTIVE : CHIP_BASE}`}
              >
                {ENVIRONMENT_ELEMENTS[key][lang]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-[#8A8896]">
          {t('video.environmentNote')}
        </p>
      </div>

      <div>
        <span className={LABEL}>{t('video.intensity')}</span>
        <div className="flex flex-wrap gap-1.5">
          {INTENSITY_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === intensity}
              onClick={() => onChange({ intensity: key })}
              className={`cursor-pointer ${key === intensity ? CHIP_ACTIVE : CHIP_BASE}`}
            >
              {ANIMATION_INTENSITY[key][lang]}
            </button>
          ))}
        </div>
      </div>

      {/* « Images récentes » belongs in this column, three per row, exactly
          where the image generator keeps it — not as a strip across the
          stage, which is what pushed the video panel off to one side. */}
      {recent.length > 0 && (
        <div>
          <span className={LABEL}>{t('video.recent')}</span>
          <div className="grid grid-cols-3 gap-1.5">
            {recent.map((r) => (
              <button
                key={r.id}
                type="button"
                title={r.projectName}
                onClick={() => onPickRecent(r.id)}
                className={`aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-lg ${
                  r.id === sourceId ? 'ring-2 ring-[#2948FC]' : 'ring-1 ring-[#ECECF2]'
                }`}
              >
                <img
                  src={`/api/render-nodes/${r.id}/image?size=thumb`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
