import { SkeletonBlock, SkeletonScreen } from '@/components/Skeleton';

// Streamed instantly on navigation to any /app page without a skeleton of
// its own. Only the page area: the header and the rail are the layout's
// (AppChrome) and stay on screen while this shows.
export default function AppLoading() {
  return (
    <SkeletonScreen
      label="Chargement"
      className="min-w-0 flex-1 overflow-hidden bg-[#FBFBFD] px-4 py-6 min-[640px]:px-6 min-[640px]:py-8"
    >
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-6 grid grid-cols-2 gap-3 min-[860px]:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
        <SkeletonBlock className="mb-4 h-5 w-[160px]" />
        <div className="grid grid-cols-2 gap-3.5 min-[640px]:grid-cols-3 min-[1000px]:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-[#ECECF2] bg-white">
              <SkeletonBlock className="aspect-[4/3] rounded-none" />
              <div className="px-3 pb-3 pt-2.5">
                <SkeletonBlock className="mb-2 h-3.5 w-4/5" />
                <SkeletonBlock className="h-2.5 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
