"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { adminLinks, navLinks } from "@/navigation/sidebar/sidebar-items";

export function NavMain({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const { setOpen, setOpenMobile } = useSidebar();
  // The side menu is a drawer on every screen size: close it once a page is chosen.
  const closeMenu = () => {
    setOpenMobile(false);
    setOpen(false);
  };
  const render = (items: typeof navLinks) =>
    items.map((item) => (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton asChild tooltip={item.title} isActive={pathname.startsWith(item.url)}>
          <Link prefetch={false} href={item.url} onClick={closeMenu}>
            <item.icon />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));
  return (
    <>
      <SidebarGroup>
        <SidebarMenu>{render(navLinks.filter((l) => !l.secondary))}</SidebarMenu>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>More</SidebarGroupLabel>
        <SidebarMenu>{render([...navLinks.filter((l) => l.secondary), ...(isAdmin ? adminLinks : [])])}</SidebarMenu>
      </SidebarGroup>
    </>
  );
}
