"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!email || !password) redirect("/register?error=missing-fields");
  if (password.length < 6) redirect("/register?error=password-too-short");
  if (password !== confirm) redirect("/register?error=passwords-do-not-match");

  const supabase = await getSupabaseServer();
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    redirect(`/register?error=${encodeURIComponent(error.message)}`);
  }
  if (data.session) {
    redirect("/dashboard");
  }
  redirect("/register?sent=1");
}
