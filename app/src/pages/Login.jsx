import { useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("pattb06@gmail.com");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav("/customers");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Signup OK. If email confirmation is enabled, confirm via email then sign in.");
      }
    } catch (err) {
      setMsg(err?.message ?? "Auth error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, maxWidth: 420 }}>
      <h1>Conexus</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setMode("signin")} disabled={busy || mode === "signin"}>
          Sign in
        </button>
        <button onClick={() => setMode("signup")} disabled={busy || mode === "signup"}>
          Sign up
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%" }} />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <button type="submit" disabled={busy}>
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>

        {msg && <div style={{ color: "crimson" }}>{msg}</div>}
      </form>
    </div>
  );
}
