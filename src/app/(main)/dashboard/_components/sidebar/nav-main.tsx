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
import { navLinks } from "@/navigation/sidebar/sidebar-items";

export function NavMain() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const render = (items: typeof navLinks) =>
    items.map((item) => (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton asChild tooltip={item.title} isActive={pathname.startsWith(item.url)}>
          <Link prefetch={false} href={item.url} onClick={() => setOpenMobile(false)}>
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
        <SidebarMenu>{render(navLinks.filter((l) => l.secondary))}</SidebarMenu>
      </SidebarGroup>
    </>
  );
}
