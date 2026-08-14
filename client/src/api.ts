const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Issue 2 + Issue 4 — call the backend.
// Steps: fetch `${API_URL}/api/health`; if not ok, throw.
//        then fetch `${API_URL}/api/categories`; if not ok, throw.
//        return { online: true, categories }.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
  const health = await fetch(`${API_URL}/api/health`);

  if (!health.ok) {
    throw new Error("Backend is unavailable");
  }

  const res = await fetch(`${API_URL}/api/categories`);
  if (!res.ok) {
    throw new Error("Could not load categories");
  }

  const categories = (await res.json()) as Category[];

  return {
    online: true,
    categories,
  };
}
