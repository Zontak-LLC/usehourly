"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { cn } from "cn";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { useInSectionGroup } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/toast-error";
import { trpc } from "@/lib/trpc";

/** Turns the demo account into a real one without losing a thing (or starting fresh, if preferred). */
export function ClaimDemoCard() {
  const grouped = useInSectionGroup();
  const router = useRouter();
  const claim = trpc.account.claimDemo.useMutation();
  const [startFresh, setStartFresh] = useState(true);
  // One line and a button until the person wants it; the demo banner's link (…/account#claim) opens it at once.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => window.location.hash === "#claim" && setOpen(true);
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    try {
      await claim.mutateAsync({ name: String(fd.get("name") ?? ""), email, password, startFresh });
      // The account's sign-in token changed, so sign in again with the new details.
      const res = await signIn("credentials", { email, password, redirect: false });
      toast.success("Your account is ready.");
      router.replace(res?.error ? "/auth/v2/login" : "/dashboard/today");
      router.refresh();
    } catch (err) {
      toastError(err, "Couldn't create your account.");
    }
  }

  return (
    <section id="claim" className={cn("flex scroll-mt-20 flex-col gap-3 p-4", !grouped && "rounded-xl border bg-card")}>
      <div>
        <h3 className="font-semibold">Keep your work: create a free account</h3>
        <p className="text-muted-foreground text-sm">
          You&rsquo;re in the demo, and it is deleted after 24 hours. Add your details to make it yours. Free, no ads,
          no card.
        </p>
      </div>
      {!open && (
        <Button type="button" variant="primary" className="self-start" onClick={() => setOpen(true)}>
          Create my account
        </Button>
      )}
      <form method="post" onSubmit={submit} className={open ? "grid gap-3" : "hidden"}>
        <div className="grid gap-1.5">
          <Label htmlFor="claim-name">Your name</Label>
          <Input id="claim-name" name="name" autoComplete="name" required maxLength={80} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="claim-email">Email</Label>
          <Input id="claim-email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="claim-password">Password</Label>
          <Input
            id="claim-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="text-muted-foreground text-xs">At least 8 characters.</p>
        </div>
        <fieldset className="grid gap-1 text-sm">
          <legend className="mb-1 font-medium">What about the sample data?</legend>
          <label className="flex items-start gap-2 py-2">
            <input type="radio" className="mt-1" checked={startFresh} onChange={() => setStartFresh(true)} />
            <span>
              <strong>Start fresh</strong> (recommended): remove the sample clients, projects, entries and invoices.
            </span>
          </label>
          <label className="flex items-start gap-2 py-2">
            <input type="radio" className="mt-1" checked={!startFresh} onChange={() => setStartFresh(false)} />
            <span>
              <strong>Keep the work</strong>: the clients, projects and time, including anything you added. The sample
              invoices are removed, because they carry the sample business details.
            </span>
          </label>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={claim.isPending}>
            Create my account
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Not now
          </Button>
        </div>
      </form>
    </section>
  );
}
