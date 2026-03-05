"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Login failed" }));
      setError(body.error ?? "Login failed");
      return;
    }

    router.push("/recipes");
    router.refresh();
  }

  return (
    <section className="card" style={{ marginTop: "1rem", maxWidth: 480 }}>
      <h2>Login</h2>
      <form onSubmit={onSubmit}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Login</button>
      </form>
      {error ? <p className="muted">{error}</p> : null}
      <p className="muted">
        New here? <a href="/register">Create an account</a>
      </p>
    </section>
  );
}
