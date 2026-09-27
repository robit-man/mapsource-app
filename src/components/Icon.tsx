type IconName =
  | "search"
  | "close"
  | "plus"
  | "minus"
  | "layers"
  | "terrain"
  | "locate"
  | "route"
  | "play"
  | "pause"
  | "restart"
  | "grip"
  | "pin"
  | "walk"
  | "run"
  | "bike"
  | "car"
  | "bus"
  | "train"
  | "chevronUp"
  | "chevronDown"
  | "mountain"
  | "food"
  | "coffee"
  | "shop"
  | "grocery"
  | "fuel"
  | "pharmacy"
  | "hotel"
  | "park"
  | "phone"
  | "globe"
  | "arrow";

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    terrain: (
      <>
        <path d="m3 19 6-10 4 6 2-3 6 7H3Z" />
        <path d="m7.5 11.5 2 1.5 2-1" />
      </>
    ),
    locate: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
    route: (
      <>
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3" />
      </>
    ),
    play: <path fill="currentColor" stroke="none" d="m8 5 11 7-11 7V5Z" />,
    pause: (
      <path fill="currentColor" stroke="none" d="M7 5h4v14H7zM14 5h4v14h-4z" />
    ),
    restart: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" />
        <path d="M4 4v4.6h4.6" />
      </>
    ),
    grip: (
      <>
        <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" />
        <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    walk: (
      <>
        <circle cx="13" cy="4" r="2" />
        <path d="m10 22 2-7-3-3 2-5 4 3 3 1M6 22l3-7M14 14l3 8" />
      </>
    ),
    run: (
      <>
        <circle cx="15" cy="4" r="2" />
        <path d="m5 13 5-3 3-3 3 4 3 2M9 11l3 4-4 7M12 15l5 2-2 5" />
      </>
    ),
    bike: (
      <>
        <circle cx="6" cy="17" r="4" />
        <circle cx="18" cy="17" r="4" />
        <path d="m6 17 4-8 4 8h-8Zm4-8h5l3 8M9 6h3" />
      </>
    ),
    car: (
      <>
        <path d="m5 16-1 2v2h2l1-2h10l1 2h2v-2l-1-2-2-7a2 2 0 0 0-2-1H9a2 2 0 0 0-2 1l-2 7Z" />
        <path d="M6 14h12M8 11h8" />
        <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    bus: (
      <>
        <rect x="5" y="3" width="14" height="16" rx="3" />
        <path d="M7.5 7h9v5h-9zM7 15h10" />
        <circle cx="8" cy="19" r="1.5" />
        <circle cx="16" cy="19" r="1.5" />
      </>
    ),
    train: (
      <>
        <rect x="5" y="3" width="14" height="15" rx="4" />
        <path d="M8 7h8M7 13h10M9 18l-3 3M15 18l3 3" />
        <circle cx="9" cy="15" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="15" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    chevronUp: <path d="m6 15 6-6 6 6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    mountain: (
      <>
        <path d="m2 20 7-12 4 6 3-4 6 10H2Z" />
        <path d="m7.5 10.5 1.5 1 1.5-1" />
      </>
    ),
    food: (
      <>
        <path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18M16 3c3 2 4 6 0 9" />
      </>
    ),
    coffee: (
      <>
        <path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8ZM17 10h1a3 3 0 0 1 0 6h-2" />
        <path d="M8 3v2M12 3v2" />
      </>
    ),
    shop: (
      <>
        <path d="M4 9h16l-2-5H6L4 9Z" />
        <path d="M5 9v11h14V9M9 20v-6h6v6" />
      </>
    ),
    grocery: (
      <>
        <path d="m3 4 2 2 2 9h10l3-7H6" />
        <circle cx="9" cy="19" r="1.5" />
        <circle cx="17" cy="19" r="1.5" />
      </>
    ),
    fuel: (
      <>
        <rect x="5" y="3" width="10" height="18" rx="2" />
        <path d="M8 7h4M15 8h2l2 2v7a2 2 0 0 0 2 2V9l-2-2" />
      </>
    ),
    pharmacy: (
      <>
        <path d="M12 5v14M5 12h14" />
        <circle cx="12" cy="12" r="9" />
      </>
    ),
    hotel: (
      <>
        <path d="M4 19V6M4 15h16v4M7 11h4a3 3 0 0 1 3 3v1M7 11V8h4a3 3 0 0 1 3 3" />
      </>
    ),
    park: (
      <>
        <path d="m12 3-5 8h3l-4 6h12l-4-6h3l-5-8Z" />
        <path d="M12 17v4" />
      </>
    ),
    phone: (
      <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 3c-4-1.5-6.5-4-8-8l3-2-2-5Z" />
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M14 7l5 5-5 5" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    >
      {paths[name]}
    </svg>
  );
}
