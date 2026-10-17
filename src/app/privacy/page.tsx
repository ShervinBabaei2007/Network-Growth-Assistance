import { ContactLine, LegalPage } from "@/components/legal/legal-page";

export const metadata = { title: "Privacy Policy · Network Growth" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Network Growth Assistant helps you plan LinkedIn networking and a job search. This page says what
        it stores, who else sees it, and how you can remove it. Questions: <ContactLine />.
      </p>

      <h2>What this app never does</h2>
      <ul>
        <li>It never asks for your LinkedIn password or cookies.</li>
        <li>It never scrapes LinkedIn, sends invitations or messages for you, or acts on your LinkedIn account. You do that yourself.</li>
        <li>It does not sell your data or show advertising.</li>
      </ul>

      <h2>What we store</h2>
      <ul>
        <li><strong>Your account:</strong> your email address and, if you use Google sign-in, the name and email Google shares with us. We do not receive your Google password.</li>
        <li><strong>What you add:</strong> candidates and people you save, notes, tags and reminders, your schools, disciplines and targets, saved jobs, applications, interviews, saved searches and settings.</li>
        <li><strong>Your resume:</strong> the file you upload and the text read from it, plus any tailored versions and cover letters you create. Files are kept in private storage that only your account can read.</li>
        <li><strong>Imports:</strong> from a LinkedIn data export or contact list we keep names, companies, positions and dates. Email addresses in those files are not stored, and the file itself is not kept.</li>
        <li><strong>Your own AI key</strong>, if you add one, is stored encrypted and is never sent to your browser.</li>
        <li><strong>Notifications and email logs:</strong> read notifications are deleted after 90 days and delivery records after 30 days.</li>
        <li><strong>Cookies:</strong> a sign-in session cookie and a cookie that remembers your display settings (theme, density, text size). We do not use advertising or analytics cookies.</li>
      </ul>

      <h2>Who else handles your data</h2>
      <ul>
        <li><strong>Supabase</strong> hosts the database, sign-in and file storage.</li>
        <li><strong>Vercel</strong> runs the website and its scheduled jobs.</li>
        <li><strong>Google</strong> provides sign-in if you choose it.</li>
        <li><strong>AI providers (Google Gemini by default, or Anthropic):</strong> only when you use an AI feature, the text needed for that feature (for example your resume and a job posting, or a note you ask to reword) is sent to the provider. On Gemini&apos;s free tier, Google may use what is sent to improve its products; on its paid tier it says it does not. If that is a problem, do not use AI features, or use your own paid key. Everything except the AI rewriting itself works without AI.</li>
        <li><strong>Job and research sources:</strong> searches send your search words, country and place (not your resume) to public job sources such as employer job boards, Jobicy, Remotive, Arbeitnow and, when enabled, Careerjet, Adzuna and USAJOBS. Careerjet also receives your IP address and browser type, as its terms require. Discover searches public sources such as GitHub, ORCID and web search for people&apos;s public pages.</li>
        <li><strong>An email provider</strong> sends sign-in links and, if you turn them on, job-alert emails.</li>
      </ul>
      <p>Each of these has its own privacy policy. We share only what each feature needs.</p>

      <h2>Your choices</h2>
      <ul>
        <li><strong>Download your data:</strong> Settings has an export of everything tied to your account.</li>
        <li><strong>Delete your data:</strong> Settings has “Delete my account and data”, which removes your account, records and stored files.</li>
        <li>You can delete individual resumes, documents, candidates and saved searches at any time.</li>
        <li>Email alerts are off unless you turn them on, and every email has a one-click unsubscribe link.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit. Every table is protected by row-level security so an account can only
        read its own rows. No system is perfectly secure, so keep your sign-in email account protected.
      </p>

      <h2>Children</h2>
      <p>This service is not intended for anyone under 16.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we will update the date above and, where we can, tell you in the app.</p>
    </LegalPage>
  );
}
