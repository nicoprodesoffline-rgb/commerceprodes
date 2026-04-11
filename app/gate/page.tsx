"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GatePage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Mot de passe incorrect");
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f9fafb",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          padding: "48px 40px",
          borderRadius: "12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
          width: "100%",
          maxWidth: "400px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            marginBottom: "8px",
            color: "#111",
          }}
        >
          PRODES
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#666",
            marginBottom: "32px",
          }}
        >
          Site en acces restreint — entrez le mot de passe
        </p>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          autoFocus
          style={{
            width: "100%",
            padding: "12px 16px",
            fontSize: "16px",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            outline: "none",
            marginBottom: "16px",
            boxSizing: "border-box",
          }}
        />

        {error && (
          <p
            style={{ color: "#dc2626", fontSize: "14px", marginBottom: "16px" }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          style={{
            width: "100%",
            padding: "12px",
            fontSize: "16px",
            fontWeight: 600,
            color: "#fff",
            background: loading || !password ? "#9ca3af" : "#111",
            border: "none",
            borderRadius: "8px",
            cursor: loading || !password ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Verification..." : "Acceder au site"}
        </button>
      </form>
    </div>
  );
}
