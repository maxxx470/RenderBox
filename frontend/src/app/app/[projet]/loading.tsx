import { SkeletonBlock, SkeletonScreen } from '@/components/Skeleton';

// The workspace: mode rail on the left, canvas in the middle, materials panel
// on the right, command bar underneath.
export default function ProjectLoading() {
  return (
    <SkeletonScreen label="Chargement du projet">
      <div className="flex h-screen flex-col bg-white">
        <div className="flex min-h-0 flex-1">
          <div className="m-2.5 hidden w-[230px] flex-shrink-0 flex-col rounded-2xl border border-[#DEDEE8] bg-[#F7F7FA] px-3.5 py-4.5 min-[900px]:flex">
            <SkeletonBlock className="mb-3 h-8 w-8 self-end rounded-lg" />
            <SkeletonBlock className="mb-1.5 h-9 w-full rounded-xl" />
            <SkeletonBlock className="mb-4 h-9 w-full rounded-xl" />
            <SkeletonBlock className="mb-3.5 h-3 w-[80px]" />
            {[0, 1, 2].map((i) => (
              <SkeletonBlock key={i} className="mb-1.5 h-8 w-full rounded-lg" />
            ))}
          </div>

          <div className="flex flex-1 flex-col px-4 py-4">
            <SkeletonBlock className="mb-3 h-4 w-[240px]" />
            <SkeletonBlock className="flex-1 rounded-2xl" />
          </div>

          <div className="m-2.5 hidden w-[280px] flex-shrink-0 flex-col rounded-2xl border border-[#DEDEE8] bg-white px-4 py-4.5 min-[1100px]:flex">
            <SkeletonBlock className="mb-4 h-3 w-[110px]" />
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBlock key={i} className="mb-2.5 h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
        <div className="px-5.5 pb-4.5 pt-2">
          <SkeletonBlock className="h-[104px] w-full rounded-[18px]" />
        </div>
      </div>
    </SkeletonScreen>
  );
}
