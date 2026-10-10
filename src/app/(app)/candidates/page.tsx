import { ComingInPhase } from "@/components/coming-in-phase";

export const metadata = { title: "Candidates · Network Growth" };

export default function Page() {
  return (
    <ComingInPhase
      title="Candidates"
      phase={3}
      description="Search, filter, review and add candidates. Duplicate LinkedIn profiles are blocked automatically."
    />
  );
}
