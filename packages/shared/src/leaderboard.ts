// Leaderboard categories and the board-size threshold. Pure values shared by the API and the browser.
export const SKY_CATEGORIES = ['flights', 'distance', 'countries', 'cities', 'airlines'] as const
export const GROUND_CATEGORIES = ['rail', 'road', 'ground_countries'] as const
export const LEADERBOARD_CATEGORIES = [...SKY_CATEGORIES, ...GROUND_CATEGORIES] as const
export type LeaderboardCategory = (typeof LEADERBOARD_CATEGORIES)[number]
export type GroundCategory = (typeof GROUND_CATEGORIES)[number]
export const isGroundCategory = (category: string): category is GroundCategory =>
  (GROUND_CATEGORIES as readonly string[]).includes(category)

/** Above this many participants the page shows the top ten plus the viewer's neighbourhood. */
export const SHOW_EVERYONE_UP_TO = 20
