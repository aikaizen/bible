"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";

type InviteInfo = {
  valid: boolean;
  groupName?: string;
  invitedBy?: string;
  recipientName?: string;
};

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { data: session, status } = useSession();
  const [token, setToken] = useState<string>("");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");

  // Resolve the params promise
  useEffect(() => {
    void params.then((p) => setToken(p.token));
  }, [params]);

  // Fetch invite info
  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const res = await fetch(`/api/invites/${encodeURIComponent(token)}`);
        const data = (await res.json()) as InviteInfo;
        setInfo(data);
      } catch {
        setInfo({ valid: false });
      }
    })();
  }, [token]);

  // Auto-join when authenticated
  useEffect(() => {
    if (!token || !session?.user?.id || joining || joined) return;
    if (!info?.valid) return;

    void (async () => {
      setJoining(true);
      try {
        const res = await fetch(`/api/invites/${encodeURIComponent(token)}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = (await res.json()) as { groupId?: string; error?: string };
        if (!res.ok) {
          setError(data.error ?? "Failed to join group");
          return;
        }
        setJoined(true);
        // Store group ID and redirect to main app
        if (data.groupId) {
          window.localStorage.setItem("bible-app-group-id", data.groupId);
        }
        window.location.href = "/";
      } catch {
        setError("Failed to join group");
      } finally {
        setJoining(false);
      }
    })();
  }, [token, session, info, joining, joined]);

  // Loading state
  if (status === "loading" || (!info && token)) {
    return (
      <div className="invite-page">
        <div className="invite-card">
          <div className="invite-brand">Read the Bible Together</div>
          <div className="invite-loading">Loading invite...</div>
        </div>
      </div>
    );
  }

  // Invalid invite
  if (info && !info.valid) {
    return (
      <div className="invite-page">
        <div className="invite-card">
          <div className="invite-brand">Read the Bible Together</div>
          <div className="invite-invalid">This invite link is invalid or has expired.</div>
          <Link href="/" className="btn btn-gold" style={{ marginTop: 16, display: "inline-block", textDecoration: "none" }}>
            Go to App
          </Link>
        </div>
      </div>
    );
  }

  // Not signed in — show invite info + sign in button
  if (!session) {
    return (
      <div className="invite-page">
        <div className="invite-card">
          <div className="invite-brand">Read the Bible Together</div>
          <div className="invite-message">
            You have been invited to join your friend on a journey to read the Bible together.
          </div>
          <div className="invite-group-name">{info?.groupName}</div>
          {info?.recipientName && (
            <div className="invite-recipient">
              Hey {info.recipientName}!
            </div>
          )}
          <div className="invite-subtitle">Sign in to join the group and start reading together.</div>
          <button
            className="btn btn-gold auth-btn"
            onClick={() => void signIn("google", { callbackUrl: `/invite/${token}` })}
            style={{ marginTop: 20 }}
            type="button"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // Signed in — auto-joining
  if (error) {
    return (
      <div className="invite-page">
        <div className="invite-card">
          <div className="invite-brand">Read the Bible Together</div>
          <div className="invite-invalid">{error}</div>
          <Link href="/" className="btn btn-gold" style={{ marginTop: 16, display: "inline-block", textDecoration: "none" }}>
            Go to App
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-page">
      <div className="invite-card">
        <div className="invite-brand">Read the Bible Together</div>
        <div className="invite-message">Joining <strong>{info?.groupName}</strong>...</div>
        <div className="invite-loading">Please wait...</div>
      </div>
    </div>
  );
}
