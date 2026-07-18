import { createClient } from "@/lib/supabase/server";

// JWT pass-through to apps/agent. Reads session.access_token server-side and
// forwards it as `Authorization: Bearer <jwt>` — see docs/02 §2.4.
// Never exposes the token to the browser, never persists it in storage.

export class AgentAuthError extends Error {
  constructor() {
    super("No active Supabase session — cannot call agent.");
  }
}

export class AgentResponseError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Agent returned ${status}.`);
  }
}

interface AgentFetchInit extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
}

export async function agentFetch(
  path: string,
  init: AgentFetchInit = {},
): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_AGENT_URL;
  if (!base) {
    throw new Error("NEXT_PUBLIC_AGENT_URL is not set.");
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new AgentAuthError();

  const url = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`);

  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
      authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    throw new AgentResponseError(response.status, await response.text());
  }

  return response;
}

export async function agentJson<T>(
  path: string,
  init: AgentFetchInit = {},
): Promise<T> {
  const response = await agentFetch(path, init);
  return (await response.json()) as T;
}
