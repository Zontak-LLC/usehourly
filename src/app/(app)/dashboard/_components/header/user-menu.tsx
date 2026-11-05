"use client";

import { useRef } from "react";

import Link from "next/link";

import { Activity, CircleHelp, ImagePlus, LogOut, Smartphone, Trash2, User, UsersRound } from "lucide-react";

import { AvatarCropper } from "@/components/avatar-cropper";
import { Caret } from "@/components/caret";
import { useInstallApp } from "@/components/install-app";
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
import { INSTALL_HELP_URL } from "@/lib/install-app";
import { signOutOfDevice } from "@/lib/sign-out";

/**
 * The signed-in person at the top right: their picture or initials only (a long name used to push the top bar onto two
 * rows, issue 217), and a menu with their name, address, Account, Help and Log out (Team and Insights when they apply).
 * It also took over what the tab bar's "More" menu used to hold.
 */
export function UserMenu({
  user,
  isAdmin = false,
}: {
  user: { name: string; email: string; avatar: string | null };
  isAdmin?: boolean;
}) {
  const file = useRef<HTMLInputElement>(null);
  const avatar = useAvatarUpload();
  const pictures = feature("avatar");
  const app = useInstallApp();
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
          {feature("team") && (
            <DropdownMenuItem asChild>
              <Link href="/dashboard/team" prefetch={false}>
                <UsersRound /> Team
              </Link>
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link href="/dashboard/insights" prefetch={false}>
                <Activity /> Insights
              </Link>
            </DropdownMenuItem>
          )}
          {/* Install the app (issue 70): one tap where the browser offers it, the steps on an iPhone, nothing once installed. */}
          {app.offer === "prompt" && (
            <DropdownMenuItem onSelect={() => void app.install()}>
              <Smartphone /> Install the app
            </DropdownMenuItem>
          )}
          {app.offer === "help" && (
            <DropdownMenuItem asChild>
              <Link href={INSTALL_HELP_URL} prefetch={false}>
                <Smartphone /> Add to Home Screen
              </Link>
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
