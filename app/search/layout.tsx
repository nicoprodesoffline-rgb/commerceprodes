import { Suspense } from "react";
import Footer from "components/layout/footer";
import CategorySidebar, { type CategoryNode } from "components/layout/category-sidebar";
import { getCategories } from "lib/site-dto";
import ChildrenWrapper from "./children-wrapper";

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const all = getCategories();
  const categories: CategoryNode[] = all
    .filter((c) => c.parent_key === null)
    .map((c) => ({ ...c, children: all.filter((k) => k.parent_key === c.category_key) }));

  return (
    <>
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-4 pb-4 text-black md:flex-row dark:text-white">
        {/* Sidebar catégories */}
        <aside className="order-first w-full flex-none md:w-56 md:pt-4 flex flex-col">
          <Suspense fallback={null}>
            <CategorySidebar categories={categories} />
          </Suspense>
        </aside>

        {/* Contenu principal */}
        <div className="order-last min-h-screen w-full md:order-none md:pt-4">
          <Suspense fallback={null}>
            <ChildrenWrapper>{children}</ChildrenWrapper>
          </Suspense>
        </div>
      </div>
      <Footer />
    </>
  );
}
