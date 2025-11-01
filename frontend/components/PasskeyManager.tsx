"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  beginPasskeyAuthentication,
  beginPasskeyRegistration,
  fetchPasskeys,
  fetchTrustedDevices,
  removePasskey,
  renameTrustedDevice,
  revokeAllTrustedDevices,
  revokeTrustedDevice,
  updatePasskeyLabel,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
} from "@/lib/passkeys";
import { getDemoUserId } from "@/lib/env";
import type { PasskeyDeviceRow, TrustedDeviceRow } from "@/lib/types";

interface PasskeyManagerProps {
  userId?: string;
  loginHint?: string;
}

type PublicKeyCreationOptionsJSON = {
  publicKey: Record<string, unknown>;
  challengeId?: string;
};

function base64urlToBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function normaliseCreationOptions(options: PublicKeyCreationOptionsJSON): PublicKeyCredentialCreationOptions {
  const clone = cloneValue(options.publicKey) as unknown as PublicKeyCredentialCreationOptions;
  if (typeof clone.challenge === "string") {
    clone.challenge = base64urlToBuffer(clone.challenge);
  }
  if (clone.user && typeof clone.user.id === "string") {
    clone.user = {
      ...clone.user,
      id: base64urlToBuffer(clone.user.id as unknown as string),
    };
  }
  if (clone.excludeCredentials) {
    clone.excludeCredentials = clone.excludeCredentials.map((descriptor) => {
      const item = { ...descriptor } as PublicKeyCredentialDescriptor;
      if (typeof item.id === "string") {
        item.id = base64urlToBuffer(item.id);
      }
      return item;
    });
  }
  return clone;
}

function extractAttestationPayload(credential: PublicKeyCredential, challenge: string): Record<string, unknown> {
  const response = credential.response as AuthenticatorAttestationResponse;
  const clientData = JSON.parse(new TextDecoder().decode(response.clientDataJSON));
  const transports = typeof (response as unknown as { getTransports?: () => string[] }).getTransports === "function"
    ? (response as unknown as { getTransports: () => string[] }).getTransports()
    : [];
  return {
    id: credential.id,
    type: credential.type,
    rawId: bufferToBase64url(credential.rawId),
    credentialId: bufferToBase64url(credential.rawId),
    challenge: clientData.challenge ?? challenge,
    attestationFormat: "none",
    publicKey: bufferToBase64url(response.attestationObject),
    transports,
    counter: 0,
  };
}

function extractAssertionPayload(result: PublicKeyCredential, challengeId: string): Record<string, unknown> {
  const response = result.response as AuthenticatorAssertionResponse;
  const clientData = JSON.parse(new TextDecoder().decode(response.clientDataJSON));
  return {
    challengeId,
    challenge: clientData.challenge,
    credentialId: bufferToBase64url(result.rawId),
    clientDataJSON: bufferToBase64url(response.clientDataJSON),
    authenticatorData: bufferToBase64url(response.authenticatorData),
    signature: bufferToBase64url(response.signature),
    userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : undefined,
    newCounter: 0,
  };
}

function extractReauthToken(result: Record<string, unknown>): string {
  if (typeof result.reauth_token === "string") {
    return result.reauth_token;
  }
  if (typeof (result as { reauthToken?: unknown }).reauthToken === "string") {
    return (result as { reauthToken: string }).reauthToken;
  }
  return "";
}

export default function PasskeyManager({ userId, loginHint }: PasskeyManagerProps) {
  const resolvedUserId = useMemo(() => userId ?? getDemoUserId(), [userId]);
  const resolvedLoginHint = loginHint ?? undefined;
  const [passkeys, setPasskeys] = useState<PasskeyDeviceRow[]>([]);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDeviceRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registerLabel, setRegisterLabel] = useState<string>("New device");
  const [reauthToken, setReauthToken] = useState<string>("");

  const refresh = useCallback(
    async ({ showSpinner = true }: { showSpinner?: boolean } = {}) => {
      if (showSpinner) {
        setLoading(true);
      }
      setError(null);
      try {
        const [devices, trusted] = await Promise.all([
          fetchPasskeys(resolvedUserId),
          fetchTrustedDevices(resolvedUserId),
        ]);
        setPasskeys(devices);
        setTrustedDevices(trusted);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load passkey data");
      } finally {
        if (showSpinner) {
          setLoading(false);
        }
      }
    },
    [resolvedUserId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRegister = async () => {
    if (!window.PublicKeyCredential || !navigator.credentials || typeof navigator.credentials.create !== "function") {
      setError("WebAuthn is not supported in this browser.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const options = (await beginPasskeyRegistration(
        resolvedUserId,
        { label: registerLabel.trim() },
      )) as PublicKeyCreationOptionsJSON;
      if (!options.publicKey) {
        throw new Error("WebAuthn creation options missing from response");
      }
      const challengeString =
        typeof options.publicKey.challenge === "string" ? (options.publicKey.challenge as string) : "";
      const publicKey = normaliseCreationOptions(options);
      const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
      const payload = extractAttestationPayload(credential, challengeString);
      const device = await verifyPasskeyRegistration(resolvedUserId, payload);
      await refresh({ showSpinner: false });
      setMessage(`Registered passkey ${device.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to register passkey");
    } finally {
      setBusy(false);
    }
  };

  const handleRenamePasskey = async (device: PasskeyDeviceRow) => {
    const label = window.prompt("Enter a new label", device.label) ?? "";
    if (!label.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updatePasskeyLabel(resolvedUserId, device.id, label.trim());
      await refresh({ showSpinner: false });
      setMessage(`Renamed passkey to ${updated.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rename passkey");
    } finally {
      setBusy(false);
    }
  };

  const handleRemovePasskey = async (device: PasskeyDeviceRow) => {
    if (!reauthToken.trim()) {
      setError("A re-authentication token is required to remove a passkey.");
      return;
    }
    if (!window.confirm(`Remove passkey ${device.label}?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await removePasskey(resolvedUserId, device.id, reauthToken.trim());
      await refresh({ showSpinner: false });
      setMessage(`Removed passkey ${device.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove passkey");
    } finally {
      setBusy(false);
    }
  };

  const handleRenameTrusted = async (device: TrustedDeviceRow) => {
    const label = window.prompt("Label", device.label) ?? "";
    if (!label.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await renameTrustedDevice(resolvedUserId, device.id, label.trim());
      await refresh({ showSpinner: false });
      setMessage(`Renamed trusted device to ${label.trim()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rename trusted device");
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeTrusted = async (device: TrustedDeviceRow) => {
    if (!reauthToken.trim()) {
      setError("A re-authentication token is required to revoke a trusted device.");
      return;
    }
    if (!window.confirm(`Revoke trusted device ${device.label || device.platform}?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await revokeTrustedDevice(resolvedUserId, device.id, reauthToken.trim());
      await refresh({ showSpinner: false });
      setMessage(`Revoked trusted device ${device.label || device.platform}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke trusted device");
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeAllTrusted = async () => {
    if (!reauthToken.trim()) {
      setError("A re-authentication token is required to revoke devices.");
      return;
    }
    if (!window.confirm("Revoke all trusted devices?")) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await revokeAllTrustedDevices(resolvedUserId, reauthToken.trim());
      await refresh({ showSpinner: false });
      setMessage("Revoked all trusted devices");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke devices");
    } finally {
      setBusy(false);
    }
  };

  const handlePasskeySignIn = async () => {
    if (!window.PublicKeyCredential || !navigator.credentials || typeof navigator.credentials.get !== "function") {
      setError("WebAuthn is not supported in this browser.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // Use login hint when available so the backend can pre-filter credentials for the current user.
      const options = await beginPasskeyAuthentication(
        resolvedLoginHint ? { usernameOrEmail: resolvedLoginHint } : {},
      );
      const json = options as { publicKey: Record<string, unknown>; challengeId?: string };
      if (!json.publicKey) {
        throw new Error("WebAuthn request options missing from response");
      }
      const challengeId = typeof json.challengeId === "string" ? json.challengeId : "";
      const publicKeyOptions = cloneValue(json.publicKey) as unknown as PublicKeyCredentialRequestOptions;
      if (typeof publicKeyOptions.challenge === "string") {
        publicKeyOptions.challenge = base64urlToBuffer(publicKeyOptions.challenge);
      }
      if (publicKeyOptions.allowCredentials) {
        publicKeyOptions.allowCredentials = publicKeyOptions.allowCredentials.map((descriptor) => {
          const item = { ...descriptor } as PublicKeyCredentialDescriptor;
          if (typeof item.id === "string") {
            item.id = base64urlToBuffer(item.id);
          }
          return item;
        });
      }
      const assertion = (await navigator.credentials.get({ publicKey: publicKeyOptions })) as PublicKeyCredential;
      const payload = extractAssertionPayload(assertion, challengeId);
      const result = await verifyPasskeyAuthentication(payload, {
        "X-Device-Label": registerLabel.trim() || "WebAuthn",
      });
      const token = extractReauthToken(result);
      if (token) {
        setReauthToken(token);
      }
      await refresh({ showSpinner: false });
      setMessage(token ? "Signed in with passkey. Re-auth token refreshed." : "Signed in with passkey (demo request). Session tokens stored by API.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to authenticate with passkey");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Loading passkey settings…</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="rounded border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Passkey security</h2>
        <p className="text-sm text-slate-500">Register passkeys, manage trusted devices, and test passwordless flows.</p>
      </header>
      {error ? (
        <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded border border-slate-200 bg-white p-4 shadow-sm">
          <header className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Registered passkeys</h3>
            <button
              type="button"
              onClick={() => void handlePasskeySignIn()}
              className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
              disabled={busy}
            >
              Try sign-in demo
            </button>
          </header>
          <div className="space-y-2">
            {passkeys.length === 0 ? (
              <p className="text-sm text-slate-500">No passkeys registered yet.</p>
            ) : (
              <ul className="space-y-2">
                {passkeys.map((device) => (
                  <li key={device.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{device.label || "Passkey"}</p>
                      <p className="text-xs text-slate-500">Created {new Date(device.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRenamePasskey(device)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        disabled={busy}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemovePasskey(device)}
                        className="rounded bg-rose-100 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-200"
                        disabled={busy}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-3 rounded border border-dashed border-slate-300 p-3">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Register new passkey</label>
            <input
              type="text"
              value={registerLabel}
              onChange={(event) => setRegisterLabel(event.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Device label"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => void handleRegister()}
              className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              disabled={busy}
            >
              Add passkey
            </button>
          </div>
        </section>
        <section className="space-y-4 rounded border border-slate-200 bg-white p-4 shadow-sm">
          <header className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Trusted devices</h3>
            <button
              type="button"
              onClick={() => void handleRevokeAllTrusted()}
              className="rounded border border-rose-400 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
              disabled={busy}
            >
              Revoke all
            </button>
          </header>
          <div className="space-y-2">
            {trustedDevices.length === 0 ? (
              <p className="text-sm text-slate-500">No trusted devices established yet.</p>
            ) : (
              <ul className="space-y-2">
                {trustedDevices.map((device) => (
                  <li key={device.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{device.label || device.platform}</p>
                      <p className="text-xs text-slate-500">
                        Last seen {device.last_seen ? new Date(device.last_seen).toLocaleString() : "unknown"}
                        {device.browser ? ` · ${device.browser}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRenameTrusted(device)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                        disabled={busy}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRevokeTrusted(device)}
                        className="rounded bg-rose-100 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-200"
                        disabled={busy || device.revoked}
                      >
                        {device.revoked ? "Revoked" : "Revoke"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Re-authentication token</label>
            <input
              type="text"
              value={reauthToken}
              onChange={(event) => setReauthToken(event.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Paste a recent re-auth token"
              disabled={busy}
            />
          </div>
        </section>
      </div>
    </section>
  );
}
