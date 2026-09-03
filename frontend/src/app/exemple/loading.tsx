import { SkeletonBlock, SkeletonScreen } from '@/components/Skeleton';

export default function ExempleLoading() {
  return (
    <SkeletonScreen label="Chargement de l'exemple">
      <main className="min-h-screen">
        <div className="h-[57px] border-b border-[#ECECF2]" />
        <div className="mx-auto max-w-[1180px] px-6 py-12">
          <SkeletonBlock className="mb-3 h-8 w-[280px]" />
          <SkeletonBlock className="mb-8 h-4 w-[420px]" />
          <SkeletonBlock className="h-[420px] w-full rounded-2xl" />
        </div>
      </main>
    </SkeletonScreen>
  );
}
