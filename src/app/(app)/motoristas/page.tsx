import type { Metadata } from "next";
import { RecordsList, type ListSearchParams } from "@/components/records/records-list";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Fichas de motoristas" };

export default async function Page({ searchParams }: { searchParams: Promise<ListSearchParams> }) {
  const user = await requirePageUser("records.read");
  return <RecordsList kind="driver" user={user} sp={await searchParams} />;
}
