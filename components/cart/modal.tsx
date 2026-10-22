"use client";

import clsx from "clsx";
import { Dialog, Transition } from "@headlessui/react";
import { ShoppingCartIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Price from "components/price";
import { createUrl } from "lib/utils";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { axesLabel, useCart } from "./cart-context";
import { DeleteItemButton } from "./delete-item-button";
import { EditItemQuantityButton } from "./edit-item-quantity-button";
import OpenCart from "./open-cart";

export default function CartModal() {
  const { displayed, totalQuantity, displayedTotal, updateLine, isOpen, openCart, closeCart } =
    useCart();

  return (
    <>
      <button aria-label="Ouvrir le panier" onClick={openCart}>
        <OpenCart quantity={totalQuantity} />
      </button>
      <Transition show={isOpen}>
        <Dialog onClose={closeCart} className="relative z-50">
          <Transition.Child
            as={Fragment}
            enter="transition-all ease-in-out duration-300"
            enterFrom="opacity-0 backdrop-blur-none"
            enterTo="opacity-100 backdrop-blur-[.5px]"
            leave="transition-all ease-in-out duration-200"
            leaveFrom="opacity-100 backdrop-blur-[.5px]"
            leaveTo="opacity-0 backdrop-blur-none"
          >
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          </Transition.Child>
          <Transition.Child
            as={Fragment}
            enter="transition-all ease-in-out duration-300"
            enterFrom="translate-x-full"
            enterTo="translate-x-0"
            leave="transition-all ease-in-out duration-200"
            leaveFrom="translate-x-0"
            leaveTo="translate-x-full"
          >
            <Dialog.Panel className="fixed bottom-0 right-0 top-0 flex h-full w-full flex-col border-l border-neutral-200 bg-white/80 p-6 text-black backdrop-blur-xl md:w-[390px] dark:border-neutral-700 dark:bg-black/80 dark:text-white">
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold">Mon panier</p>
                <button aria-label="Fermer le panier" onClick={closeCart}>
                  <CloseCart />
                </button>
              </div>

              {displayed.length === 0 ? (
                <div className="mt-20 flex w-full flex-col items-center justify-center overflow-hidden">
                  <ShoppingCartIcon className="h-16 text-gray-300" />
                  <p className="mt-6 text-center text-xl font-semibold text-gray-700">
                    Votre panier est vide
                  </p>
                  <Link href="/search" onClick={closeCart} className="mt-4 text-sm text-[#cc1818] hover:underline">
                    Voir le catalogue →
                  </Link>
                </div>
              ) : (
                <div className="flex h-full flex-col justify-between overflow-hidden p-1">
                  <ul className="grow overflow-auto py-4">
                    {displayed.map((item) => {
                      const merchandiseUrl = createUrl(
                        `/product/${item.family_slug}`,
                        new URLSearchParams(item.variant_axes),
                      );
                      return (
                        <li
                          key={item.public_item_key}
                          className="flex w-full flex-col border-b border-neutral-300 dark:border-neutral-700"
                        >
                          <div className="relative flex w-full flex-row justify-between px-1 py-4">
                            <div className="absolute z-40 -ml-1 -mt-2">
                              <DeleteItemButton
                                itemKey={item.public_item_key}
                                optimisticUpdate={updateLine}
                              />
                            </div>
                            <div className="flex flex-row">
                              <div className="relative h-16 w-16 overflow-hidden rounded-md border border-neutral-300 bg-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800">
                                <Image
                                  className="h-full w-full object-cover"
                                  width={64}
                                  height={64}
                                  alt={item.family_name}
                                  src={item.image_url}
                                />
                              </div>
                              <Link
                                href={merchandiseUrl}
                                onClick={closeCart}
                                className="z-30 ml-2 flex flex-row space-x-4"
                              >
                                <div className="flex flex-1 flex-col text-base">
                                  <span className="leading-tight">{item.family_name}</span>
                                  <p className="text-xs text-neutral-500">
                                    {item.public_item_key}
                                    {Object.keys(item.variant_axes).length > 0
                                      ? ` · ${axesLabel(item.variant_axes)}`
                                      : ""}
                                  </p>
                                </div>
                              </Link>
                            </div>
                            <div className="flex h-16 flex-col justify-between">
                              {item.line_amount !== null && item.price.ok ? (
                                <Price
                                  className="flex justify-end space-y-2 text-right text-sm"
                                  amount={item.line_amount}
                                  currencyCode={item.price.price.currency}
                                />
                              ) : (
                                <p className="text-right text-xs font-semibold text-amber-700">
                                  Prix indisponible
                                </p>
                              )}
                              <div className="ml-auto flex h-9 flex-row items-center rounded-full border border-neutral-200 dark:border-neutral-700">
                                <EditItemQuantityButton
                                  itemKey={item.public_item_key}
                                  type="minus"
                                  optimisticUpdate={updateLine}
                                />
                                <p className="w-6 text-center">
                                  <span className="w-full text-sm">{item.quantity}</span>
                                </p>
                                <EditItemQuantityButton
                                  itemKey={item.public_item_key}
                                  type="plus"
                                  optimisticUpdate={updateLine}
                                />
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="py-4 text-sm text-gray-500">
                    <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2">
                      <p>Somme des lignes</p>
                      {displayedTotal !== null ? (
                        <Price
                          className="text-right text-base font-semibold text-gray-900"
                          amount={displayedTotal}
                          currencyCode="EUR"
                        />
                      ) : (
                        <p className="text-right text-amber-700">Prix indisponible</p>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      TVA et frais de port : non qualifiés. Montant affiché indicatif, revalidé
                      par le serveur.
                    </p>
                  </div>
                  <Link
                    href="/cart"
                    onClick={closeCart}
                    className="block w-full rounded-md bg-[#cc1818] p-3 text-center text-sm font-semibold text-white hover:bg-[#aa1414] transition-colors"
                  >
                    Voir le panier — devis ou commande (simulation)
                  </Link>
                </div>
              )}
            </Dialog.Panel>
          </Transition.Child>
        </Dialog>
      </Transition>
    </>
  );
}

function CloseCart({ className }: { className?: string }) {
  return (
    <div className="relative flex h-11 w-11 items-center justify-center rounded-md border border-neutral-200 text-black transition-colors dark:border-neutral-700 dark:text-white">
      <XMarkIcon
        className={clsx(
          "h-6 transition-all ease-in-out hover:scale-110",
          className,
        )}
      />
    </div>
  );
}
