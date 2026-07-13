import { createHash, randomBytes } from "crypto";

const TOKEN_BYTE_LENGTH = 32;

export interface GeneratedInvitationToken {
  rawToken: string;
  tokenHashBytea: string;
}

function toBytea(digest: Buffer): string {
  return "\\x" + digest.toString("hex");
}

export function hashInvitationToken(rawToken: string): string {
  const raw = Buffer.from(rawToken, "base64url");
  return toBytea(createHash("sha256").update(raw).digest());
}

export function generateInvitationToken(): GeneratedInvitationToken {
  const rawToken = randomBytes(TOKEN_BYTE_LENGTH).toString("base64url");
  return { rawToken, tokenHashBytea: hashInvitationToken(rawToken) };
}
