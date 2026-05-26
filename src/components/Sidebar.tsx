"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Shield, Search, Users, Database, LayoutDashboard, LogOut, Menu, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/busca", label: "Busca Facial", icon: Search },
  { href: "/qualificados", label: "Qualificados", icon: Users },
  { href: "/indexacao", label: "Indexação", icon: Database },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* ── MOBILE: header top bar ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="bg-blue-700 rounded-lg p-1">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">Intel Facial</p>
            <p className="text-xs text-gray-500 leading-tight">42º BPM</p>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-gray-400 hover:text-white p-1"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* ── MOBILE: drawer menu ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-20 bg-black/60" onClick={() => setMobileOpen(false)}>
          <div
            className="absolute top-14 left-0 bottom-16 w-64 bg-gray-900 border-r border-gray-800 flex flex-col p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="flex-1 space-y-1 mt-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? "bg-blue-700 text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {item.label}
                </Link>
              ))}
            </nav>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors mt-2"
            >
              <LogOut className="w-5 h-5" />
              Sair
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE: bottom navigation ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-gray-900 border-t border-gray-800 flex">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors ${
              isActive(item.href) ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="leading-tight text-center">
              {item.label === "Busca Facial" ? "Busca" : item.label}
            </span>
          </Link>
        ))}
      </div>

      {/* ── DESKTOP: sidebar ── */}
      <aside className="hidden md:flex w-56 bg-gray-900 border-r border-gray-800 flex-col flex-shrink-0">
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-800">
          <div className="bg-blue-700 rounded-lg p-1.5">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">Intel Facial</p>
            <p className="text-xs text-gray-500 leading-tight">42º BPM</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-blue-700 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
