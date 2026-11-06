import { MESSAGES, type Messages } from "@/lib/i18n";
import { ResetCard } from "./reset-card";

export const metadata = { title: "Choose a new password · Network Growth", robots: { index: false } };

/** Only the English the card uses, sent with the page rather than bundled into its JavaScript. */
function resetEnglish(): Messages {
  const { auth, language, common } = MESSAGES.en;
  return { auth, language, common } as unknown as Messages;
}

export default function ResetPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <ResetCard english={resetEnglish()} />
    </main>
  );
}
