import { ComingInPhase } from "@/components/coming-in-phase";

export const metadata = { title: "Analytics · Network Growth" };

export default function Page() {
  return (
    <ComingInPhase
      title="Analytics"
      phase={7}
      description="Invitations sent, acceptances over time and acceptance rate, using only data you have recorded."
    />
  );
}
