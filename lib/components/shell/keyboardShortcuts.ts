function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ?? navigator.platform;
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function sidebarToggleLabel(): string {
  return isMacPlatform() ? "⌘B" : "Ctrl+B";
}
