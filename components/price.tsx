import clsx from "clsx";

const Price = ({
  amount,
  className,
  currencyCode = "EUR",
  currencyCodeClassName,
}: {
  amount: string;
  className?: string;
  currencyCode: string;
  currencyCodeClassName?: string;
} & React.ComponentProps<"p">) => (
  <p suppressHydrationWarning={true} className={className}>
    {new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(parseFloat(amount))}
    {" € HT"}
  </p>
);

export default Price;
