import Sidebar from "@/components/Sidebar";
import DevChat from "@/components/DevChat";
import { getUserRole } from "@/lib/get-role";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const role = await getUserRole();
  return (
    <div className="flex h-screen bg-gray-950">
      <Sidebar role={role} />
      {/* pt-14 = espaço pro header mobile, pb-16 = espaço pro bottom nav mobile */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 pt-16 pb-20 md:pt-6 md:pb-6">
        {children}
      </main>
      {role === "admin" && <DevChat />}
    </div>
  );
}
