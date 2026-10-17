import Link from "next/link";
import { ContactLine, LegalPage, Operator } from "@/components/legal/legal-page";

export const metadata = { title: "Terms of Service · Network Growth" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms are an agreement between you and <Operator /> (“we”, “us”) about Network Growth
        Assistant (“the service”). By using the service you agree to them. If you do not agree, please do not
        use it. Questions: <ContactLine />. Our <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link> explains how we handle personal information.
      </p>

      <h2>What the service is</h2>
      <p>
        A planning and tracking tool for networking and job searching. It keeps your lists, suggests who to
        contact and which jobs fit, and helps draft documents. It is a personal organizer, not a
        recruiter, an employer or a job guarantee. It is provided free of charge. If we ever charge for it,
        we will tell you first and you will not be billed without agreeing.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You are responsible for your account and for the email or Google account you use to sign in.</li>
        <li>You must be at least 16. If you are under the age of majority where you live (19 in British Columbia), you confirm that a parent or guardian knows you are using the service and agrees.</li>
        <li>Provide accurate information, and tell us if you think someone else has accessed your account.</li>
        <li>You are responsible for what you add and for having the right to add it, including information about other people.</li>
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
        Subject to the next paragraph, the service is provided “as is”: we do not promise that it will be
        available, error-free or suited to a particular purpose, and it may change or be discontinued. To
        the extent the law allows, we are not liable for lost opportunities, lost data or indirect or
        consequential damages arising from your use of the service, and our total liability to you for any
        claim is limited to the amount you paid us for the service, which for a free service is nothing.
        Keep your own copies of anything important.
      </p>
      <p>
        Nothing in these terms excludes or limits any right or remedy you have under British Columbia or
        Canadian law that cannot be excluded or limited, including consumer protection law such as the
        Business Practices and Consumer Protection Act, or liability for our own fraud or gross negligence.
      </p>

      <h2>Ending use</h2>
      <p>
        You can stop at any time and delete your account in Settings. We may suspend or close accounts that
        break these terms or put the service or other people at risk. If we close your account for another
        reason, we will give you reasonable notice and a chance to export your data where we can.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. If a change matters, we will update the date above and, where we can,
        tell you in the app. Continuing to use the service after a change means you accept it.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the Province of British Columbia and the federal laws of
        Canada that apply there. Any dispute that cannot be resolved by talking it through will be decided by
        the courts of British Columbia, and you and we submit to their jurisdiction. This does not take away
        any right you have to bring a claim in another place where the law gives you that right.
      </p>
    </LegalPage>
  );
}
