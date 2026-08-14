import { useState } from "react";
import { checkSystem, Category } from "./api.js";

type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleCheck() {
    setState("loading");
    setErrorMessage("");

    try {
      const result = await checkSystem();
      setCategories(result.categories);
      setState("success");
    } catch (err) {
      setCategories([]);
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong",
      );
      setState("error");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button
        className="btn btn-success"
        onClick={handleCheck}
        disabled={state === "loading"}
      >
        {state === "loading" ? "Loading…" : "Check System"}
      </button>

      {state === "loading" && (
        <p className="mt-4 text-secondary" role="status">
          Loading categories…
        </p>
      )}

      {state === "success" && (
        <>
          <h4 className="mt-4">
            System: <span className="text-success">Online</span>
          </h4>

          {categories.length === 0 ? (
            <p className="text-secondary">No categories found.</p>
          ) : (
            <ul className="list-group mt-3">
              {categories.map((category) => (
                <li className="list-group-item" key={category.id}>
                  {category.name}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {state === "error" && (
        <>
          <h4 className="mt-4">
            System: <span className="text-danger">Offline</span>
          </h4>
          <div className="alert alert-danger mt-3" role="alert">
            {errorMessage}
          </div>
        </>
      )}
    </div>
  );
}
