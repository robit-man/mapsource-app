# Route-less mobile map state research

Research date: 2026-09-27

## Decision

When the mobile action sheet is minimized and no route exists, Mapsource uses a
small `Explore this area` surface with:

1. one primary `Where to?` destination-search action; and
2. four immediate nearby-discovery actions: Hungry, Coffee, Outdoors, and Fuel.

The map stays visible and interactive. Selecting a category uses the existing
regional discovery endpoint and renders real results on the map. Selecting
`Where to?` opens the existing destination flow. Simulated route replay is not
part of this state or the expanded route sheet; only live GPS navigation drives
route progress and the traveled-route overlay.

We intentionally do not show recent trips, saved places, popularity rankings,
time-sensitive recommendations, or personalized suggestions yet. Those require
durable account/history data or a defensible recommendation signal. Empty
placeholders or fabricated recommendations would be less useful than a direct
search action.

## What peer mobile map products do

### Google Maps

Google places destination search and category suggestions at the top of map
exploration. Its official documentation names Restaurants, Coffee, and Hotels
as examples, and says local ranking combines relevance, distance, and
prominence. The mobile Explore surface adds nearby restaurants, local
favorites, sights, and activities, sometimes adapted to location and time.

On 2026-09-27, a logged-out Google Maps mobile-web session was inspected in a
412 × 839 CSS-pixel Chromium viewport with Portland-area geolocation. The
initial map prioritized a `Search Google Maps` field, visible Restaurants,
Hotels, and Things to do shortcuts, and a local context card; it did not reserve
a large empty drawer.

Sources:

- [Google Maps: Search for nearby places and explore the area](https://support.google.com/maps/answer/4610185?hl=en)
- [Google Maps: Find nearby inspiration in Explore](https://support.google.com/maps/answer/10014587?hl=en-GB)
- [Google Maps: mobile app navigation and Explore/You roles](https://support.google.com/maps/answer/144349?hl=en)

### Apple Maps

Apple's mobile card keeps search primary, presents nearby categories such as
restaurants and groceries, and lets the user resize the card by dragging. The
map can be moved to change the nearby search area. This supports using the
smallest sheet for actions rather than summary metrics when no route exists.

Sources:

- [Apple Maps: Find nearby attractions, restaurants, and services](https://support.apple.com/en-gb/guide/iphone/iphbaf51b2c0/ios)
- [Apple Maps: Search for places and resize the card](https://support.apple.com/en-au/guide/iphone/iph1df24639/ios)

### AllTrails

AllTrails' Explore map emphasizes nearby trail pins. Tapping a pin produces a
bottom trail card that can be opened for detail. Its navigation entry points
also emphasize starting navigation or choosing saved/downloaded/nearby routes,
which are valuable only when those underlying data sets exist.

Sources:

- [AllTrails: Use map view to search for trails](https://support.alltrails.com/hc/en-us/articles/360034969432-How-to-use-map-view-to-search-for-trails)
- [AllTrails: Navigate feature overview](https://support.alltrails.com/hc/en-gb/articles/360059000272-Navigate-feature-overview)

### Komoot

Komoot emphasizes locally relevant route recommendations and highlights, then
supports choosing route endpoints by search, current location, point of
interest, or direct map selection. Its route properties live in a bottom panel
after a route exists. This reinforces the distinction between route-less
discovery and route-present metrics.

Sources:

- [Komoot: Tour recommendations](https://www.komoot.com/help/tour-recommendations)
- [Komoot: Choose route start and destination](https://support.komoot.com/hc/en-us/articles/4403138423066)
- [Komoot: Find routes and inspiration](https://support.komoot.com/hc/en-us/articles/10207999797530-Find-routes-and-inspiration-on-komoot)

## Product implications

| State                  | Highest-value content                | Mapsource implementation                             |
| ---------------------- | ------------------------------------ | ---------------------------------------------------- |
| No route, minimized    | destination intent + local discovery | `Where to?` plus four nearby categories              |
| Route ready, minimized | route status + next action           | metrics, next maneuver, waypoint progress, Start/End |
| Live navigation        | current guidance                     | GPS-driven progress, next turn, rerouting            |
| Place selected         | place decision                       | name/address/details and route actions               |

Future additions should be earned by real data. Once durable accounts and trip
history exist, recent destinations and saved routes are the strongest next
candidates. Once quality-scored trail/activity recommendations exist, a single
nearby route card can replace one category row without making the sheet denser.
