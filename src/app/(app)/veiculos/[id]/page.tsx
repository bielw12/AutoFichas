import type { Metadata } from "next";
import { RecordDetailPage } from "@/components/detail/record-detail-page";

export const metadata: Metadata = { title: "Ficha de veículos" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <RecordDetailPage kind="vehicle" id={id} tab={tab} />;
}
