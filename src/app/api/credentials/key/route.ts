import { getCredentialPublicKey } from "@/lib/server/credential-crypto";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ publicKey: getCredentialPublicKey() });
}
