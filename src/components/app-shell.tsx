"use client";

import clsx from "clsx";
import { BookOpenText, ClipboardList, Library, Settings, Send } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "工作台", icon: ClipboardList },
  { href: "/", label: "文章库", icon: Library },
  { href: "/publish-queue", label: "发布队列", icon: Send },
  { href: "/reviews", label: "复盘", icon: BookOpenText },
  { href: "/settings", label: "设置", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" aria-label="公众号内容生产工作台">
          <span className="brand-mark">微</span>
          <span>内容生产工作台</span>
        </div>
        <nav className="nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link className={clsx("nav-link", active && "active")} href={item.href} key={item.label}>
                <Icon size={16} aria-hidden />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
