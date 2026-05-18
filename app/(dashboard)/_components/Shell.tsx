"use client";

import { OwnedCardsProvider } from "../_lib/OwnedCardsContext";
import { WishlistProvider } from "../_lib/WishlistContext";
import { FavoritesProvider } from "../_lib/FavoritesContext";
import { SetAvailabilityProvider } from "../_lib/SetAvailabilityContext";
import { TooltipProvider } from "../_lib/TooltipContext";
import { PageTitleProvider } from "../_lib/PageTitleContext";
import { UserProvider } from "../_lib/UserContext";
import { MobileNav, Sidebar } from "./Sidebar";
import { MobileHeader } from "./MobileHeader";
import { LogPackFab } from "./LogPackFab";
import { Tooltip } from "./Tooltip";

export function Shell({
  userId,
  email,
  initialOwned,
  initialWishlist,
  initialFavorites,
  initialAvailability,
  children,
}: {
  userId: string;
  email: string;
  initialOwned: string[];
  initialWishlist: string[];
  initialFavorites: string[];
  initialAvailability: { setId: string; available: boolean }[];
  children: React.ReactNode;
}) {
  return (
    <UserProvider userId={userId} email={email}>
      <OwnedCardsProvider userId={userId} initial={initialOwned}>
        <WishlistProvider userId={userId} initial={initialWishlist}>
          <FavoritesProvider userId={userId} initial={initialFavorites}>
            <SetAvailabilityProvider userId={userId} initial={initialAvailability}>
              <PageTitleProvider>
                <TooltipProvider>
                  <div className="flex min-h-screen">
                    <Sidebar />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <MobileHeader />
                      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
                      <MobileNav />
                    </div>
                  </div>
                  <LogPackFab />
                  <Tooltip />
                </TooltipProvider>
              </PageTitleProvider>
            </SetAvailabilityProvider>
          </FavoritesProvider>
        </WishlistProvider>
      </OwnedCardsProvider>
    </UserProvider>
  );
}
