export default function TrustBar() {
  const items = [
    { icon: "✓", text: "Plus de 983 références" },
    { icon: "✓", text: "Livraison en France métropolitaine" },
    { icon: "✓", text: "Devis gratuit sous 24h" },
    { icon: "✓", text: "Paiement sécurisé" },
  ];

  return (
    <div className="bg-gray-100 border-y border-gray-200">
      <div className="mx-auto max-w-screen-2xl px-4 py-3 lg:px-6">
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-around">
          {items.map((item) => (
            <div key={item.text} className="flex items-center gap-2">
              <span className="text-blue-600 font-bold">{item.icon}</span>
              <span className="text-sm text-gray-700">{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
