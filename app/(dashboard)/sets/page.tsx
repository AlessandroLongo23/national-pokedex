import { SETS } from "@/lib/data";
import { PageHeader } from "../_components/PageHeader";
import { SetsTable } from "../_components/SetsTable";

export default function SetsPage() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Sets"
        subtitle={
          <>
            {SETS.length} sets in the catalog · click a set to view its cards and log a pack
          </>
        }
      />
      <SetsTable />
    </div>
  );
}
