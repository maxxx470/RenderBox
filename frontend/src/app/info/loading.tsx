import { SkeletonBlock, SkeletonScreen } from '@/components/Skeleton';

export default function InfoLoading() {
  return (
    <SkeletonScreen label="Chargement des informations">
      <main className="min-h-screen">
        <div className="h-[57px] border-b border-[#ECECF2]" />
        <div className="mx-auto max-w-[720px] px-6 py-12">
          <SkeletonBlock className="mb-3 h-8 w-[240px]" />
          <SkeletonBlock className="mb-9 h-4 w-[380px]" />
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="mb-3 h-[110px] w-full rounded-2xl" />
          ))}
        </div>
      </main>
    </SkeletonScreen>
  );
}
