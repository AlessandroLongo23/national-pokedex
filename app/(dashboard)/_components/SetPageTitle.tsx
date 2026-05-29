"use client";

import { useSetPageTitle } from "../_lib/PageTitleContext";

export function SetPageTitle({ title }: { title: string }) {
  useSetPageTitle(title);
  return null;
}
