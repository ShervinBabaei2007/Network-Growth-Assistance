import { canonicalFor } from "@/lib/site";
import { ContactLine, LegalPage, Operator } from "@/components/legal/legal-page";

export const metadata = {
  title: "Privacy Policy · Network Growth",
  description: "What Network Growth stores, why, and how to export or delete your data.",
  ...canonicalFor("/privacy"),
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Network Growth Assistant (“the service”) helps you plan LinkedIn networking and a job search. It
        is operated from British Columbia, Canada, and this policy is written to follow British Columbia&apos;s{" "}
        <em>Personal Information Protection Act</em> (PIPA) and, where it applies, the federal{" "}
        <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA). It says what we
        collect, why, who else handles it, and how to see, correct or remove it.
      </p>

      <h2>Who is responsible</h2>
      <p>
        <Operator /> is responsible for the personal information described here and is the person who
        handles privacy questions and requests. Contact: <ContactLine />.
      </p>

      <h2>What this app never does</h2>
      <ul>
        <li>It never asks for your LinkedIn password or cookies.</li>
        <li>It never scrapes LinkedIn, sends invitations or messages for you, or acts on your LinkedIn account. You do that yourself.</li>
        <li>It does not sell your personal information or show advertising.</li>
      </ul>

      <h2>What we collect, and why</h2>
      <p>We collect only what is needed to run the features you use:</p>
      <ul>
        <li><strong>Your account</strong> (to sign you in and keep your data separate from everyone else&apos;s): your email address and, if you use Google sign-in, the name and email Google shares with us. We do not receive your Google password.</li>
        <li><strong>What you add</strong> (to provide the tracking you asked for): candidates and people you save, notes, tags and reminders, your schools, disciplines and targets, saved jobs, applications, interviews, saved searches and settings.</li>
        <li><strong>Your resume</strong> (to check job fit and draft tailored versions): the file you upload, the text read from it, and any tailored versions and cover letters you create. Files are kept in private storage that only your account can read.</li>
        <li><strong>Imports</strong> (to avoid suggesting people you already know): from a LinkedIn data export or contact list we keep names, companies, positions and dates. Email addresses in those files are not stored, and the file itself is not kept.</li>
        <li><strong>Your own AI key</strong>, if you add one (to run AI features on your account): stored encrypted and never sent to your browser.</li>
        <li><strong>Operational records</strong> (to deliver alerts and keep the service safe): notifications, email delivery records and usage counters used to limit abuse.</li>
        <li><strong>Cookies</strong>: a sign-in session cookie and a cookie that remembers your display settings (theme, density, text size). We do not use advertising or analytics cookies.</li>
      </ul>

      <h2>Page speed and error reports</h2>
      <p>
        To keep the service fast and fix problems, your browser sends us small reports about how pages performed (for
        example how long the main content took to appear) and about errors that occurred. They are sent to our own
        database, not to an analytics or error-tracking company. A report holds only the type of page (such as
        &ldquo;/applications/[id]&rdquo;, never a name or an id), the measurement or a cleaned error message, and
        whether the device is a phone or a computer. We remove email addresses, keys, links, ids and profile
        addresses from error messages before saving them. Reports are not linked to your account, your IP address
        is not stored with them, and they are deleted after 30 days (measurements) or 90 days (errors). If your
        browser sends &ldquo;Do Not Track&rdquo;, no reports are sent.
      </p>

      <h2>Your consent</h2>
      <p>
        By creating an account and using a feature, you consent to us collecting, using and disclosing your
        personal information for the purposes above. Optional features need a further step from you, such as
        adding an AI key, using an AI feature or turning on email alerts. You can withdraw consent at any
        time by deleting the data in question or your account (see “Your rights”), though some features
        cannot work without it.
      </p>

      <h2>Information about other people</h2>
      <p>
        You may add information about other people, such as candidates, contacts and people found through
        Discover. Add only what you are entitled to use, such as details they made public or that you know
        through your own work, and use it only to manage your own networking and job search. Discover
        reads public pages only and never LinkedIn. If you are in someone&apos;s list and want your
        information removed, contact us at <ContactLine /> and we will help, including by removing it from
        the account concerned where we can identify it.
      </p>

      <h2>Who else handles your information</h2>
      <ul>
        <li><strong>Supabase</strong> hosts the database, sign-in and file storage.</li>
        <li><strong>Vercel</strong> runs the website and its scheduled jobs.</li>
        <li><strong>Google</strong> provides sign-in if you choose it.</li>
        <li><strong>AI providers (Google Gemini by default, or Anthropic):</strong> only when you use an AI feature, the text needed for that feature (for example your resume and a job posting, or a note you ask to reword) is sent to the provider. On Gemini&apos;s free tier, Google may use what is sent to improve its products; on its paid tier it says it does not. If that is a concern, do not use AI features or use your own paid key. Everything except the AI rewriting itself works without AI.</li>
        <li><strong>Job and research sources:</strong> searches send your search words, country and place (not your resume) to public job sources such as employer job boards, Jobicy, Remotive, Arbeitnow and, when enabled, Careerjet, Adzuna and USAJOBS. Careerjet also receives your IP address and browser type, as its terms require. Discover searches public sources such as GitHub, ORCID and web search.</li>
        <li><strong>An email provider</strong> sends sign-in links and, if you turn them on, job-alert emails.</li>
      </ul>
      <p>
        These providers act for us and have their own privacy policies. We share only what each feature
        needs, and we do not sell personal information. We may also disclose information when the law
        requires it, such as a valid court order.
      </p>

      <h2>Where your information is processed</h2>
      <p>
        Our providers may store or process information outside Canada, including in the United States. Your
        information can therefore be subject to the laws of those places, including access by their courts
        and authorities. If you are not comfortable with that, please do not use the service.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your data stays until you delete it or delete your account, which removes your records and stored files.</li>
        <li>Read notifications are deleted after 90 days and email delivery records after 30 days.</li>
        <li>Backups kept by our hosting providers can hold deleted data for a short time before they expire.</li>
      </ul>

      <h2>Your rights</h2>
      <ul>
        <li><strong>Access and export:</strong> Settings downloads everything tied to your account. You can also ask us for access to your personal information and how it has been used or disclosed.</li>
        <li><strong>Correction:</strong> you can edit your information in the app, or ask us to correct it.</li>
        <li><strong>Deletion:</strong> Settings has “Delete my account and data”, and you can delete individual resumes, documents, candidates and saved searches.</li>
        <li><strong>Withdraw consent</strong> to optional features, such as turning off email alerts. Every alert email also has a one-click unsubscribe link.</li>
        <li>We will answer a written request within the time the law requires, generally 30 business days, and will explain if we cannot provide something.</li>
        <li><strong>Complaints:</strong> contact us first at <ContactLine />. You may also complain to the Office of the Information and Privacy Commissioner for British Columbia (oipc.bc.ca), or, for matters under PIPEDA, to the Office of the Privacy Commissioner of Canada (priv.gc.ca).</li>
      </ul>

      <h2>Email</h2>
      <p>
        We send only what you ask for: sign-in links and, if you turn them on, job-alert emails. We do not
        send marketing email. This is consistent with Canada&apos;s Anti-Spam Legislation (CASL).
      </p>

      <h2>Security and incidents</h2>
      <p>
        Data is encrypted in transit and every database table is protected by row-level security, so an
        account can only read its own rows. No system is perfectly secure. If an incident creates a real
        risk of significant harm to you, we will tell you and, where required, report it to the Privacy
        Commissioner of Canada.
      </p>

      <h2>Age</h2>
      <p>This service is not intended for anyone under 16.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we will update the date above and, where we can, tell you in the app.</p>
    </LegalPage>
  );
}
