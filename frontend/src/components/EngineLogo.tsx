// An engine's symbol on its small white tile — legible on the engine's own
// filled chip (red, yellow) as on white. Decorative: the engine's name is
// always written beside it.
import type { EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_LOGOS } from '@/lib/server/generation/engine-labels';

export function EngineLogo({ engine, size = 16 }: { engine: EngineName; size?: number }) {
  return (
    <img
      src={ENGINE_LOGOS[engine]}
      alt=""
      aria-hidden
      width={size}
      height={size}
      draggable={false}
      className="flex-shrink-0 bg-white"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.26) }}
    />
  );
}
