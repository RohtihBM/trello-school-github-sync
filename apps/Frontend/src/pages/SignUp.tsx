import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { AuthShell } from "../components/AuthShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "../hooks/use-toast";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mirrors the Backend's own rule (apps/Backend/src/routes/auth.ts:
// `password.length < 8`) — caught here too so a doomed submission never
// makes a round trip just to learn what the client could have told the
// user immediately.
const MIN_PASSWORD_LENGTH = 8;

export function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
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
      await api("/signup", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      navigate("/signin");
    } catch (err) {
      toast({
        title: "Sign up failed",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Create an account"
      subtitle="Start planning with your team"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/signin" className="font-medium text-accent-600 hover:underline">
            Sign in
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
            aria-invalid={passwordError ? true : undefined}
          />
          {passwordError ? (
            <p className="text-xs text-danger-600">{passwordError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">At least 8 characters</p>
          )}
        </div>

        <Button type="submit" variant="primary" disabled={pending} className="w-full">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
