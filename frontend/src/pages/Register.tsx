import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import { Spinner } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "./AuthLayout";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, name.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Start collaborating in under a minute.">
      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" required autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Ada Lovelace" />
          <p className="mt-1 text-xs text-zinc-500">Teammates mention you as @{name.replace(/\s+/g, "") || "YourName"}.</p>
        </div>
        <div>
          <label className="label" htmlFor="email">Work email</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@company.com" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          <p className="mt-1 text-xs text-zinc-500">At least 8 characters.</p>
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full py-2.5">
          {submitting && <Spinner size={14} className="text-white/80" />} Create account
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
