import { SkeletonBlock, SkeletonScreen } from '@/components/Skeleton';

// The workspace's page area: the canvas beside the materials panel, the
// command bar underneath. The header and the rail stay on screen (AppChrome).
export default function ProjectLoading() {
  return (
    <SkeletonScreen label="Chargement du projet" className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col px-6.5 py-5.5">
          <SkeletonBlock className="mb-3 h-4 w-[240px]" />
          <SkeletonBlock className="flex-1 rounded-2xl" />
        </div>
        <div className="m-2.5 hidden w-[280px] flex-shrink-0 flex-col rounded-2xl bg-white px-4 py-4.5 min-[1100px]:flex">
          <SkeletonBlock className="mb-4 h-3 w-[110px]" />
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="mb-2.5 h-12 w-full rounded-xl" />
          ))}
        </div>
      </div>
      <div className="px-5.5 pb-4.5 pt-2">
        <SkeletonBlock className="h-[112px] w-full rounded-[20px]" />
      </div>
    </SkeletonScreen>
  );
}
