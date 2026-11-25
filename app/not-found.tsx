import Link from "next/link";

export default function NotFound() {
  return (
    <div className="gt-card mx-auto mt-10 max-w-lg p-10 text-center">
      <h1 className="page-title mb-2">Page not found</h1>
      <p className="mb-6 text-ink-muted">This address does not match any page in the Globe Trans Management System.</p>
      <Link href="/" className="gt-btn gt-btn--primary">
        Go to the dashboard
      </Link>
    </div>
  );
}
