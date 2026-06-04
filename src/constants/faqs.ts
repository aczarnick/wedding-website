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
    answer: "Yes! The ceremony and reception will be at Claire's Grandmothers farm!",
  },
  {
    question: "What should I wear?",
    answer: "Dress Formal. The ceremony and reception will be inside in unconditioned spaces. We will do whatever we can to make the night comfortable.",
  },
  {
    question: "Will there be food and drinks?",
    answer: "Yes! Following the ceremony there will be a cocktail hour(-ish). After that, there will be a full dinner and dessert! The bar will be open all night with beer and seltzers! If beer and seltzers aren't for you, feel free to bring your own!",
  },
  {
    question: "Do you have a registry?",
    answer: "We do! We're registered on The Knot.",
    link: { href: "/registry", label: "View our registry →" },
  },
];
 