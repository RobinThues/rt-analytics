import Link from "next/link";

// Link = client-side navigation (same session); <a> = full page load (new session when cookieless).
export function Nav() {
  return (
    <nav style={{ display: "flex", gap: 12 }}>
      <Link href="/">Home</Link>
      <Link href="/faq">FAQ</Link>
      <Link href="/about">About</Link>
      <a href="/privacy">Privacy (full page load)</a>
    </nav>
  );
}
