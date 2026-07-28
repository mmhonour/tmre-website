import type { Metadata } from "next";
import LoginClient from "@/app/login/LoginClient";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Passwordless sign-in to TMRE — we email you a one-time link. No password.",
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return <LoginClient />;
}
