import { Carousel } from "components/carousel";
import { ThreeItemGrid } from "components/grid/three-items";
import Footer from "components/layout/footer";

export const metadata = {
  title: "PRODES – Équipements pour collectivités",
  description:
    "Large choix de tables, chaises, mobilier urbain, signalisation. Livraison rapide. Meilleurs prix HT pour les organismes publics.",
  openGraph: {
    type: "website",
    title: "PRODES – Équipements pour collectivités",
    description:
      "Mobilier, signalisation et équipements au service des collectivités publiques.",
  },
};

export default function HomePage() {
  return (
    <>
      <ThreeItemGrid />
      <Carousel />
      <Footer />
    </>
  );
}
