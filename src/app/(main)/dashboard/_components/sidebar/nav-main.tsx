"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { navLinks } from "@/navigation/sidebar/sidebar-items";

export function NavMain() {
  const pathname = usePathname();
  return (
    <SidebarGroup>
      <SidebarMenu>
        {navLinks.map((item) => (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton asChild tooltip={item.title} isActive={pathname.startsWith(item.url)}>
              <Link prefetch={false} href={item.url}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
