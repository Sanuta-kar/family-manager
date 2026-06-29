import Fastify from "fastify";
import { OpenClawRequest, OpenClawResponse } from "@family-manager/shared";
import { deterministicFallback, sanitizeResponse } from "./fallback";

const server = Fastify({ logger: true });
const openClawBaseUrl = process.env.OPENCLAW_BASE_URL;

server.get("/health", async () => ({ ok: true }));

server.post<{ Body: OpenClawRequest }>("/chat", async (request): Promise<OpenClawResponse> => {
  const response = openClawBaseUrl
    ? await askOpenClaw(request.body)
    : deterministicFallback(request.body);

  return sanitizeResponse(request.body, response);
});

async function askOpenClaw(request: OpenClawRequest): Promise<OpenClawResponse> {
  const response = await fetch(`${openClawBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`OpenClaw returned ${response.status}`);
  }

  return response.json() as Promise<OpenClawResponse>;
}

server.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 4010) });
