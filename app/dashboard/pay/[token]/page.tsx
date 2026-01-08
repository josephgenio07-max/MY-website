import PayClient from "./PayClient";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function PayTokenPage({ params }: PageProps) {
  const resolved = await params;
  const token = (resolved.token ?? "").trim();

  if (!token) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif", color: "crimson" }}>
        <h1>Missing Token</h1>
        <p>The pay link is incomplete. It should look like /pay/your-token-here</p>
      </div>
    );
  }

  return <PayClient token={token} />;
}
