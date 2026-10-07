import { SkeletonBlock, SkeletonScreen } from '@/components/Skeleton';

// The generation space's page area: the fan of recent renders, then the
// command bar. The header and the rail stay on screen (AppChrome).
export default function GenerationLoading() {
  return (
    <SkeletonScreen
      label="Chargement de l'espace de génération"
      className="flex min-w-0 flex-1 flex-col overflow-hidden px-4 pt-5 min-[900px]:px-7.5"
    >
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-end">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock
              key={i}
              className={`h-[260px] w-[190px] flex-shrink-0 rounded-[18px] ${
                i === 0 ? '' : '-ml-6'
              } ${i > 1 ? 'hidden min-[640px]:block' : ''}`}
            />
          ))}
        </div>
      </div>
      <SkeletonBlock className="mb-5 h-[112px] w-full rounded-[20px]" />
    </SkeletonScreen>
  );
}
