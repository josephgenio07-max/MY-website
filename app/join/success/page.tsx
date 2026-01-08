export default async function JoinSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string; session_id?: string }>;
}) {
  const { teamId = "", session_id = "" } = await searchParams;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 520, width: "100%", fontFamily: "sans-serif" }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>✅ Payment received</h1>

        <p style={{ color: "#444", marginBottom: 16 }}>
          Thanks — your payment was successful.
        </p>
      </div>
    </div>
  );
}
