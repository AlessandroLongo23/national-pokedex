"use server";

import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password) redirect("/reset-password?error=missing-password");
  if (password.length < 6) redirect("/reset-password?error=password-too-short");
  if (password !== confirm) redirect("/reset-password?error=passwords-do-not-match");

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/dashboard");
}
