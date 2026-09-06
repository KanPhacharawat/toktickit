const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/** A Lab 2 testing identity (BR-04). Not a real authenticated user. */
export interface DevelopmentRequester {
  id: number;
  name: string;
  email: string;
  department?: string | null;
}

/**
 * FR-32 — load the active Development Requesters for the selector.
 *
 * Throws on any failure so the caller renders a single safe error state
 * (BR-39: no server internals reach the user).
 */
export async function fetchActiveRequesters(): Promise<DevelopmentRequester[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/development-requesters`);
  } catch {
    // Network/DNS/CORS failure — the API was never reached.
    throw new Error("Could not reach the server. Please try again.");
  }

  if (!res.ok) {
    throw new Error("Could not load development requesters.");
  }

  const body = (await res.json()) as { data?: DevelopmentRequester[] };

  if (!Array.isArray(body.data)) {
    throw new Error("Could not load development requesters.");
  }

  return body.data;
}
