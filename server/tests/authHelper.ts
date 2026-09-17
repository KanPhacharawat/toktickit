import request from "supertest";
import type { Express } from "express";

// Shared login helper for Lab 1/2 API tests, needed now that every route
// they call requires a session (Lab 3 authorization middleware, BR-07).
//
// These suites test Lab 2 request/response behavior, not authentication, so
// they log in once as a seeded Requester and reuse that agent for every call
// — the identity used to sign in is unrelated to which `requesterId` a test
// passes in a path or body (that stays exactly as it was in Lab 2 until the
// Requester regression issue rewires ownership to the session).

export const LAB2_TEST_ACCOUNT = {
  email: "requester-a@example.com",
  password: "TokTickIT-Dev1!",
};

/** An authenticated supertest agent: every subsequent call carries its cookie. */
export type AuthedAgent = ReturnType<typeof request.agent>;

/**
 * Logs in as the given account (a seeded Requester by default) and returns an
 * agent that carries the session cookie on every later request.
 */
export async function loginAgent(
  app: Express,
  { email, password }: { email: string; password: string } = LAB2_TEST_ACCOUNT,
): Promise<AuthedAgent> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(
      `Test login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}. ` +
        "Make sure the database is migrated and seeded " +
        "(npx prisma migrate deploy && npm run prisma:seed).",
    );
  }
  return agent;
}
