import { ComingInPhase } from "@/components/coming-in-phase";

export const metadata = { title: "Daily Queue · Network Growth" };

export default function Page() {
  return (
    <ComingInPhase
      title="Daily Queue"
      phase={4}
      description="Today's prioritized candidates, with links to open each profile on LinkedIn and buttons to record what you sent."
    />
  );
}
