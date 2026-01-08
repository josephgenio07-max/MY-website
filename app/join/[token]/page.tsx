import JoinClient from "./JoinClient";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function JoinTokenPage({ params }: PageProps) {
  const resolvedParams = await params;
  const token = (resolvedParams.token ?? "").trim();

  if (!token) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif", color: "crimson" }}>
        <h1>Missing Token</h1>
        <p>The join link is incomplete. It should look like /join/your-token-here</p>
      </div>
    );
  }

  return <JoinClient token={token} />;
}
