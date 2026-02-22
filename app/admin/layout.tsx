import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminSidebar from "components/admin/sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
