"use client";

import { useRef } from "react";

import Link from "next/link";

import { CircleHelp, ImagePlus, LogOut, Trash2, User } from "lucide-react";

import { AvatarCropper } from "@/components/avatar-cropper";
import { Caret } from "@/components/caret";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAvatarUpload } from "@/components/use-avatar-upload";
import { UserAvatar } from "@/components/user-avatar";
import { feature } from "@/lib/features";
import { signOutOfDevice } from "@/lib/sign-out";

/**
 * The signed-in person at the top right: their picture (or initials) and name, and a menu with their address, Account,
 * Help and Log out. It replaced the name and Log out that used to sit at the bottom of the side menu and in "More".
 */
export function UserMenu({ user }: { user: { name: string; email: string; avatar: string | null } }) {
  const file = useRef<HTMLInputElement>(null);
  const avatar = useAvatarUpload();
  const pictures = feature("avatar");
  return (
    <>
      {/* Outside the menu, so choosing the entry (which closes the menu) does not take the file box with it. */}
      {pictures && (
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose your picture file"
          onChange={avatar.pick}
        />
      )}
      {pictures && <AvatarCropper crop={avatar.crop} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Account menu for ${user.name}`}
            className="flex h-10 items-center gap-2 rounded-lg border bg-card pr-2 pl-1 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted"
          >
            <UserAvatar name={user.name} avatar={user.avatar} />
            <span className="max-w-32 truncate font-medium text-sm max-sm:hidden">{user.name}</span>
            <Caret className="max-sm:hidden" />
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
          {pictures && (
            <DropdownMenuItem disabled={avatar.busy} onSelect={() => file.current?.click()}>
              <ImagePlus /> {user.avatar ? "Change your picture" : "Add a picture"}
            </DropdownMenuItem>
          )}
          {pictures && user.avatar && (
            <DropdownMenuItem disabled={avatar.busy} onSelect={() => void avatar.remove()}>
              <Trash2 /> Remove your picture
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href="/help" prefetch={false}>
              <CircleHelp /> Help
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => signOutOfDevice({ callbackUrl: "/auth/v2/login" })}>
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
