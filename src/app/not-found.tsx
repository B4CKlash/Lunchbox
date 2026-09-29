import Link from "next/link";

export default function NotFound() {
  return (
    <section className="empty-state">
      <h1>This shelf is empty.</h1>
      <p>That page could not be found.</p>
      <Link className="button" href="/pantry">
        Back to your pantry
      </Link>
    </section>
  );
}
