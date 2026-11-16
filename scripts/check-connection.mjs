// Only the publishable key is used. This never authenticates or writes records.
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw new Error(
    "Supply the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY environment variables.",
  );
for (const path of [
  "/rest/v1/profiles?select=user_id",
  "/rest/v1/rpc/finance_snapshot",
]) {
  const response = await fetch(url + path, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (![401, 403].includes(response.status) || body.code !== "42501") {
    throw new Error(
      "Unexpected unauthenticated response for " +
        path +
        ": " +
        response.status +
        " " +
        JSON.stringify(body),
    );
  }
  console.log("PASS: " + path + " exists and denies unauthenticated access.");
}
