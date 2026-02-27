import { cookies } from "next/headers";
import AdminSidebar from "components/admin/sidebar";
import AdminLoginPage from "./login/page";

// Force dynamic — admin pages read cookies, never cache
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session")?.value;

  // No session → render the login form in place (no redirect() = no exception)
  // proxy.ts handles the primary redirect; this is the safety fallback
  if (!session) {
    return <AdminLoginPage />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar />
      <main className="ml-60 flex-1 overflow-y-auto bg-gray-50">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
