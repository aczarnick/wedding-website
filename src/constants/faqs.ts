export interface FAQ {
  question: string;
  answer: string;
  link?: {
    href: string;
    label: string;
  };
}

export const FAQS: FAQ[] = [
  {
    question: "Is this in the middle of nowhere?",
    answer: "Yes, and it's beautiful! The ceremony and reception will be at Claire's Grandmother's farm!",
  },
  {
    question: "What should I wear?",
    answer: "Dress formal! The ceremony and reception are indoors at the farm, but the spaces aren't heated or air-conditioned — October evenings in Iowa can be cool, so consider bringing a layer.",
  },
  {
    question: "Will there be food and drinks?",
    answer: "Yes! Following the ceremony there will be a cocktail hour, then a full dinner and dessert! The bar will be open all night with beer, wine, seltzers, and liquor — plenty of choices!",
  },
  {
    question: "Do you have a registry?",
    answer: "We do! We're registered on The Knot.",
    link: { href: "/registry", label: "View our registry →" },
  },
];
 