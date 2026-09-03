import { SkeletonBlock, SkeletonScreen, SkeletonSidebar } from '@/components/Skeleton';

// Streamed instantly on navigation to /app while the page's queries run.
// Mirrors the dashboard's real geometry — two banners, four stat cards, the
// project grid — so nothing jumps when the data lands.
export default function DashboardLoading() {
  return (
    <SkeletonScreen label="Chargement du tableau de bord">
      <div className="flex min-h-screen bg-white">
        <SkeletonSidebar />
        <main className="flex-1 px-6 py-8">
          <div className="mx-auto max-w-[1100px]">
            <SkeletonBlock className="mb-7 h-7 w-[220px]" />

            <div className="mb-5 grid grid-cols-1 gap-4 min-[900px]:grid-cols-[42fr_58fr]">
              <SkeletonBlock className="aspect-[16/9] rounded-2xl min-[900px]:aspect-auto min-[900px]:h-[210px]" />
              <SkeletonBlock className="aspect-[16/9] rounded-2xl min-[900px]:aspect-auto min-[900px]:h-[210px]" />
            </div>

            <div className="mb-8 grid grid-cols-1 gap-4 min-[860px]:grid-cols-[1.4fr_1fr_1fr_1fr]">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonBlock key={i} className="h-[108px] rounded-2xl" />
              ))}
            </div>

            <SkeletonBlock className="mb-4 h-5 w-[140px]" />
            <div className="grid grid-cols-2 gap-3.5 min-[640px]:grid-cols-3 min-[1000px]:grid-cols-4 min-[1280px]:grid-cols-5">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-[#ECECF2]">
                  <SkeletonBlock className="aspect-[4/3] rounded-none" />
                  <div className="px-3 pb-3 pt-2.5">
                    <SkeletonBlock className="mb-2 h-3.5 w-4/5" />
                    <SkeletonBlock className="h-2.5 w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </SkeletonScreen>
  );
}
