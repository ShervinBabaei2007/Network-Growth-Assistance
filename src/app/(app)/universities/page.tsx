import { ComingInPhase } from "@/components/coming-in-phase";

export const metadata = { title: "Universities · Network Growth" };

export default function Page() {
  return (
    <ComingInPhase
      title="Universities"
      phase={2}
      description="Progress by university and discipline, including the 125 U of T and 125 UBC targets."
    />
  );
}
