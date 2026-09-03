import { SkeletonBlock, SkeletonScreen } from '@/components/Skeleton';

export default function ParametresLoading() {
  return (
    <SkeletonScreen label="Chargement des paramètres">
      <main className="min-h-screen">
        <div className="h-[57px] border-b border-[#ECECF2]" />
        <div className="mx-auto max-w-2xl px-6 py-12">
          <SkeletonBlock className="mb-6 h-8 w-[200px]" />
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} className="mb-4 h-[120px] w-full rounded-2xl" />
          ))}
        </div>
      </main>
    </SkeletonScreen>
  );
}
