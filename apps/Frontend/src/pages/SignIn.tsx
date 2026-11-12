import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api, setToken } from "../lib/api";
import { AuthShell } from "../components/AuthShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "../hooks/use-toast";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Field-level, not a single top banner — shows exactly which input is
  // wrong, where native browser validation UI would look inconsistent
  // against the custom-styled Input primitive.
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  function validate(): boolean {
    let valid = true;
    if (!EMAIL_PATTERN.test(email)) {
      setEmailError("Enter a valid email address");
      valid = false;
    } else {
      setEmailError(null);
    }
    if (password.length === 0) {
      setPasswordError("Password is required");
      valid = false;
    } else {
      setPasswordError(null);
    }
    return valid;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate() || pending) return;

    setPending(true);
    try {
      const { token } = await api<{ token: string }>("/signin", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(token);
      navigate("/");
    } catch (err) {
      // A submission-level failure (wrong credentials), not a field
      // format problem — surfaced as a toast, not inline, same split
      // used throughout the rest of this makeover.
      toast({
        title: "Sign in failed",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back"
      footer={
        <>
          Need an account?{" "}
          <Link to="/signup" className="font-medium text-accent-600 hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            aria-invalid={emailError ? true : undefined}
          />
          {emailError && <p className="text-xs text-danger-600">{emailError}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
            aria-invalid={passwordError ? true : undefined}
          />
          {passwordError && <p className="text-xs text-danger-600">{passwordError}</p>}
        </div>

        <Button type="submit" variant="primary" disabled={pending} className="w-full">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
