import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  CalendarRange,
  Clock,
  FileText,
  type LucideIcon,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";

export interface NavLink {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
  /** Rarely-used pages sit under a muted "More" heading so the daily four stand out. */
  secondary?: boolean;
  /** A shorter name for the top strip, where the full title would not fit. */
  short?: string;
}

export const navLinks: NavLink[] = [
  { id: "today", title: "Today", url: "/dashboard/today", icon: Clock },
  { id: "week", title: "Week", url: "/dashboard/week", icon: CalendarDays },
  { id: "month", title: "Month", url: "/dashboard/month", icon: CalendarRange },
  {
    id: "report",
    title: "Year summary (taxes)",
    url: "/dashboard/report",
    icon: BarChart3,
    secondary: true,
  },
  { id: "invoices", title: "Invoices", url: "/dashboard/invoices", icon: FileText },
  { id: "clients", title: "Clients & Projects", short: "Clients", url: "/dashboard/clients", icon: Users },
  { id: "team", title: "Team", url: "/dashboard/team", icon: UsersRound, secondary: true },
  { id: "account", title: "Account", url: "/dashboard/account", icon: UserRound, secondary: true },
  { id: "guide", title: "Guide", url: "/help", icon: BookOpen, secondary: true },
];

/** Shown only to the site owner (see lib/admin.ts). */
export const adminLinks: NavLink[] = [
  { id: "insights", title: "Insights", url: "/dashboard/insights", icon: Activity, secondary: true },
];
