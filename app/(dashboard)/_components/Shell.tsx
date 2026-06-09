"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  LogOut,
  Settings,
  Layers,
  CreditCard,
  MoreHorizontal,
  Notebook,
  FolderOpen,
  LineChart,
  Package,
  Receipt,
  Heart,
  Sparkles,
  Globe2,
  type LucideIcon,
} from "lucide-react";
import { OwnedCardsProvider, type InitialOwnedCard } from "../_lib/OwnedCardsContext";
import { WishlistProvider } from "../_lib/WishlistContext";
import { FavoritesProvider } from "../_lib/FavoritesContext";
import { SetAvailabilityProvider } from "../_lib/SetAvailabilityContext";
import { PokemonHoverProvider } from "../_lib/PokemonHoverContext";
import { PageTitleProvider } from "../_lib/PageTitleContext";
import { UserProvider, useUser } from "../_lib/UserContext";
import { CardPreviewProvider } from "../_lib/CardPreviewContext";
import { signOut } from "../_lib/auth-actions";
import { LogPackFab } from "./LogPackFab";
import { PokemonHoverTooltip } from "./PokemonHoverTooltip";
import { CardPreviewOverlay } from "./CardPreviewOverlay";
import { AppShell } from "@/lib/components/shell/AppShell";
import {
  Sidebar,
  type SidebarNavGroup,
  type SidebarNavItem,
} from "@/lib/components/shell/Sidebar";
import { TopBar } from "@/lib/components/shell/TopBar";
import { Breadcrumbs } from "@/lib/components/shell/Breadcrumbs";
import { useBreadcrumbs } from "@/lib/components/shell/useBreadcrumbs";
import {
  SidebarUserCard,
  type UserCardMenuItem,
} from "@/lib/components/shell/SidebarUserCard";
import { ThemeToggle } from "@/lib/theme/ThemeToggle";
import { PokedexLogo, PokeballIcon } from "@/lib/components/ui/PokedexLogo";
import type { PriceSource } from "@/lib/pricing/pokemontcg";
import type { Currency } from "@/lib/pricing/currencies";
import type { MegaPlacement } from "../_lib/mega-prefs";
import type { VariantPlacement } from "../_lib/variant-prefs";

interface ShellProps {
  userId: string;
  email: string;
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  treatVariantsAsSeparate: boolean;
  variantPlacement: VariantPlacement;
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
  initialOwned: InitialOwnedCard[];
  initialWishlist: string[];
  initialFavorites: string[];
  initialAvailability: { setId: string; available: boolean }[];
  children: React.ReactNode;
}

export function Shell({
  userId,
  email,
  priceSource,
  treatMegasAsSeparate,
  megaPlacement,
  treatVariantsAsSeparate,
  variantPlacement,
  displayCurrency,
  latestRatesFromEur,
  initialOwned,
  initialWishlist,
  initialFavorites,
  initialAvailability,
  children,
}: ShellProps) {
  return (
    <UserProvider
      userId={userId}
      email={email}
      priceSource={priceSource}
      treatMegasAsSeparate={treatMegasAsSeparate}
      megaPlacement={megaPlacement}
      treatVariantsAsSeparate={treatVariantsAsSeparate}
      variantPlacement={variantPlacement}
      displayCurrency={displayCurrency}
      latestRatesFromEur={latestRatesFromEur}
    >
      <OwnedCardsProvider userId={userId} initial={initialOwned}>
        <WishlistProvider userId={userId} initial={initialWishlist}>
          <FavoritesProvider userId={userId} initial={initialFavorites}>
            <SetAvailabilityProvider userId={userId} initial={initialAvailability}>
              <PageTitleProvider>
                <PokemonHoverProvider>
                  <CardPreviewProvider>
                    <ShellInner>{children}</ShellInner>
                  </CardPreviewProvider>
                </PokemonHoverProvider>
              </PageTitleProvider>
            </SetAvailabilityProvider>
          </FavoritesProvider>
        </WishlistProvider>
      </OwnedCardsProvider>
    </UserProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { isGuest, email, treatMegasAsSeparate, megaPlacement, treatVariantsAsSeparate, variantPlacement } =
    useUser();
  const pathname = usePathname();
  const breadcrumbItems = useBreadcrumbs(pathname);
  const showMegasNav = !isGuest && treatMegasAsSeparate && megaPlacement === "separate";
  const showVariantsNav =
    !isGuest && treatVariantsAsSeparate && variantPlacement === "separate";

  const navGroups = useMemo<SidebarNavGroup[]>(
    () => buildNavGroups({ showMegasNav, showVariantsNav, isGuest }),
    [showMegasNav, showVariantsNav, isGuest],
  );

  const pinnedLinks: SidebarNavItem[] = isGuest
    ? []
    : [{ name: "Settings", url: "/settings", icon: Settings }];

  const userInitials = email ? email[0]!.toUpperCase() : "?";

  const userMenuItems: UserCardMenuItem[] = [
    { type: "link", label: "Settings", href: "/settings", icon: Settings },
    {
      type: "button",
      label: "Sign out",
      loadingLabel: "Signing out…",
      icon: LogOut,
      danger: true,
      onClick: async () => {
        await signOut();
      },
    },
  ];

  const sidebar = (
    <Sidebar
      identity={
        <div className="flex h-10 items-center px-2">
          <PokedexLogo size="md" />
        </div>
      }
      navGroups={navGroups}
      pinnedLinks={pinnedLinks}
      userCard={
        !isGuest ? (
          <SidebarUserCard
            name={email}
            initials={userInitials}
            menuItems={userMenuItems}
          />
        ) : undefined
      }
    />
  );

  const topBar = (
    <TopBar
      leftCluster={<Breadcrumbs items={breadcrumbItems} />}
      rightCluster={<ThemeToggle />}
    />
  );

  return (
    <>
      <AppShell sidebar={sidebar} topBar={topBar}>
        {children}
      </AppShell>
      {!isGuest && <LogPackFab />}
      <PokemonHoverTooltip />
      <CardPreviewOverlay />
    </>
  );
}

interface FlatNavSpec {
  name: string;
  url: string;
  icon: LucideIcon | ((p: { className?: string }) => React.ReactElement);
  group: "Browse" | "Collection" | "Activity";
}

function buildNavGroups({
  showMegasNav,
  showVariantsNav,
  isGuest,
}: {
  showMegasNav: boolean;
  showVariantsNav: boolean;
  isGuest: boolean;
}): SidebarNavGroup[] {
  const specs: FlatNavSpec[] = [
    { name: "Pokédex", url: "/pokedex", icon: PokeballIcon, group: "Browse" },
    ...(showMegasNav
      ? ([
          {
            name: "Mega Evolutions",
            url: "/megas",
            icon: Sparkles,
            group: "Browse" as const,
          },
        ] satisfies FlatNavSpec[])
      : []),
    ...(showVariantsNav
      ? ([
          {
            name: "Regional Variants",
            url: "/variants",
            icon: Globe2,
            group: "Browse" as const,
          },
        ] satisfies FlatNavSpec[])
      : []),
    { name: "Sets", url: "/sets", icon: Layers, group: "Browse" },
    { name: "Cards", url: "/cards", icon: CreditCard, group: "Browse" },
    { name: "Other cards", url: "/other", icon: MoreHorizontal, group: "Browse" },
  ];

  if (!isGuest) {
    specs.push(
      { name: "Binders", url: "/binders", icon: Notebook, group: "Collection" },
      { name: "Collection", url: "/collection", icon: FolderOpen, group: "Collection" },
      { name: "Portfolio", url: "/portfolio", icon: LineChart, group: "Collection" },
      { name: "Wishlist", url: "/wishlist", icon: Heart, group: "Collection" },
      { name: "Packs", url: "/packs", icon: Package, group: "Activity" },
      { name: "Transactions", url: "/transactions", icon: Receipt, group: "Activity" },
    );
  }

  const groupOrder = (
    isGuest ? (["Browse"] as const) : (["Browse", "Collection", "Activity"] as const)
  ).filter(Boolean);

  return groupOrder
    .map((title) => ({
      title,
      items: specs
        .filter((s) => s.group === title)
        .map(({ name, url, icon }) => ({ name, url, icon })),
    }))
    .filter((g) => g.items.length > 0);
}
