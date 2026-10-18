import { ResetCard } from "./reset-card";

export const metadata = { title: "Choose a new password · Network Growth", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <ResetCard />
    </main>
  );
}
