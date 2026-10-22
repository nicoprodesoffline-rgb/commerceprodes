import { formatAmount } from "lib/site-dto/pricing";

// BC1-B : formatage depuis la chaîne décimale (pas de parseFloat), base fiscale
// affichée telle que fournie par le snapshot (par défaut « HT »).
const Price = ({
  amount,
  className,
  currencyCode = "EUR",
  taxBasis = "HT",
}: {
  amount: string;
  className?: string;
  currencyCode: string;
  currencyCodeClassName?: string;
  taxBasis?: string;
} & React.ComponentProps<"p">) => (
  <p suppressHydrationWarning={true} className={className}>
    {formatAmount(amount, currencyCode)}
    {` ${taxBasis}`}
  </p>
);

export default Price;
