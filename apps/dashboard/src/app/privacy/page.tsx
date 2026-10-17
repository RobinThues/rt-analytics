export const metadata = { title: "Privacy · rt-analytics" };

// Public page, linked from the Google OAuth consent screen (spec section 2, "Google OAuth client").
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 pt-16">
      <h1 className="text-2xl font-semibold">Privacy</h1>
      <p>
        This is a private analytics dashboard for Robin Thües. Only email addresses on a fixed allowlist can sign in.
      </p>
      <p>
        Sign-in uses Google. The dashboard receives your name and email address from Google only to check them against
        the allowlist. It stores nothing about you except an encrypted session cookie in your browser, which expires
        after seven days. There is no database of users and no tracking on this site.
      </p>
      <p>
        Contact:{" "}
        <a className="text-primary underline underline-offset-2" href="mailto:robinthues@googlemail.com">
          robinthues@googlemail.com
        </a>
      </p>
    </main>
  );
}
