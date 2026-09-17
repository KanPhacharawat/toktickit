import { AuthProvider } from "./AuthContext.js";
import AuthGate from "./AuthGate.js";
import Lab2App from "./Lab2App.js";
import "./theme.css";

/**
 * Application root. Lab 3 puts authentication in front of the Lab 2 Requester
 * screens; the Development Requester selector inside them is removed by the
 * Requester regression issue.
 */
export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <Lab2App />
      </AuthGate>
    </AuthProvider>
  );
}
