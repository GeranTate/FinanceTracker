import { createClient } from "@supabase/supabase-js";
import type { CommandPayload, Snapshot } from "../types";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  key || "not-configured",
);
export async function loadSnapshot(): Promise<Snapshot> {
  const { error } = await supabase.rpc("finance_command", {
    p_action: "initialize",
    p_payload: {},
    p_request_id: crypto.randomUUID(),
  });
  if (error) throw error;
  const { data, error: readError } = await supabase.rpc("finance_snapshot");
  if (readError) throw readError;
  if (!data?.settings) throw new Error("Your profile could not be loaded.");
  return data as Snapshot;
}
export async function command(
  action: string,
  payload: CommandPayload,
  requestId: string,
) {
  const { data, error } = await supabase.rpc("finance_command", {
    p_action: action,
    p_payload: payload,
    p_request_id: requestId,
  });
  if (error) throw error;
  return data;
}
