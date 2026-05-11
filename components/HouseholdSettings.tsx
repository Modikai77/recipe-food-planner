"use client";

import { useState } from "react";

type ApiTokenSummary = {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string | Date;
  lastUsedAt: string | Date | null;
  revokedAt: string | Date | null;
};

const AVAILABLE_SCOPES = [
  "recipes:read",
  "recipes:write",
  "shoppingLists:read",
  "shoppingLists:write",
  "mealPlans:read",
] as const;

export function HouseholdSettings(props: {
  householdName: string;
  role: "OWNER" | "MEMBER";
  members: { id: string; email: string; role: "OWNER" | "MEMBER" }[];
  apiTokens: ApiTokenSummary[];
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [acceptToken, setAcceptToken] = useState("");
  const [tokenName, setTokenName] = useState("Jarvis");
  const [scopes, setScopes] = useState<string[]>([...AVAILABLE_SCOPES]);
  const [newApiToken, setNewApiToken] = useState("");
  const [apiTokens, setApiTokens] = useState(props.apiTokens);
  const [status, setStatus] = useState("");
  const isOwner = props.role === "OWNER";

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Creating invite...");
    setInviteToken("");

    const response = await fetch("/api/household/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: "MEMBER" }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(body.error ?? "Invite failed");
      return;
    }

    setInviteToken(body.token);
    setInviteEmail("");
    setStatus("Invite created");
  }

  async function acceptInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Accepting invite...");

    const response = await fetch("/api/household/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: acceptToken }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(body.error ?? "Accept failed");
      return;
    }

    setStatus("Invite accepted. Refreshing...");
    window.location.reload();
  }

  async function createApiToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Creating API token...");
    setNewApiToken("");

    const response = await fetch("/api/household/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tokenName, scopes }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(body.error ?? "Token creation failed");
      return;
    }

    setNewApiToken(body.token);
    setApiTokens((current) => [body.apiToken, ...current]);
    setStatus("API token created");
  }

  async function revokeApiToken(id: string) {
    setStatus("Revoking API token...");
    const response = await fetch(`/api/household/tokens/${id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(body.error ?? "Revoke failed");
      return;
    }

    setApiTokens((current) =>
      current.map((token) => (token.id === id ? { ...token, revokedAt: new Date().toISOString() } : token)),
    );
    setStatus("API token revoked");
  }

  function toggleScope(scope: string, checked: boolean) {
    setScopes((current) =>
      checked ? Array.from(new Set([...current, scope])) : current.filter((entry) => entry !== scope),
    );
  }

  return (
    <section className="card" style={{ marginTop: "1rem", maxWidth: 760 }}>
      <h3>Household</h3>
      <p className="muted">
        {props.householdName} - {props.role.toLowerCase()}
      </p>

      <h4>Members</h4>
      <ul className="clean">
        {props.members.map((member) => (
          <li key={member.id}>
            {member.email} <span className="badge">{member.role}</span>
          </li>
        ))}
      </ul>

      {isOwner ? (
        <form onSubmit={createInvite} style={{ marginTop: "1rem" }}>
          <h4>Invite Member</h4>
          <input
            type="email"
            placeholder="Email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            required
          />
          <button type="submit">Create Invite</button>
          {inviteToken ? (
            <p className="muted">
              Invite token: <code>{inviteToken}</code>
            </p>
          ) : null}
        </form>
      ) : null}

      <form onSubmit={acceptInvite} style={{ marginTop: "1rem" }}>
        <h4>Accept Invite</h4>
        <input
          type="text"
          placeholder="Invite token"
          value={acceptToken}
          onChange={(event) => setAcceptToken(event.target.value)}
          required
        />
        <button type="submit">Accept Invite</button>
      </form>

      {isOwner ? (
        <form onSubmit={createApiToken} style={{ marginTop: "1rem" }}>
          <h4>Jarvis API Token</h4>
          <input
            type="text"
            value={tokenName}
            onChange={(event) => setTokenName(event.target.value)}
            required
          />
          {AVAILABLE_SCOPES.map((scope) => (
            <label key={scope} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={(event) => toggleScope(scope, event.target.checked)}
              />
              {scope}
            </label>
          ))}
          <button type="submit">Create Token</button>
          {newApiToken ? (
            <p className="muted">
              New token: <code>{newApiToken}</code>
            </p>
          ) : null}
        </form>
      ) : null}

      {isOwner ? (
        <>
          <h4>API Tokens</h4>
          <ul className="clean">
            {apiTokens.map((token) => (
              <li key={token.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                <strong>{token.name}</strong>{" "}
                {token.revokedAt ? <span className="badge">Revoked</span> : <span className="badge">Active</span>}
                <div className="muted">{token.scopes.join(", ")}</div>
                {!token.revokedAt ? (
                  <button type="button" onClick={() => revokeApiToken(token.id)}>
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {status ? <p className="muted">{status}</p> : null}
    </section>
  );
}
