import { Suspense } from "react";
import Footer from "components/layout/footer";
import FilterList from "components/layout/search/filter";
import CategorySidebar from "components/layout/category-sidebar";
import { CatalogFilters } from "components/layout/search/catalog-filters";
import { QuickOrderBar } from "components/quick-order/quick-order-bar";
import { sorting } from "lib/constants";
import { getRootCategories } from "lib/supabase/index";
import ChildrenWrapper from "./children-wrapper";

export default async function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await getRootCategories();

  return (
    <>
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-4 pb-4 text-black md:flex-row dark:text-white">
        {/* Sidebar catégories */}
        <aside className="order-first w-full flex-none md:w-56 md:pt-4 flex flex-col">
          <Suspense fallback={null}>
            <CategorySidebar categories={categories} />
          </Suspense>
          <Suspense fallback={null}>
            <CatalogFilters />
          </Suspense>
          <QuickOrderBar />
        </aside>

        {/* Contenu principal */}
        <div className="order-last min-h-screen w-full md:order-none">
          <Suspense fallback={null}>
            <ChildrenWrapper>{children}</ChildrenWrapper>
          </Suspense>
        </div>

        {/* Filtre tri */}
        <div className="order-none flex-none md:order-last md:w-32 md:pt-4">
          <FilterList list={sorting} title="Trier par" />
        </div>
      </div>
      <Footer />
    </>
  );
}
