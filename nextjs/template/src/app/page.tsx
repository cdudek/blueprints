import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Orders and billing blueprint</h1>
      <p>
        A runnable template for the modular monolith in ARCHITECTURE.md. Open the{" "}
        <Link href="/orders">orders page</Link>.
      </p>
    </main>
  );
}
