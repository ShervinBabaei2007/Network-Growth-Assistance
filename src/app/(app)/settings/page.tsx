import { ComingInPhase } from "@/components/coming-in-phase";

export const metadata = { title: "Settings · Network Growth" };

export default function Page() {
  return (
    <ComingInPhase
      title="Settings"
      phase={2}
      description="Targets, discipline priority, daily planning limits and the pause switch."
    />
  );
}
