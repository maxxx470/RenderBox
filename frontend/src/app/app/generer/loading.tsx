import { SkeletonBlock, SkeletonScreen, SkeletonSidebar } from '@/components/Skeleton';

// The generation space: sidebar, title, the fan of recent renders, then the
// quick-start command bar pinned at the bottom.
export default function GenerationLoading() {
  return (
    <SkeletonScreen label="Chargement de l'espace de génération">
      <div className="flex h-screen bg-white">
        <SkeletonSidebar />
        <main className="flex flex-1 flex-col overflow-hidden px-7.5 pt-5.5">
          <SkeletonBlock className="mb-8 h-7 w-[200px]" />
          <div className="flex flex-1 items-center justify-center">
            <div className="flex items-end">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonBlock
                  key={i}
                  className={`h-[300px] w-[220px] flex-shrink-0 rounded-[18px] ${
                    i === 0 ? '' : '-ml-6'
                  }`}
                />
              ))}
            </div>
          </div>
          <SkeletonBlock className="mb-6 h-[104px] w-full rounded-[18px]" />
        </main>
      </div>
    </SkeletonScreen>
  );
}
