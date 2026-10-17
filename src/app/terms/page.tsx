import { ContactLine, LegalPage } from "@/components/legal/legal-page";

export const metadata = { title: "Terms of Service · Network Growth" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        By using Network Growth Assistant (“the service”) you agree to these terms. If you do not agree,
        please do not use it. Questions: <ContactLine />.
      </p>

      <h2>What the service is</h2>
      <p>
        A planning and tracking tool for networking and job searching. It keeps your lists, suggests who to
        contact and which jobs fit, and helps draft documents. It is a personal organizer, not a
        recruiter, an employer or a job guarantee.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You are responsible for your account and for the email account used to sign in.</li>
        <li>You must be at least 16 and provide accurate information.</li>
        <li>You are responsible for what you add and for having the right to add it.</li>
      </ul>

      <h2>LinkedIn and other websites</h2>
      <p>
        The service does not access LinkedIn on your behalf and is not affiliated with or endorsed by
        LinkedIn, Google or any employer. You send invitations and messages yourself and must follow the
        rules of the sites you use, including LinkedIn&apos;s User Agreement. Do not use the service to
        spam, harass or mislead people.
      </p>

      <h2>Jobs, matches and AI output</h2>
      <ul>
        <li>Job listings come from third parties and can be wrong, out of date or removed. “Verified” means the listing was found at its source, not that the employer is endorsed or that a job is still open.</li>
        <li>Fit scores, suggestions and AI-written text (tailored resumes, cover letters, notes) can contain mistakes. Read and correct everything before you use it. You are responsible for what you send to anyone, and for the accuracy of your applications.</li>
        <li>People found through Discover come from public sources and may be mismatched or out of date. Check before you contact anyone.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>
        Do not break the law, attack or overload the service, try to access other people&apos;s data, use
        automated tools to bulk-create accounts, or upload content that is unlawful or that you have no
        right to share.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of what you upload and create. You give us permission to store and process it
        only to run the service for you, as described in the Privacy Policy. You can export or delete it at
        any time in Settings.
      </p>

      <h2>No warranty and limits</h2>
      <p>
        The service is provided “as is”, without promises that it will be available, error-free or fit for
        a particular purpose, and it may change or be discontinued. To the extent the law allows, we are
        not liable for lost opportunities, lost data or indirect damages arising from your use of the
        service. Nothing here limits rights you have under law that cannot be waived. Keep your own copies
        of anything important.
      </p>

      <h2>Ending use</h2>
      <p>
        You can stop at any time and delete your account in Settings. We may suspend accounts that break
        these terms or put the service at risk.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. If a change matters, we will update the date above. Continuing to use the
        service after a change means you accept it.
      </p>
    </LegalPage>
  );
}
