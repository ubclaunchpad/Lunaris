"use client";

import { GalleryVerticalEnd } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/usercontext";
import { login } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const { setUserId } = useUser();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  const router = useRouter();

  async function signup(username: string, email: string, password: string) {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    return res.json();
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();

    if (mode === "login") {
      const result = await login(trimmedUsername, password);

      if (result?.success) {
        localStorage.setItem("idToken", result.idToken);
        localStorage.setItem("accessToken", result.accessToken);
        localStorage.setItem("refreshToken", result.refreshToken);

        const payload = JSON.parse(atob(result.idToken.split(".")[1]));
        setUserId(payload.sub);

        router.push("/browse");
      } else {
        setError(result.message || "Invalid username or password.");
      }
    }

    if (mode === "signup") {
      const result = await signup(trimmedUsername, trimmedEmail, password);

      if (result?.success) {
        const loginResult = await login(trimmedUsername, password);
        if (loginResult?.success) {
          localStorage.setItem("idToken", loginResult.idToken);
          localStorage.setItem("accessToken", loginResult.accessToken);
          localStorage.setItem("refreshToken", loginResult.refreshToken);

          const payload = JSON.parse(atob(loginResult.idToken.split(".")[1]));
          setUserId(payload.sub);

          router.push("/browse");
        } else {
          setError("Account created, but login failed.");
        }
      } else {
        setError(result.message || "Signup failed.");
      }
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <a href="#" className="flex flex-col items-center gap-2 font-medium">
              <div className="flex size-8 items-center justify-center rounded-md">
                <GalleryVerticalEnd className="size-6" />
              </div>
              <span className="sr-only">Lunaris</span>
            </a>

            <h1 className="text-xl font-bold">
              {mode === "login" ? "Cloud gaming of the future" : "Create your account"}
            </h1>

            <FieldDescription>
              {mode === "login" ? (
                <>
                  No account?{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setMode("signup")}
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setMode("login")}
                  >
                    Login
                  </button>
                </>
              )}
            </FieldDescription>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <Field>
            <FieldLabel>Username</FieldLabel>
            <Input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </Field>

          {mode === "signup" && (
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
          )}

          <Field>
            <FieldLabel>Password</FieldLabel>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          <Field>
            <Button type="submit">
              {mode === "login" ? "Login" : "Create Account"}
            </Button>
          </Field>

          {mode === "login" && (
            <>
              <FieldSeparator>Or</FieldSeparator>
              <Field className="grid gap-4 sm:grid-cols-2">
                <Button variant="outline" type="button">
                  Continue with Apple
                </Button>
                <Button variant="outline" type="button">
                  Continue with Google
                </Button>
              </Field>
            </>
          )}
        </FieldGroup>
      </form>
    </div>
  );
}
