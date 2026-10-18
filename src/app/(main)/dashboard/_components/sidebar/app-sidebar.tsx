"use client";

import Link from "next/link";

import { useShallow } from "zustand/react/shallow";

import { LogoMark } from "@/components/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

type Props = React.ComponentProps<typeof Sidebar> & { user: { name: string; email: string }; isAdmin?: boolean };

export function AppSidebar({ user, isAdmin = false, ...props }: Props) {
  const { sidebarVariant, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.values.sidebar_variant,
      isSynced: s.isSynced,
    })),
  );

  const { setOpen, setOpenMobile } = useSidebar();
  // The side menu is a drawer on every screen size: close it once a page is chosen.
  const closeMenu = () => {
    setOpenMobile(false);
    setOpen(false);
  };

  return (
    <Sidebar {...props} variant={isSynced ? sidebarVariant : props.variant} collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link prefetch={false} href="/dashboard/today" onClick={closeMenu}>
                <LogoMark className="size-6 shrink-0" aria-hidden />
                <span className="font-semibold text-base">{APP_CONFIG.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain isAdmin={isAdmin} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
