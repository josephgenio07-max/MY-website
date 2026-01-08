import Link from "next/link";

export default function JoinIndexPage() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Join link required</h1>
      <p style={{ marginTop: 8 }}>
        This page needs a token. Use a link like: <code>/join/&lt;token&gt;</code>
      </p>

      <p style={{ marginTop: 16 }}>
        If you’re a manager, go to the <Link href="/dashboard">dashboard</Link> and copy the join link.
      </p>
    </div>
  );
}
