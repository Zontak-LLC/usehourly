"use client";

import Link from "next/link";

import { ChevronDown, ImagePlus, LogOut, User } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { signOutOfDevice } from "@/lib/sign-out";

/**
 * The signed-in person at the top right: their picture (or initials) and name, and a menu with their address, Account
 * and Log out. It replaced the name and Log out that used to sit at the bottom of the side menu and in "More".
 */
export function UserMenu({ user }: { user: { name: string; email: string; avatar: string | null } }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${user.name}`}
          className="flex h-10 items-center gap-2 rounded-lg border bg-card pr-2 pl-1 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted"
        >
          <UserAvatar name={user.name} avatar={user.avatar} />
          <span className="max-w-32 truncate font-medium text-sm max-sm:hidden">{user.name}</span>
          <ChevronDown className="size-4 text-muted-foreground max-sm:hidden" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="flex items-center gap-3 font-normal">
          <UserAvatar name={user.name} avatar={user.avatar} className="size-10 text-sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground text-sm">{user.name}</span>
            <span className="block truncate text-muted-foreground text-xs">{user.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/account" prefetch={false}>
            <User /> Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/account" prefetch={false}>
            <ImagePlus /> {user.avatar ? "Change your picture" : "Add a picture"}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => signOutOfDevice({ callbackUrl: "/auth/v2/login" })}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
