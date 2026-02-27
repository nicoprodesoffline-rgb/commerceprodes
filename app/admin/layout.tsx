import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminSidebar from "components/admin/sidebar";

// Force dynamic — admin pages read cookies/headers, never cache
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware sets x-admin-public:1 for /admin/login — skip auth guard to avoid redirect loop
  const headersList = await headers();
  if (headersList.get("x-admin-public") === "1") {
    return <>{children}</>;
  }

  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session")?.value;

  if (!session) {
    redirect("/admin/login");
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
