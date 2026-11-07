'use client';

// The right-hand column of the video workspace (2026-11-07, owner: « je
// propose que les éléments … un peu comme sur la page générée où il y a une
// bande verticale à droite », then « que tous les éléments tiennent dans la
// hauteur et la largeur de l'écran … qu'on n'ait pas besoin de scroller »).
//
// EVERYTHING HAS TO FIT, and that is what drove this layout. Twelve camera
// movements as a list of rows, eleven elements as a cloud of chips and the
// intensities underneath came to roughly 900px of column — taller than the
// screen gives it. As GRIDS OF TILES the same twenty-three choices take
// about half that, and a tile is read faster than a line of text.
//
// The icons are the owner's, generated as the rail's were — but in ONE flat
// colour, not the rail's coloured app tiles (« je veux pas qu'il y ait trop
// de couleurs … des couleurs unies »). A tile whose icon is not there yet
// shows its caption alone rather than a broken image, so the column works
// before and after the pictures land.
import { useLocale } from '@/lib/i18n/LocaleContext';
import { CHIP_ACTIVE, CHIP_BASE } from '../chip';
import {
  ANIMATION_INTENSITY,
  CAMERA_MOVES,
  CAMERA_MOVE_KEYS,
  ENVIRONMENT_ELEMENTS,
  ENVIRONMENT_KEYS,
  INTENSITY_KEYS,
  cameraIcon,
  cameraShort,
  environmentIcon,
  environmentShort,
  type CameraMoveKey,
  type EnvironmentKey,
  type IntensityKey,
} from '@/lib/server/generation/video-moves';

const LABEL =
  'mb-1.5 block font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#8A8896]';

/** The screen gives the column about 740px; six renders keep « Images
 *  récentes » from pushing the settings out of sight. The whole set stays
 *  one click away in the Galerie. */
const RECENT_SHOWN = 6;

/**
 * One choice: its glyph over a short caption.
 *
 * The glyph is an ALPHA MASK, not a picture (2026-11-07, owner: « est-ce
 * possible que tu mettes les images sur fond transparent et que, dans la
 * sélection, toute la surface blanche devienne bleue … les traits de
 * l'icône se mettent en blanc »). A white-backed raster showed its own
 * white square against the column's grey, and a selected tile could only
 * ever tint around it — « on ne sent même pas qu'on a sélectionné ». As a
 * mask the file carries the SHAPE and the colour comes from `currentColor`,
 * so the selected tile goes solid blue and the strokes turn white with it.
 *
 * 28px, not the 20px it started at: at 20 the four arrows of « Avancée » and
 * « Recul » collapsed into the same smudge and the two tiles could not be
 * told apart, which is the one thing these icons exist to prevent.
 *
 * A file that is not there yet simply paints nothing — no broken image, no
 * error handler — and the caption still names the choice.
 */
function Tile({
  icon,
  caption,
  title,
  on,
  onClick,
}: {
  icon: string;
  caption: string;
  title: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 transition-colors ${
        on ? 'bg-[#2948FC] text-white' : 'bg-[#F4F4F7] text-[#3D3B49] hover:bg-[#E9E9EE]'
      }`}
    >
      <span
        aria-hidden
        className="h-7 w-7 shrink-0 bg-current"
        style={{
          maskImage: `url("${icon}")`,
          maskSize: 'contain',
          maskPosition: 'center',
          maskRepeat: 'no-repeat',
          WebkitMaskImage: `url("${icon}")`,
          WebkitMaskSize: 'contain',
          WebkitMaskPosition: 'center',
          WebkitMaskRepeat: 'no-repeat',
        }}
      />
      <span className="w-full text-center text-[10.5px] font-medium leading-tight">{caption}</span>
    </button>
  );
}

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
    <div className="flex flex-col gap-4">
      <div>
        <span className={LABEL}>{t('video.camera')}</span>
        <div className="grid grid-cols-3 gap-1.5">
          {CAMERA_MOVE_KEYS.map((key) => (
            <Tile
              key={key}
              icon={cameraIcon(key)}
              caption={cameraShort(key, lang)}
              title={CAMERA_MOVES[key][lang]}
              on={key === camera}
              onClick={() => onChange({ camera: key })}
            />
          ))}
        </div>
      </div>

      <div>
        <span className={LABEL}>{t('video.environment')}</span>
        <div className="grid grid-cols-4 gap-1.5">
          {ENVIRONMENT_KEYS.map((key) => {
            const on = environment.includes(key);
            return (
              <Tile
                key={key}
                icon={environmentIcon(key)}
                caption={environmentShort(key, lang)}
                title={ENVIRONMENT_ELEMENTS[key][lang]}
                on={on}
                onClick={() =>
                  onChange({
                    environment: on ? environment.filter((k) => k !== key) : [...environment, key],
                  })
                }
              />
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-[#8A8896]">
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

      {recent.length > 0 && (
        <div>
          <span className={LABEL}>{t('video.recent')}</span>
          <div className="grid grid-cols-3 gap-1.5">
            {recent.slice(0, RECENT_SHOWN).map((r) => (
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
