type IconName =
  | "search"
  | "close"
  | "plus"
  | "minus"
  | "layers"
  | "tools"
  | "terrain"
  | "locate"
  | "route"
  | "play"
  | "grip"
  | "pin"
  | "walk"
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
  | "arrow"
  | "straight"
  | "turnLeft"
  | "turnRight"
  | "uTurn";

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
    tools: (
      <>
        <circle cx="6" cy="7" r="2.2" />
        <circle cx="18" cy="6" r="2.2" />
        <circle cx="16" cy="18" r="2.2" />
        <path d="m7.9 8.1 6.3 7.6M8.2 6.8l7.5-.6M17.5 8.2l-1.1 7.6" />
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
        <circle cx="13.2" cy="4.2" r="1.8" />
        <path d="m11.2 7.2-1.7 5.1 3.2 2.7-1.2 6.2" />
        <path d="m11.1 7.4 3.5 2.6 3.3-.8M9.5 12.3l-3 3.1M12.7 15l4.1 5.8" />
      </>
    ),
    bike: (
      <>
        <circle cx="5.5" cy="17.2" r="3.8" />
        <circle cx="18.5" cy="17.2" r="3.8" />
        <circle cx="11.3" cy="17.2" r="1.1" />
        <path d="m5.5 17.2 4-7h4.5l4.5 7.2M9.5 10.2l1.8 7 3.9-7M7.8 7.3h3.3M14.6 7.2h2.8" />
      </>
    ),
    car: (
      <>
        <path d="M4.2 12.2 6.1 7A2.5 2.5 0 0 1 8.5 5.3h7A2.5 2.5 0 0 1 17.9 7l1.9 5.2 1.2 1.4v5.1h-2.8l-.7-2H6.4l-.7 2H3v-5.1l1.2-1.4Z" />
        <path d="M6.2 11.5h11.6L16.3 7H7.8l-1.6 4.5ZM5.8 14.4h2.1M16.1 14.4h2.1M8.4 18.7v1M15.6 18.7v1" />
      </>
    ),
    bus: (
      <>
        <path d="M6 3.2h12a2 2 0 0 1 2 2v12.2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5.2a2 2 0 0 1 2-2Z" />
        <path d="M7 6h10M6.5 8.2h11v5.6h-11zM7.3 16.4h2M14.7 16.4h2M7 19.4v1.4M17 19.4v1.4" />
        <circle cx="8.3" cy="16.4" r=".65" fill="currentColor" stroke="none" />
        <circle cx="15.7" cy="16.4" r=".65" fill="currentColor" stroke="none" />
      </>
    ),
    train: (
      <>
        <path d="m9 3 3-2 3 2M8.2 3.2h7.6A3.2 3.2 0 0 1 19 6.4v9.5a3.1 3.1 0 0 1-3.1 3.1H8.1A3.1 3.1 0 0 1 5 15.9V6.4a3.2 3.2 0 0 1 3.2-3.2Z" />
        <path d="M7.4 7h9.2v5.2H7.4zM8.2 16h1.6M14.2 16h1.6M9 19l-2.5 3M15 19l2.5 3M7.8 21h8.4" />
        <circle cx="9" cy="15.9" r=".7" fill="currentColor" stroke="none" />
        <circle cx="15" cy="15.9" r=".7" fill="currentColor" stroke="none" />
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
    straight: <path d="M12 21V4M6.5 9.5 12 4l5.5 5.5" />,
    turnLeft: <path d="M20 19v-4a6 6 0 0 0-6-6H5M10 4 5 9l5 5" />,
    turnRight: <path d="M4 19v-4a6 6 0 0 1 6-6h9M14 4l5 5-5 5" />,
    uTurn: <path d="M18 20V10a6 6 0 0 0-12 0v5M2 11l4 4 4-4" />,
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
