import { Skeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <Skeleton className="mb-2 h-4 w-28" />
      <Skeleton className="mb-8 h-8 w-72" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-[var(--radius-card)]" />
        ))}
      </div>
      <div className="mt-6 space-y-3 rounded-[var(--radius-card)] border border-line bg-white p-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  );
}
