"use client";

import { OwnedCardsProvider } from "../_lib/OwnedCardsContext";
import { WishlistProvider } from "../_lib/WishlistContext";
import { SetAvailabilityProvider } from "../_lib/SetAvailabilityContext";
import { TooltipProvider } from "../_lib/TooltipContext";
import { MobileNav, Sidebar } from "./Sidebar";
import { Tooltip } from "./Tooltip";

export function Shell({
  initialOwned,
  initialWishlist,
  initialAvailability,
  children,
}: {
  initialOwned: string[];
  initialWishlist: string[];
  initialAvailability: { setId: string; available: boolean }[];
  children: React.ReactNode;
}) {
  return (
    <OwnedCardsProvider initial={initialOwned}>
      <WishlistProvider initial={initialWishlist}>
        <SetAvailabilityProvider initial={initialAvailability}>
          <TooltipProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
                <MobileNav />
              </div>
            </div>
            <Tooltip />
          </TooltipProvider>
        </SetAvailabilityProvider>
      </WishlistProvider>
    </OwnedCardsProvider>
  );
}
