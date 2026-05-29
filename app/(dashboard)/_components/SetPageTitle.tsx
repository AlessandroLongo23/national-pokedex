"use client";

import { useSetPageTitle } from "../_lib/PageTitleContext";

export function SetPageTitle({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  useSetPageTitle(title, detail);
  return null;
}
