export interface SeoValues {
  clientName: string
  clientLocation: string
  clientState: string
  stateAbbreviated: boolean
  reAbbreviated: boolean
  solo: boolean
}

export interface SeoTitle {
  titleName: string
  title: string
  characterCount: number
}

export type GroupedTitles = Record<string, SeoTitle[]>

export const STATE_MAP: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
  California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY",
}

export function abbreviateState(text: string): string {
  return Object.entries(STATE_MAP).reduce(
    (t, [state, abbr]) => t.replace(new RegExp(`\\b${state}\\b`, "gi"), abbr),
    text
  )
}

export function titleCase(text: string): string {
  return text.toLowerCase().split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

export function sentenceCase(text: string): string {
  if (!text) return ""
  return text.toLowerCase().split(/([.?!]\s)/).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("")
}

function raw(titles: { titleName: string; title: string }[]): SeoTitle[] {
  return titles.map((t) => ({
    ...t,
    title: t.title.replace(/\s+/g, " ").trim(),
    characterCount: t.title.replace(/\s+/g, " ").trim().length,
  }))
}

export function generateSeoTitles(values: SeoValues, filter?: string): GroupedTitles {
  const { clientName, clientLocation, solo, stateAbbreviated, reAbbreviated } = values
  const clientState = stateAbbreviated ? abbreviateState(values.clientState) : values.clientState
  const re = reAbbreviated ? "RE" : "Real Estate"
  const agent = solo ? "Agent" : "Agents"
  const expert = solo ? "Expert" : "Experts"
  const contact = solo ? "Let's Connect" : "Contact Us"

  const defs: { titleName: string; title: string }[] = [
    { titleName: "Homepage", title: `${clientName} | ${clientLocation} ${re} ${agent}` },
    { titleName: "Homepage", title: `Top ${clientLocation} ${re} ${agent} | ${clientName}` },
    { titleName: "Homepage", title: `${clientName} | Your ${clientLocation} ${re} ${expert}` },
    { titleName: "About", title: `${clientName} | ${re} ${agent} Serving ${clientLocation}` },
    { titleName: "About", title: `Meet ${clientName} - Your ${clientLocation} ${re} ${agent}` },
    { titleName: "Team", title: `${clientName} | ${clientLocation} ${re} Agents` },
    { titleName: "Team", title: `Meet the ${clientName} ${re} Group` },
    { titleName: "Team", title: `${clientName} - Premier ${clientLocation} ${re} Agents` },
    { titleName: "Portfolio", title: `${clientState} Homes for Sale & ${re} Listings | ${clientName}` },
    { titleName: "Portfolio", title: `${clientState} Homes & Property Listings | ${clientName}` },
    { titleName: "Portfolio", title: `Find ${clientState} ${re} Listings | ${clientName}` },
    { titleName: "Portfolio", title: `${clientState} Properties for Sale | ${clientName}` },
    { titleName: "Featured Properties", title: `Featured Properties for Sale in ${clientState} | ${clientName}` },
    { titleName: "Featured Properties", title: `Discover Properties for Sale in ${clientState} ${clientName}` },
    { titleName: "Featured Properties", title: `Explore Properties for Sale in ${clientState} | ${clientName}` },
    { titleName: "Past Transactions", title: `Recently Sold Properties in ${clientState} | ${clientName}` },
    { titleName: "Past Transactions", title: `${clientState} Homes Sold | Notable Transactions | ${clientName}` },
    { titleName: "Past Transactions", title: `Recently Sold Homes in ${clientState} by ${clientName}` },
    { titleName: "Home Valuation", title: `Free Home Valuation Tool - Instant ${clientState} Property Estimates | ${clientName}` },
    { titleName: "Home Valuation", title: `Free ${clientState} Home Valuation | ${clientName}` },
    { titleName: "Home Valuation", title: `Personalized ${clientState} Home Valuation | ${clientName}` },
    { titleName: "Neighborhoods", title: `Explore ${clientState} Neighborhoods - A Comprehensive Guide | ${clientName}` },
    { titleName: "Neighborhoods", title: `Explore ${clientState} Neighborhoods | ${clientName}` },
    { titleName: "Neighborhoods", title: `${clientState} Neighborhood Guides | ${clientName}` },
    { titleName: "Neighborhoods", title: `Find Your ${clientState} Dream Area | ${clientName}` },
    { titleName: "Neighborhoods", title: `Comprehensive Guide to ${clientState} Neighborhoods | ${clientName}` },
    { titleName: "Testimonials", title: `Client Testimonials & Success Stories | ${clientName}` },
    { titleName: "Testimonials", title: `Hear What Our Clients Say | ${clientName}` },
    { titleName: "Buyer's Guide", title: `Home Buyers Guide - Tips & Insights for ${clientState} | ${clientName}` },
    { titleName: "Buyer's Guide", title: `Complete Guide for ${clientState} Home Buyers | ${clientName}` },
    { titleName: "Buyer's Guide", title: `${clientState} Home Buyers Guide | ${clientName}` },
    { titleName: "Seller's Guide", title: `Sell Your Home in ${clientState} - Expert Advice | ${clientName}` },
    { titleName: "Seller's Guide", title: `Expert Advice for Selling in ${clientState} | ${clientName}` },
    { titleName: "Seller's Guide", title: `Sell Your Home in ${clientState} - Expert Tips | ${clientName}` },
    { titleName: "Mortgage Calculator", title: `Mortgage Calculator | ${clientName} ${re} ${agent}` },
    { titleName: "Blog", title: `${clientLocation} ${re} & Community Blog | ${clientName}` },
    { titleName: "Blog", title: `${clientLocation} ${re} Blog | ${clientName}` },
    { titleName: "Blog", title: `${clientLocation} ${re} Tips & More | ${clientName}` },
    { titleName: "Developments", title: `${clientState} Developments | ${clientName}` },
    { titleName: "Developments", title: `Latest Developments in ${clientState} | ${clientName}` },
    { titleName: "Developments", title: `New Property Developments in ${clientState} | ${clientName}` },
    { titleName: "Press & Media", title: `Press and Media | ${clientName}` },
    { titleName: "Vlog", title: `Vlog | ${clientName} ${re} ${agent}` },
    { titleName: "Vlog", title: `Featured Videos | ${clientName} ${re} ${agent}` },
    { titleName: "Vlog", title: `Property Videos | ${clientName} ${re} ${agent}` },
    { titleName: "Compass Concierge", title: `Compass Concierge | ${clientName} ${re} ${agent}` },
    { titleName: "Sotheby's Auction House", title: `Sotheby's Auction House | ${clientName} ${clientLocation} ${re} ${agent}` },
    { titleName: "About the Brand", title: `About the Brand | ${clientName} ${clientLocation} ${re} ${agent}` },
    { titleName: "Coldwell Banker Luxury", title: `Coldwell Banker Luxury | ${clientName} ${clientLocation} ${re} ${agent}` },
    { titleName: "Contact", title: `${contact} | ${clientName} ${re} ${agent}` },
    { titleName: "Contact", title: `Get in Touch | ${clientName} ${re} ${agent}` },
    { titleName: "Page Not Found", title: `404 Page Not Found | ${clientName} ${re} ${agent}` },
    { titleName: "Privacy Policy", title: `Privacy Policy | ${clientName} ${re} ${agent}` },
  ]

  let titles = raw(defs)

  if (filter) {
    const f = filter.toLowerCase()
    titles = titles.filter(
      (t) => t.titleName.toLowerCase().includes(f) || t.title.toLowerCase().includes(f)
    )
  }

  return titles.reduce<GroupedTitles>((acc, t) => {
    acc[t.titleName] ??= []
    acc[t.titleName].push(t)
    return acc
  }, {})
}
