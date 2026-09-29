"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="empty-state" role="alert">
      <h1>Something went wrong.</h1>
      <p>Please try opening your kitchen again.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
