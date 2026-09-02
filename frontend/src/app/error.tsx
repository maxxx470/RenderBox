'use client';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4">
      <h1 className="font-[family-name:var(--font-general-sans)] text-2xl font-bold text-[#17161F]">
        Something went wrong
      </h1>
      <p className="text-center text-[#8A8896]">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-[#17161F] px-5 py-2.5 text-sm font-medium text-white transition-transform duration-150 ease-out active:scale-[0.97] hover:bg-[#3D3B49]"
      >
        Try again
      </button>
    </main>
  );
}
