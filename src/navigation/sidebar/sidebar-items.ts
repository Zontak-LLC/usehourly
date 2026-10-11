import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  Clock,
  FileText,
  type LucideIcon,
  UserRound,
  Users,
} from "lucide-react";

export interface NavLink {
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
}

export const navLinks: NavLink[] = [
  { id: "today", title: "Today", url: "/dashboard/today", icon: Clock },
  { id: "week", title: "Week", url: "/dashboard/week", icon: CalendarDays },
  { id: "month", title: "Month", url: "/dashboard/month", icon: CalendarRange },
  { id: "report", title: "Annual report", url: "/dashboard/report", icon: BarChart3 },
  { id: "invoices", title: "Invoices", url: "/dashboard/invoices", icon: FileText },
  { id: "clients", title: "Clients & projects", url: "/dashboard/clients", icon: Users },
  { id: "account", title: "Account", url: "/dashboard/account", icon: UserRound },
];
