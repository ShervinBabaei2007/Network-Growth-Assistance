import { ComingInPhase } from "@/components/coming-in-phase";

export const metadata = { title: "Disciplines · Network Growth" };

export default function Page() {
  return (
    <ComingInPhase
      title="Disciplines"
      phase={2}
      description="Accepted connections, pending invitations and remaining targets for each discipline."
    />
  );
}
