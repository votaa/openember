// ─── Long Island Emergency Management Knowledge Base ─────────────────────────
// Covers: Nassau County, Suffolk County, Rockaway Peninsula (Queens/NYC)
// Jurisdiction hierarchy: County → Town/City → Village (where data available)
// Sources: Nassau OEM, Suffolk OEM, FEMA NFHL, USCG, USGS, NOAA, NYS DOH
// Last updated: 2025 (public sources)

export const LI_KB = {

  // ── GEOGRAPHIC OVERVIEW ──────────────────────────────────────────────────
  overview: {
    label: "Regional Overview",
    data: `LONG ISLAND EMERGENCY MANAGEMENT REGION
Population: ~2.9M (Nassau ~1.4M, Suffolk ~1.5M); Rockaway Peninsula ~130,000 (NYC/Queens jurisdiction)
Area: Nassau 287 sq mi, Suffolk 912 sq mi (largest NY county by land area)
Coastline: ~1,000 miles of shoreline including Great South Bay, Long Island Sound, Atlantic Ocean, Peconic Bay, Jamaica Bay
Key hazard geography: South Shore barrier islands (Fire Island, Jones Beach, Long Beach, Rockaway) — first to flood; North Shore bluffs; East End peninsulas (North Fork, South Fork)

JURISDICTIONAL STRUCTURE:
Nassau County: 2 cities (Long Beach, Glen Cove), 3 towns (Hempstead, North Hempstead, Oyster Bay), 64 villages
Suffolk County: 10 towns (Babylon, Brookhaven, East Hampton, Huntington, Islip, Riverhead, Shelter Island, Smithtown, Southampton, Southold), 33 villages, 2 cities (no incorporated cities — note Riverhead and Southampton are towns)
Rockaway Peninsula: Part of Queens, NYC jurisdiction — NYC OEM coordinates; Nassau OEM coordinates at Nassau border (Atlantic Beach Bridge)

MUTUAL AID:
Nassau-Suffolk Mutual Aid Compact active. NYS DHSES Region 1 covers Long Island. FEMA Region 2 (NY/NJ) — 26 Federal Plaza, Manhattan.`,
    source: "Nassau OEM / Suffolk OEM / US Census 2020"
  },

  // ── FLOOD ZONES ──────────────────────────────────────────────────────────
  floodZones: {
    label: "Flood Zones (FEMA)",
    data: `FEMA NFHL ZONES — LONG ISLAND:

Zone A (High-Risk, no BFE): Scattered inland areas; portions of Hempstead wetlands, southern Oyster Bay, bay-adjacent areas in Islip/Babylon towns.

Zone AE (Special Flood Hazard — with BFE): Primary zone for south shore communities.
  Nassau: Long Beach (entire city), Atlantic Beach, Lido Beach, Point Lookout, Island Park, Oceanside waterfront, Freeport waterfront, Baldwin Harbor, Merrick waterfront, Massapequa/Massapequa Park bay-front, Seaford, Wantagh waterfront.
  Suffolk (Babylon Town): Lindenhurst, Copiague, Amityville Harbor, North Amityville waterfront, West Babylon, Babylon Village, Bay Shore waterfront, Brightwaters, Islip waterfront.
  Suffolk (Islip Town): East Islip, Oakdale, West Sayville, Sayville, Bayport, Blue Point, Mastic Beach, Mastic, Shirley, Bellport.
  Suffolk (Brookhaven): Patchogue, East Patchogue, Blue Point, Mastic/Mastic Beach (western shore of Moriches Bay).
  Suffolk (Southampton/East Hampton): Westhampton Beach, Hampton Bays, Shinnecock Hills waterfront, Sag Harbor, East Hampton Village waterfront, Montauk harbor.
  North Shore AE zones: Cold Spring Harbor, Oyster Bay Cove, Lloyd Neck, Northport Harbor, Port Jefferson Harbor, Mt. Sinai Harbor.

Zone VE (Coastal High-Hazard — wave action):
  Atlantic Ocean-facing beaches: entire Atlantic shoreline of Fire Island (barrier island), Jones Beach Island, Long Beach ocean side, Rockaway Beach (Queens/NYC), Far Rockaway oceanfront.
  Montauk Point (extreme wave exposure), Ditch Plains, Hither Hills.
  North Shore: Crane Neck Point, Mt. Sinai oceanfront sections.

Zone X (Shaded — 0.2% annual chance / moderate risk): Inland Nassau and Suffolk; significant portions of Babylon, Islip, Smithtown, and Brookhaven towns north of Southern State Parkway.

Post-Sandy (2012): FEMA substantially revised LI flood maps. ~$5.5B in damage on Long Island. Nassau had ~$3B, Suffolk ~$2.5B. Long Beach, Lindenhurst, Mastic Beach, and Rockaway among most severely impacted.

STORM SURGE ZONES (NYS/County system — used for evacuation decisions, separate from FEMA insurance zones):
  Zone A: Barrier islands, immediate bay-front — evacuate for ANY hurricane or tropical storm.
  Zone B: Low-lying areas adjacent to Zone A — evacuate Cat 1+.
  Zone C: Moderate risk inland — evacuate Cat 2+.
  Zone D: Lower risk — evacuate Cat 3+.
  Approximately 220,000 LI residents (15%) in Zone A/B combined.`,
    source: "FEMA NFHL / Nassau OEM / Suffolk OEM / FEMA Sandy After-Action"
  },

  // ── EVACUATION ZONES & ROUTES ────────────────────────────────────────────
  evacZones: {
    label: "Evacuation Zones & Routes",
    data: `NASSAU COUNTY EVACUATION:
Alert system: NY-Alert + Nixle (text 'OneNassau' to 888777) + WEA
Zones: A (highest) through D. Zone A = barrier peninsula residents (Long Beach, Atlantic Beach, Lido Beach, Point Lookout, Island Park).
Key evacuation routes from south shore (Zone A/B):
  Long Beach/Island Park: North via Austin Blvd → Long Beach Rd → Sunrise Hwy → Nassau Community College shelter (Garden City)
  Atlantic Beach/Lawrence: East Rockaway Bridge north → Peninsula Blvd → Merrick Rd corridor
  Lido Beach/Point Lookout: Loop Pkwy north → Meadowbrook State Pkwy north
Primary receiving shelters: Nassau Community College (Garden City), Kellenberg Memorial HS (Uniondale), Carey HS (Franklin Square) — Red Cross managed
Special Medical Needs shelters: coordinated through Nassau University Medical Center (NUMC), East Meadow
Contraflow NOT routinely used in Nassau; Meadowbrook and Wantagh Pkwys designated primary southbound-to-northbound surge routes during evacuation

SUFFOLK COUNTY EVACUATION:
Alert system: SuffolkAlert (text 'SuffolkAlerts' to 67283) + Smart911 registry (631-852-4900) + NY-Alert + WEA + WALK 97.5 FM (primary EAS station)
Zones: A through D (same system as Nassau)
Zone A communities: Fire Island (ferry-dependent — see LIRR/Ferry section), Davis Park, Ocean Beach, Cherry Grove, Saltaire, Seaview, Fair Harbor, Kismet; Mastic Beach, Shirley, Westhampton Beach oceanside, Hampton Bays oceanside, Montauk peninsula tip
Key routes:
  Fire Island: no road access — ferry evacuation ONLY (Bay Shore, Sayville, Patchogue ferry terminals). MTA/Ferry operators coordinate with Suffolk OEM for storm evacuations.
  South shore mainland: Southern State Pkwy east/west (becomes Sunrise Hwy east of Heckscher); Route 27 (Sunrise Hwy) eastbound for East End evacuees; Route 25 north shore corridor.
  Peconic crossings: Route 25 (Main Rd) through Riverhead; Route 27 splits at Southampton for Montauk Hwy (south) vs Sunrise east.
Shelter interactive map: suffolkgis.maps.arcgis.com (Suffolk GIS shelter locator)

ROCKAWAY PENINSULA (NYC/Queens):
NYC OEM manages — see NYC KB for zone system (Zone 1 = mandatory evacuation)
Rockaways are NYC Evacuation Zone 1 (highest risk). Cross Bay Veterans Memorial Bridge and Marine Pkwy Bridge are primary egress.
Nassau OEM coordinates at Atlantic Beach bridge/border for residents crossing into Nassau.
NYC-Nassau border coordination point: Peninsula Blvd / Nassau-Queens county line.

LIRR ROLE IN EVACUATION:
LIRR operates 11 branches serving Long Island. In pre-landfall evacuation, MTA coordinates with Nassau/Suffolk OEM for enhanced outbound (eastward away from city or northward) service.
Sandy 2012 lesson: LIRR suspended service 36hrs pre-landfall; Long Beach Branch flooded (Wreck Lead Bridge, Reynolds Channel), requiring $120M post-Sandy hardening project completed 2018.
Fire Island ferry operators (Bay Shore Ferry, Sayville Ferry, Davison's) coordinate with Suffolk OEM; evacuation ferry runs scheduled when Zone A evacuation ordered.
Ferry routes: Bay Shore → Fire Island (Ocean Beach, Kismet, Saltaire, Fair Harbor); Sayville → Fire Island (Cherry Grove, Fire Island Pines, Sailors Haven); Patchogue → Watch Hill / Davis Park.`,
    source: "Nassau OEM / Suffolk OEM / MTA LIRR / NYS DHSES 2024"
  },

  // ── CRITICAL INFRASTRUCTURE ──────────────────────────────────────────────
  criticalInfrastructure: {
    label: "Critical Infrastructure",
    data: `HOSPITALS / TRAUMA CENTERS:
Nassau County:
  NYU Langone Hospital — Long Island (Mineola): Nassau's ONLY Level 1 Adult & Pediatric Trauma Center (ACS verified). Primary trauma receiving facility for Nassau. 259 Davids Ave, Mineola.
  Nassau University Medical Center (NUMC) (East Meadow): Public hospital, major ER, Special Medical Needs Shelter coordination hub. 2201 Hempstead Turnpike.
  South Nassau Communities Hospital (Oceanside): 1 Health Road — community Level 3 trauma; south shore receiving.
  St. Francis Hospital (Flower Hill/Roslyn): Cardiac specialty; not trauma designated.
  Long Beach Medical Center: Small community hospital; NOT a trauma center; critical gap for barrier island residents.
Suffolk County:
  Stony Brook University Medical Center (Stony Brook): Suffolk's ONLY Level 1 Trauma Center for BOTH adults AND children. Regional referral hub. East Loop Rd, Stony Brook.
  Good Samaritan University Hospital (West Islip): Level 1 Adult Trauma (ACS verified as of 2023). Only Level 1 on south shore of Long Island. 1000 Montauk Hwy.
  NYU Langone Hospital — Suffolk (East Patchogue): Level 2 Adult Trauma (elevated from Level 3, Oct 2024; ACS verified 2025). 101 Hospital Rd, East Patchogue.
  Northwell Huntington Hospital (Huntington): Level 2 Trauma. 270 Park Ave.
  Southampton Hospital (Southampton): Level 3 Trauma; primary East End receiving. 240 Meeting House Lane.
  Peconic Bay Medical Center (Riverhead): Level 3 Trauma; North Fork/wine country area. 1300 Roanoke Ave.

POWER:
PSEG Long Island (operating agent for LIPA): Primary electric utility for all of Nassau and Suffolk. Sandy caused 90%+ outages (~1.1M customers) — longest restoration in LI history (3+ weeks for some).
Key vulnerable infrastructure: transmission lines crossing Great South Bay; underground feeders in Long Beach and south shore barrier communities; substations at Oceanside, Bay Shore, Patchogue.
PSEG Restoration Centers activated at major outages: Bethpage, Hicksville, Hauppauge main offices serve as staging.
National Grid: Gas utility for Long Island (separate from electric). Sandy shut down gas service to ~28,000 customers in flooded areas; restoration took months in Lindenhurst, Long Beach.
Backup power: Nassau and Suffolk OEM maintain generator caches. LIPA/PSEG mutual aid compacts with utilities from 28 states.

WATER / SEWAGE:
Nassau: Nassau County Department of Public Works manages water and sewer. Multiple water districts (Hempstead, Great Neck, Roslyn, etc). Bay Park Sewage Treatment Plant (East Rockaway) — serves ~800,000 — critically flooded in Sandy; $900M+ resiliency project (tunnels under Jamaica Bay to NYC plant) completed 2023.
Suffolk: No countywide water/sewer — patchwork of water districts and septic systems. Suffolk County Water Authority (SCWA) serves ~1.2M. Sandy caused widespread pump station failures.

TRANSPORTATION INFRASTRUCTURE:
LIRR: 11 branches, ~700 miles of track on LI, ~300,000 daily riders. Jamaica (Queens) is the key hub. Vulnerable branches: Long Beach, Far Rockaway (both Zone A/AE).
Bridges (critical chokepoints): Wantagh State Pkwy (Jones Beach causeway), Meadowbrook State Pkwy (Jones Beach), Loop Pkwy (Lido Beach), Long Beach Bridge (Reynolds Channel), Atlantic Beach Bridge, Marine Pkwy Bridge (Gateway to Rockaway), Cross Bay Veterans Memorial Bridge (Howard Beach/Rockaway).
Airports: MacArthur Airport (Islip, KISP) — backup to JFK/LGA. Non-hub commercial; used for emergency air ops and med-evac staging. Republic Airport (Farmingdale, KFRG) — general aviation, medevac, law enforcement, fire aviation. Hampton Airport (East Hampton, KHTO) — seasonal, East End.
LIRR Long Beach Branch: Most flood-vulnerable rail line on LI. Wreck Lead Bridge (Reynolds Channel) hardened post-Sandy but still exposed. Sandy caused $120M in damage to this branch alone.

COMMUNICATIONS:
NY-Alert: Primary statewide emergency notification (dhses.ny.gov/ny-alert)
Nassau: Nixle (OneNassau to 888777); @NassauEM social media
Suffolk: SuffolkAlert (67283); Smart911 registry
EAS/Radio: WALK 97.5 FM (Suffolk primary EAS); WBAB 102.3 FM (South Shore); News 88.7 / WCBS 880 AM (regional).
NOAA Weather Radio: KEC83 (Brookhaven transmitter, covers eastern LI/Peconic Bay); KHB35 (covers Nassau/western Suffolk).
Nassau EOC: 510 Grumman Road West, Bethpage, NY 11714. Phone: 516-573-9600.
Suffolk EOC: 30 Yaphank Ave, Yaphank, NY 11980 (NYS DHSES regional). Suffolk OEM: 631-852-4900.

COAST GUARD (Sector Long Island Sound):
  USCG Station Fire Island: 1 Rescue Rd, Babylon, NY 11702 | 631-661-9101
  USCG Station Jones Beach: 1 West End Boat Basin, Freeport, NY 11520 | 516-785-2995 [NOTE: reduced to limited ops 2024 due to budget/staffing — restoration pending FY27 funding]
  USCG Station Eatons Neck: 12 Lighthouse Rd, Northport, NY 11768 | 631-261-6959 [North Shore / Long Island Sound]
  USCG Station Shinnecock: 100 Foster Ave, Hampton Bays, NY 11946 | 631-728-0078 [absorbs Moriches ops]
  USCG Sector Field Office Moriches: 100 Moriches Island Rd, East Moriches, NY 11940 | 631-395-4400
  USCG Station Montauk: 69 Star Island Rd, Montauk, NY 11954 | 631-668-2773
  Marine Safety Detachment Coram: 2045-2 Route 112, Coram, NY 11727 | 631-732-0190
  USCG Sector HQ Long Island Sound: New Haven, CT (oversight of all LI stations)`,
    source: "Nassau OEM / Suffolk OEM / NYS DOH Trauma Registry 2024 / PSEG / USCG Sector LIS"
  },

  // ── HAZARD PROFILES ──────────────────────────────────────────────────────
  hazardProfiles: {
    label: "Hazard Profiles",
    data: `HURRICANES / TROPICAL STORMS:
Season June–Nov. Long Island is in the primary northeast hurricane track corridor.
Historical impacts: 1938 "Long Island Express" (Cat 3 at landfall, ~600 LI deaths); 1985 Gloria; 1999 Floyd; 2011 Irene; 2012 Sandy (Cat 1 at landfall — $5.5B LI damage, 13 LI deaths, ~1.1M without power).
Primary risk: Storm surge (not wind). Sandy produced 11–14 ft surge at Battery Park; LI south shore surge 6–10+ ft.
Barrier island risk: Fire Island, Jones Beach Island, Long Beach, Rockaway — complete overwash possible in Cat 2+.
LIRR vulnerability: Long Beach Branch suspended pre-Sandy; Reynolds Channel crossing key choke point.
Post-Sandy improvements: Bay Park STP tunnel completed 2023; LIRR Long Beach Branch hardened; PSEG/LIPA mutual aid expanded; Nassau OEM new Bethpage EOC operational.
15 tropical systems have directly impacted NY State since 2012; frequency doubled over last 6 years (NYS DHSES 2024).

COASTAL / STORM SURGE FLOODING:
South shore barrier beaches flood first and most severely. Fire Island barrier island is a primary surge buffer but also first casualty.
Active live water-level stations: Kings Point (8516945) on Long Island Sound and Montauk (8510560) on eastern Long Island. Battery Park (8518750) and Sandy Hook (8531680) are regional references. Fire Island (8515186) and Bay Shore (8515102) are retired as live-water-level endpoints.
Great South Bay: Shallow bay (avg 4 ft depth) — surge can raise bay levels rapidly; combined ocean surge + bay flooding traps south shore mainland communities.
Moriches Bay and Shinnecock Bay: Similar dynamics on eastern south shore; Westhampton and Hampton Bays highly exposed.
Peconic Estuary: Lower surge risk than south shore but storm wave fetch from Long Island Sound can cause significant North Fork flooding.

EXTREME HEAT:
Nassau and Suffolk have fewer cooling centers per capita than NYC. Majority of LI population relies on private A/C without backup.
NYCHA-equivalent vulnerability: affordable/senior housing in Hempstead, Brentwood, Central Islip have reduced cooling access.
Nassau heat protocol: Cooling centers coordinated through Nassau Dept. of Social Services; activated at Heat Index ≥ 95°F.
Suffolk heat protocol: Town-level coordination; no countywide cooling center database — varies by town.
Ida 2021: Flash flooding from remnants killed 2 on LI (basement apartment deaths, similar to NYC).

WINTER STORMS / NOR'EASTERS:
Primary winter hazard. Nor'easters can produce 12–30+ inches of snow. Jonas 2016: 25+ inches in parts of Suffolk.
LIRR vulnerable to snow/ice accumulation on third rail; repeated service suspensions during major events.
Nassau: Highway Dept manages ~1,400 lane miles of roads; priority routes include barrier island causeways (pre-storm prep including potential closure).
Suffolk: Highway Dept covers 10 towns; Route 27 (Montauk Hwy) and Route 25 are primary arterials for eastern Suffolk — single-road dependency for many East End communities.

HAZMAT / INDUSTRIAL:
Brookhaven National Laboratory (Upton, Suffolk): DOE facility; radiological materials on site; Emergency Response Plan maintained with Suffolk OEM and NYS.
Republic Airport fuel farm (Farmingdale): major aviation fuel storage.
Various CERCLA/Superfund sites in Nassau (Bethpage community water supply contamination — Grumman plume — active remediation ongoing as of 2025).
Bethpage Plume: Groundwater contamination from former Grumman/Northrop facility; drinking water concern for portions of Nassau; PSEG Nassau OEM coordinate on monitoring.

TERRORISM / SECURITY:
Jones Beach, Fire Island National Seashore, Plum Island (DHS Animal Disease Center, Southold) are federal facilities with elevated security considerations.
NYPD jurisdiction ends at Queens/Nassau border; Nassau PD and Suffolk PD coordinate with JTTF.
Major event venues: Nassau Coliseum (Uniondale), UBS Arena (Elmont) — mass gathering protocols maintained.

PANDEMICS:
COVID-19 (2020): Nassau and Suffolk among highest per-capita early death rates in US. Nassau: ~8,000 deaths; Suffolk: ~6,000 deaths through 2021. NYU Langone LI and NUMC activated surge capacity.`,
    source: "Nassau OEM / Suffolk OEM / NYS DHSES Hazard Mitigation Plan / NOAA / NWS OKX"
  },

  // ── TOWN-LEVEL DETAIL: NASSAU ────────────────────────────────────────────
  nassauTowns: {
    label: "Nassau County — Town & City Detail",
    data: `NASSAU COUNTY TOWNS & CITIES (3 Towns, 2 Cities, 64 Villages):

TOWN OF HEMPSTEAD (largest town in US by population, ~800,000):
  Key emergency contacts: (516) 489-5000
  High-risk areas: Long Beach (City — separate jurisdiction), Atlantic Beach, Lido Beach, Point Lookout, Island Park (all Zone A barrier communities); Oceanside, Baldwin, Freeport south waterfront (Zone AE)
  EOC: Hempstead Town Hall, 1 Washington St, Hempstead
  Primary shelter: Kellenberg Memorial HS, Uniondale; Carey HS, Franklin Square
  Key hazard: Long Beach City (separate jurisdiction, ~35,000 pop) — entirely on barrier island, fully Zone AE/VE. Long Beach Medical Center is only hospital — NOT a trauma center.
  Long Beach City OEM: 1 West Chester St, Long Beach | (516) 431-1000

TOWN OF NORTH HEMPSTEAD (~250,000):
  Key emergency contacts: (516) 869-6311
  Risk profile: North Shore community; moderate flood risk in harbor areas (Port Washington, Great Neck, Roslyn harbors — Zone AE at waterfront). Lower direct hurricane surge risk than south shore but significant Nor'easter flooding risk.
  Key infrastructure: Port Washington LIRR branch terminus; Roslyn viaduct (flooding risk).

TOWN OF OYSTER BAY (~300,000):
  Key emergency contacts: (516) 624-6332
  Risk profile: Straddles north and south shores. South shore areas (Massapequa, Seaford, Wantagh, Bethpage south) in Zone AE. Jones Beach Island within town jurisdiction (beach operations).
  Nassau OEM HQ: Bethpage (510 Grumman Rd W — in this town).

CITY OF LONG BEACH: See Town of Hempstead above.

CITY OF GLEN COVE (~27,000, North Shore):
  Lower flood risk; harbor-front Zone AE only.
  Glen Cove EMS: (516) 676-1160

NASSAU COUNTY EMERGENCY SERVICES:
Nassau County Police: 516-573-8800 (non-emergency)
Nassau University Medical Center (NUMC): 516-572-3000 — designated Special Medical Needs shelter coordination
Nassau Dept. of Social Services: 516-227-8519 — cooling centers, disaster social services
Nassau OEM: 510 Grumman Rd W, Bethpage | 516-573-9600 | nassaucountyny.gov/oem`,
    source: "Nassau County Government / Nassau OEM"
  },

  // ── TOWN-LEVEL DETAIL: SUFFOLK ───────────────────────────────────────────
  suffolkTowns: {
    label: "Suffolk County — Town Detail",
    data: `SUFFOLK COUNTY TOWNS (10 Towns, population ~1.5M):

TOWN OF BABYLON (~215,000):
  OEM: (631) 422-7640 | Town Hall, 200 E Sunrise Hwy, Lindenhurst
  Risk: High — entire south shore border with Great South Bay. Lindenhurst, Copiague, Amityville, West Babylon waterfront all Zone AE. Gilgo Beach / Oak Beach — barrier island, Zone VE.
  Key shelter: Babylon Town Hall area; Robert Moses Causeway is primary south-to-north evacuation route (closes during severe events).

TOWN OF BROOKHAVEN (~500,000, largest in NYS by area):
  OEM: 631-451-6940 | 1 Independence Hill, Farmingville
  Risk: Extensive south shore exposure. Mastic Beach, Shirley, Bellport, East Patchogue — Zone AE. Smith Point County Park barrier beach — Zone VE.
  Key: Brookhaven National Laboratory (DOE) at Upton — radiological coordination with Suffolk OEM.
  Smith Point Bridge: only vehicle access to barrier island section; closure protocol critical.

TOWN OF ISLIP (~335,000):
  OEM: 631-224-5730 | Town Hall West, 401 Main St, Islip
  Risk: Bay Shore, East Islip, Oakdale, West Sayville, Sayville, Bayport waterfront — Zone AE. Fire Island — Zone VE, ferry-only access.
  Fire Island ferry terminals: Bay Shore (primary), Kismet and Saltaire via Bay Shore. Suffolk OEM and ferry operators coordinate evacuation runs.
  Key shelter: Bay Shore HS, Islip HS area.

TOWN OF HUNTINGTON (~200,000, North Shore):
  OEM: 631-351-3202 | 100 Main St, Huntington
  Risk: Northport Harbor, Cold Spring Harbor, Asharoken (barrier beach — Zone AE). Generally lower surge risk than south shore but Long Island Sound nor'easter flooding significant.
  Northwell Huntington Hospital: Level 2 Trauma — key north shore receiving facility.

TOWN OF SMITHTOWN (~120,000, North Shore):
  OEM / Public Safety: 631-360-7601
  Risk: Stony Brook Harbor, Nissequogue River flooding; Long Island Sound coastal exposure at Sunken Meadow State Park.

TOWN OF RIVERHEAD (~35,000, East End hub):
  OEM: 631-727-3200
  Risk: Peconic River flooding; Flanders Bay and Great Peconic Bay exposure. Riverhead is the geographic center and transportation hub of eastern Suffolk.
  Peconic Bay Medical Center (Level 3 Trauma) is critical East End facility.

TOWN OF SOUTHAMPTON (~60,000, south fork):
  OEM: 631-702-2100 | 116 Hampton Rd, Southampton
  Risk: Westhampton Beach barrier beach (Zone VE/AE), Hampton Bays bay-front (Shinnecock Bay, Zone AE), Shinnecock Inlet, Mecox Bay. Southampton Village waterfront Zone AE.
  Southampton Hospital (Level 3 Trauma): 240 Meeting House Lane — critical East End receiving. Nearest Level 1: Stony Brook (45+ mi).
  Evacuation: Route 27 (Montauk Hwy) is the ONLY coastal route for Hampton Bays → Southampton → East Hampton; contraflow protocols NOT currently in place but studied.

TOWN OF EAST HAMPTON (~22,000, south fork tip):
  OEM: 631-324-0800 | 300 Pantigo Place, East Hampton
  Risk: Montauk is a peninsula — three-sided water exposure (Block Island Sound, Atlantic, Fort Pond Bay). Montauk Point: FEMA Zone VE. Springs, Three Mile Harbor: Zone AE.
  Montauk single-road dependency: Montauk Hwy (Route 27) is the ONLY land evacuation route for ~4,000 year-round residents + summer population (100,000+). Pre-season evacuation planning critical.

TOWN OF SOUTHOLD (~21,000, North Fork):
  OEM: 631-765-1892 | 53095 Route 25, Southold
  Risk: Long Island Sound north shore exposure; Peconic Estuary south exposure. Orient Point (ferry to New London CT) is alternative evacuation route via sea.
  North Fork wine country; Shelter Island ferry crossings.

TOWN OF SHELTER ISLAND (~3,000, island):
  OEM: 631-749-0291
  Risk: Entirely surrounded by water (Shelter Island Sound, Peconic Bay). Ferry-only access (North Ferry: Greenport; South Ferry: North Haven/Sag Harbor). Evacuation requires ferry coordination with South Fork (Southampton) and North Fork (Southold) OEM.
  No hospital; EMS dependent on ferry crossing + transport to Southampton Hospital.

SUFFOLK COUNTY EMERGENCY SERVICES:
Suffolk OEM (County): 631-852-4900 | 30 Yaphank Ave, Yaphank, NY 11980
Suffolk County PD: 631-852-6000 (non-emergency)
Suffolk County Dept. Health: 631-853-3000
SuffolkAlert: 67283 | Smart911 registry: 631-852-4900
EAS Radio: WALK 97.5 FM (primary), WBAB 102.3, WBLI 106.1`,
    source: "Suffolk OEM / Town OEM websites / NYS DOH 2024"
  },

  // ── ROCKAWAY PENINSULA (QUEENS/NYC) ──────────────────────────────────────
  rockaway: {
    label: "Rockaway Peninsula — Queens/NYC (Operationally Relevant)",
    data: `JURISDICTION: NYC / Queens — NYC OEM primary. Nassau OEM coordinates at Nassau-Queens border.
Population: ~130,000 year-round (Rockaway Beach, Far Rockaway, Arverne, Edgemere, Breezy Point, Belle Harbor, Neponsit)
Geography: 11-mile barrier peninsula; Atlantic Ocean south, Jamaica Bay north. One of the most flood-vulnerable communities in NYC.

FEMA ZONES:
Zone A/AE: Entire Jamaica Bay-facing north shore of peninsula.
Zone VE: Ocean-facing southern shoreline — Breezy Point tip (most exposed), Belle Harbor, Neponsit, Rockaway Beach, Arverne, Edgemere.
Sandy (2012): 11 deaths in Rockaways; Breezy Point fire burned 126 homes during storm (firefighting impossible due to surge). Massive destruction across entire peninsula.

NYC EVACUATION ZONES: Zone 1 (highest risk) — mandatory evacuation for Cat 1+. All of Breezy Point, Belle Harbor, Neponsit, oceanside Rockaway Beach.
Egress routes: Cross Bay Veterans Memorial Bridge (Howard Beach/Jamaica) and Marine Pkwy Bridge (Floyd Bennett Field/Brooklyn) — BOTH bridges can close in extreme surge. Nassau residents: Atlantic Beach Bridge connects Far Rockaway to Atlantic Beach (Nassau Zone A).

KEY INFRASTRUCTURE:
A/S train subway service into Rockaways — vulnerable to surge in Howard Beach area; Sandy caused extensive subway damage in this corridor.
NYC Health + Hospitals / Queens Hospital Center (Jamaica): Primary trauma for Rockaway residents (not on peninsula itself — Jamaica, Queens).
Peninsula Hospital Center (Far Rockaway): Closed 2012; currently no hospital on Rockaway Peninsula itself — critical gap.
FDNY Marine 9: Marine unit based at Rockaway; critical for water rescue operations.
NYPD: 100th Precinct (Rockaway Beach) and 101st Precinct (Far Rockaway)

NASSAU-QUEENS BORDER COORDINATION:
Nassau OEM and NYC OEM maintain coordination protocols at the Nassau county line (Atlantic Beach / Far Rockaway interface).
Atlantic Beach Bridge: Nassau-operated bridge; can be closed for emergency management; pedestrian and vehicle contraflow protocols.
Far Rockaway residents evacuating via Nassau must coordinate with Nassau OEM; Nassau shelters (Kellenberg, Carey HS) are available to NYC Zone 1 evacuees by established agreement.

POST-SANDY IMPROVEMENTS:
NYC Build It Back program: Elevations, buyouts, shoreline restoration in Breezy Point and Edgemere.
A-train resiliency hardening: MTA invested $700M+ in Far Rockaway/Rockaway A-train after Sandy.
NYC Fire: Breezy Point volunteer fire department received federal grants for equipment post-Sandy.`,
    source: "NYC OEM / FEMA Sandy FOIA / NYC Build It Back / MTA"
  },

  // ── RESOURCES & CONTACTS ─────────────────────────────────────────────────
  resources: {
    label: "Contacts & Resources",
    data: `COUNTY / REGIONAL EMERGENCY MANAGEMENT:
Nassau County OEM: 516-573-9600 | 510 Grumman Rd W, Bethpage, NY 11714 | nassaucountyny.gov/oem
Suffolk County OEM: 631-852-4900 | 30 Yaphank Ave, Yaphank, NY 11980 | scoem.suffolkcountyny.gov
NYC OEM (Queens/Rockaway): 718-422-8700 | nyc.gov/oem
NYS DHSES Region 1 (LI): 631-952-6599 | 30 Yaphank Ave, Yaphank (co-located w/ Suffolk OEM)
FEMA Region 2: 212-680-3600 | 26 Federal Plaza, Manhattan

POLICE:
Nassau County PD: 516-573-8800 (non-emergency) | Emergency: 911
Suffolk County PD: 631-852-6000 (non-emergency) | Emergency: 911
NYPD 100th Pct (Rockaway Beach): 718-318-4200
NYPD 101st Pct (Far Rockaway): 718-868-3400

FIRE / EMS:
Nassau County Fire Marshal: 516-573-9901
Suffolk Fire, Rescue & Emergency Services: 631-852-4800
FDNY (Rockaways): 718-318-4200 (via 911 for emergencies)

HOSPITALS (key numbers):
NYU Langone LI (Mineola — Level 1 Trauma): 516-663-0333
Nassau University Medical Center (East Meadow): 516-572-3000
Stony Brook University Medical Center (Level 1 Trauma): 631-444-4000
Good Samaritan Hospital (West Islip — Level 1 Adult Trauma): 631-376-3000
NYU Langone Suffolk (E. Patchogue — Level 2 Trauma): 631-654-7100
Northwell Huntington Hospital (Level 2 Trauma): 631-351-2000
Southampton Hospital (Level 3 Trauma): 631-726-8200
Peconic Bay Medical Center (Level 3 Trauma): 631-548-6000

UTILITIES:
PSEG Long Island (electric outages): 1-800-490-0075 | pseg.com/longisland
National Grid (gas, Nassau): 1-800-930-5003
Suffolk County Water Authority: 1-800-287-2777

TRANSPORTATION:
MTA LIRR (service status): 511 | mta.info/lirr
Fire Island Ferries (Bay Shore): 631-665-3600
Sayville Ferry: 631-589-0810
Davison's Ferry (Patchogue): 631-475-1665
Orient Point → New London CT Ferry (Cross Sound): 631-323-2525

WEATHER / ALERTS:
NWS New York (OKX — Upton NY): weather.gov/okx | 631-924-0517
NOAA Weather Radio: KEC83 (Brookhaven), KHB35 (Nassau/W. Suffolk)
NY-Alert (statewide): dhses.ny.gov/ny-alert
Nassau Nixle: text 'OneNassau' to 888777
SuffolkAlert: text 'SuffolkAlerts' to 67283

COAST GUARD EMERGENCY (maritime): VHF Channel 16 | 1-800-418-7314

FEMA / INSURANCE:
FEMA Helpline: 1-800-621-3362 | disasterassistance.gov
NFIP (Flood Insurance): 1-800-638-6620
Suffolk Flood Zone questions: 631-422-7645 (Environmental Control)

311: Nassau — 516-571-4811; Suffolk — 631-853-4500 (or 311); NYC (Rockaway) — 311`,
    source: "Nassau OEM / Suffolk OEM / NYC OEM / USCG / PSEG / MTA"
  }
}

// ─── Live API Endpoints ────────────────────────────────────────────────────────
export const LIVE_ENDPOINTS = [
  // Weather (same NWS OKX office covers all of Long Island)
  { name: "NWS Alerts — NY",          url: "https://api.weather.gov/alerts/active?area=NY",                                                                           type: "weather"  },
  { name: "NWS Forecast — Nassau/LI", url: "https://api.weather.gov/gridpoints/OKX/33,37/forecast",                                                                   type: "forecast" },
  { name: "NWS Forecast — E. Suffolk",url: "https://api.weather.gov/gridpoints/OKX/55,30/forecast",                                                                   type: "forecast" },

  // USGS Stream / Tidal Gauges — Long Island Specific
  // South Shore (NOAA tidal)
  { name: "NOAA — Kings Point (LI Sound)",      url: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=8516945&product=water_level&datum=MLLW&time_zone=LST/LDT&units=english&format=json&range=24", type: "flood" },
  { name: "NOAA — Montauk",                     url: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=8510560&product=water_level&datum=MLLW&time_zone=LST/LDT&units=english&format=json&range=24", type: "flood" },
  { name: "NOAA — Battery Park (NYC surge ref)",url: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=8518750&product=water_level&datum=MLLW&time_zone=LST/LDT&units=english&format=json&range=24", type: "flood" },
  { name: "NOAA — Sandy Hook (outer-harbor ref)",url: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=8531680&product=water_level&datum=MLLW&time_zone=LST/LDT&units=english&format=json&range=24", type: "flood" },

  // USGS Surface Water — LI streams (from NYC nyc.js — retain relevant ones)
  { name: "USGS — Massapequa Creek",  url: "https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items?monitoring_location_id=USGS-01309500&parameter_code=00065&limit=24", type: "flood" },
  { name: "USGS — Peconic River",     url: "https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items?monitoring_location_id=USGS-01304500&parameter_code=00065&limit=24", type: "flood" },

  // FEMA Disasters
  { name: "FEMA Disasters — NY",      url: "https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries?state=NY&$top=10&$orderby=declarationDate%20desc",         type: "fema"     },

  // NYC 311 (for Rockaway / Queens data)
  { name: "NYC 311 — Rockaway / Queens CB14", url: "https://data.cityofnewyork.us/resource/erm2-nwe9.json?$limit=50&$order=created_date%20DESC&$where=borough%3D%27QUEENS%27%20AND%20community_board%3D%2714%20QUEENS%27%20AND%20latitude%20IS%20NOT%20NULL%20AND%20longitude%20IS%20NOT%20NULL", type: "civic" },
]

// ─── Map Layer Data ────────────────────────────────────────────────────────────
export const MAP_LAYERS = {
  hospitals: {
  label: "Trauma Centers & Key Hospitals",
  color: "#f87171",
  icon: "🏥",
  features: [
    // ── Nassau — Level 1 ───────────────────────────────────────────────
    { name: "North Shore University Hospital",
      lat: 40.7765, lng: -73.6993, county: "Nassau",
      trauma_level: "Level 1", helipad: true, faa_helipad_id: "7NY3/6NK3",
      note: "Level 1 Adult & Pediatric | ACS-verified | NYS DOH Regional L1 | 300 Community Dr, Manhasset | 516-562-0100" },
    { name: "Nassau University Medical Center",
      lat: 40.7226, lng: -73.5512, county: "Nassau",
      trauma_level: "Level 1", helipad: true, faa_helipad_id: "0NK4",
      note: "Level 1 Adult | NYS DOH designated | Special Medical Needs Shelter hub | 2201 Hempstead Tpke, East Meadow | 516-572-3000" },
    { name: "NYU Langone Hospital — Long Island",
      lat: 40.7430, lng: -73.6410, county: "Nassau",
      trauma_level: "Level 1", helipad: false,
      note: "Level 1 Adult | ACS-verified | 259 1st St, Mineola | 516-663-0333" },
    // ── Nassau — Level 2 ───────────────────────────────────────────────
    { name: "Mount Sinai South Nassau Hospital",
      lat: 40.6472, lng: -73.6358, county: "Nassau",
      trauma_level: "Level 2", helipad: false,
      note: "Level 2 Adult | ACS-verified | formerly South Nassau Communities Hospital | 1 Health Rd, Oceanside | 516-632-3000" },
    // ── Suffolk — Level 1 ──────────────────────────────────────────────
    { name: "Stony Brook University Hospital",
      lat: 40.9103, lng: -73.1163, county: "Suffolk",
      trauma_level: "Level 1", helipad: true, faa_helipad_id: "6NY6",
      note: "Level 1 Adult & Pediatric | ACS-verified | NYS DOH Regional L1 | 101 Nicolls Rd, Stony Brook | 631-444-4000" },
    { name: "South Shore University Hospital",
      lat: 40.7258, lng: -73.2393, county: "Suffolk",
      trauma_level: "Level 1", helipad: true,
      note: "Level 1 Adult | ACS-verified Aug 2024 | NYS DOH state designation pending | 301 E Main St, Bay Shore | 631-968-3000" },
    { name: "Good Samaritan University Hospital",
      lat: 40.6932, lng: -73.3040, county: "Suffolk",
      trauma_level: "Level 1", helipad: false,
      note: "Level 1 Adult / Level 2 Pediatric | ACS-verified | 1000 Montauk Hwy, West Islip | 631-376-3000" },
    // ── Suffolk — Level 2 ──────────────────────────────────────────────
    { name: "NYU Langone Hospital — Suffolk",
      lat: 40.7726, lng: -72.9772, county: "Suffolk",
      trauma_level: "Level 2", helipad: false,
      note: "Level 2 Adult | NYS DOH Oct 2024 | ACS-verified Jul 2025 | 101 Hospital Rd, East Patchogue | 631-654-7100" },
    { name: "Northwell Huntington Hospital",
      lat: 40.8762, lng: -73.4274, county: "Suffolk",
      trauma_level: "Level 2", helipad: false,
      note: "Level 2 Trauma | North Shore receiving | 270 Park Ave, Huntington | 631-351-2000" },
    // ── Suffolk — Level 3 / East End ───────────────────────────────────
    { name: "Southampton Hospital",
      lat: 40.8837, lng: -72.3849, county: "Suffolk",
      trauma_level: "Level 3", helipad: false,
      note: "Level 3 Trauma | Primary East End receiving | nearest L1 is Stony Brook 45+ mi | 240 Meeting House Lane | 631-726-8200" },
    { name: "Peconic Bay Medical Center",
      lat: 40.9137, lng: -72.6551, county: "Suffolk",
      trauma_level: "Level 3", helipad: false,
      note: "Level 3 Trauma | North Fork / East End hub | 1300 Roanoke Ave, Riverhead | 631-548-6000" },
    // ── Queens / Rockaway ──────────────────────────────────────────────
    { name: "NYC H+H Queens Hospital Center",
      lat: 40.7007, lng: -73.7949, county: "Queens",
      trauma_level: "Level 1", helipad: false,
      note: "Level 1 Trauma (NYC) | Primary receiving for Rockaway residents | 82-68 164th St, Jamaica | 718-883-3000" },
  ]
},

  shelters: {
    label: "Evacuation Shelters / Centers",
    color: "#60a5fa",
    icon: "🏫",
    features: [
      // Nassau
      { name: "Nassau Community College (Red Cross ARC Hub)", lat: 40.7285, lng: -73.5942, county: "Nassau", note: "Primary Nassau Red Cross hub | Zone A/B receiving | Garden City" },
      { name: "Kellenberg Memorial HS",                       lat: 40.7093, lng: -73.5977, county: "Nassau", note: "Hurricane Evacuation Center | Zone 1/A | Uniondale" },
      { name: "Carey HS (Franklin Square)",                   lat: 40.7040, lng: -73.6752, county: "Nassau", note: "Hurricane Evacuation Center | Franklin Square" },
      // Suffolk
      { name: "Sachem HS North (Lake Ronkonkoma)",            lat: 40.8359, lng: -73.1221, county: "Suffolk", note: "Major evacuation center | central Suffolk hub | Ronkonkoma" },
      { name: "Brentwood HS",                                 lat: 40.7776, lng: -73.2460, county: "Suffolk", note: "Evacuation Center | central Suffolk | Brentwood" },
      { name: "Connetquot HS (Bohemia)",                      lat: 40.7674, lng: -73.1270, county: "Suffolk", note: "Evacuation Center | south shore Zone B receiving | Bohemia" },
      { name: "William Floyd HS (Mastic Beach)",              lat: 40.7795, lng: -72.8476, county: "Suffolk", note: "Evacuation Center | Mastic/Shirley south shore | Mastic Beach" },
      { name: "Hampton Bays HS",                              lat: 40.8699, lng: -72.5148, county: "Suffolk", note: "East End evacuation center | Hampton Bays" },
      { name: "Eastport-South Manor HS",                      lat: 40.8321, lng: -72.7319, county: "Suffolk", note: "Evacuation Center | eastern Suffolk inland" },
      // Special Needs
      { name: "NUMC Special Medical Needs Shelter",           lat: 40.7295, lng: -73.5576, county: "Nassau",  note: "Special Medical Needs Shelter | Nassau University Medical Center, East Meadow" },
    ]
  },

  gauges: {
    label: "Tidal Gauges & Stream Monitors",
    color: "#4ade80",
    icon: "🌊",
    features: [
      // Retained from NYC nyc.js (relevant to LI)
      { name: "Battery Park Tidal Gauge",          lat: 40.7003, lng: -74.0141, note: "NOAA 8518750 — primary NYC/regional surge reference gauge" },
      { name: "Kings Point Tidal Gauge",            lat: 40.8105, lng: -73.7659, note: "NOAA 8516945 — Long Island Sound; north shore surge indicator" },
      // LI-specific NOAA gauges and regional references
      { name: "Montauk Tidal Gauge",                lat: 41.0483, lng: -71.9594, note: "NOAA 8510560 — active eastern Long Island water-level station" },
      { name: "Sandy Hook Tidal Gauge (ref)",       lat: 40.4669, lng: -74.0094, note: "NOAA 8531680 — active outer-harbor reference station" },
      // Phase 1-selected USGS gauge-height stations
      { name: "Massapequa Creek at Massapequa",   lat: 40.6890, lng: -73.4554, note: "USGS 01309500 — selected Nassau gauge-height station" },
      { name: "Peconic River at Riverhead",        lat: 40.9137, lng: -72.6869, note: "USGS 01304500 — selected Suffolk gauge-height station" },
    ]
  },

  eoc: {
    label: "EOC / Command Posts / Coordination",
    color: "#facc15",
    icon: "⚡",
    features: [
      { name: "Nassau County EOC",                 lat: 40.7559, lng: -73.4832, county: "Nassau",  note: "Primary Nassau EOC | 510 Grumman Rd W, Bethpage, NY 11714 | 516-573-9600" },
      { name: "Suffolk County OEM / NYS DHSES",    lat: 40.8315, lng: -72.9174, county: "Suffolk", note: "Suffolk OEM + NYS DHSES Region 1 (co-located) | 30 Yaphank Ave, Yaphank | 631-852-4900" },
      { name: "NYC OEM (Queens/Rockaway coord)",   lat: 40.6967, lng: -73.9896, county: "Queens",  note: "NYC Emergency Operations Center | 165 Cadman Plaza East, Brooklyn | 718-422-8700" },
      { name: "USCG Sector Field Office Moriches", lat: 40.7980, lng: -72.8050, county: "Suffolk", note: "USCG SAR coordination south shore | 100 Moriches Island Rd, E. Moriches | 631-395-4400" },
      { name: "USCG Station Fire Island",          lat: 40.6520, lng: -73.3227, county: "Suffolk", note: "Active SAR station | 1 Rescue Rd, Babylon | 631-661-9101" },
      { name: "USCG Station Eatons Neck",          lat: 40.9526, lng: -73.3957, county: "Suffolk", note: "North Shore/LI Sound SAR | 12 Lighthouse Rd, Northport | 631-261-6959" },
      { name: "USCG Station Shinnecock",           lat: 40.8777, lng: -72.5094, county: "Suffolk", note: "East End SAR (absorbs Moriches ops) | 100 Foster Ave, Hampton Bays | 631-728-0078" },
      { name: "USCG Station Montauk",              lat: 41.0632, lng: -71.9574, county: "Suffolk", note: "Easternmost LI SAR | 69 Star Island Rd, Montauk | 631-668-2773" },
      { name: "USCG Station Jones Beach",          lat: 40.5920, lng: -73.5268, county: "Nassau",  note: "Nassau south shore SAR [REDUCED OPS 2024 — restoration pending FY27] | 1 West End Boat Basin, Freeport | 516-785-2995" },
      { name: "MacArthur Airport (KISP)",          lat: 40.7952, lng: -73.1002, county: "Suffolk", note: "Islip — backup commercial + emergency air ops + medevac staging | 631-467-3210" },
      { name: "Republic Airport (KFRG)",           lat: 40.7288, lng: -73.4138, county: "Nassau",  note: "Farmingdale — general aviation, medevac, law enforcement, fire aviation | 631-752-7707" },
      { name: "FEMA Region 2 Office",              lat: 40.7143, lng: -74.0071, county: "NYC",     note: "26 Federal Plaza, Manhattan | 212-680-3600" },
    ]
  },

  floodRisk: {
    label: "High Flood Risk Areas",
    color: "#fb923c",
    icon: "⚠️",
    features: [
      // Nassau
      { name: "Long Beach (City)",             lat: 40.5884, lng: -73.6579, county: "Nassau",  note: "FEMA Zone AE/VE — entire city on barrier island; ~35,000 pop; no on-island trauma center; Sandy: catastrophic flooding" },
      { name: "Atlantic Beach / Lido Beach",   lat: 40.5906, lng: -73.7286, county: "Nassau",  note: "FEMA Zone AE/VE — barrier beach communities; Atlantic Beach Bridge is only Nassau-Queens link at this point" },
      { name: "Island Park",                   lat: 40.6025, lng: -73.6568, county: "Nassau",  note: "FEMA Zone AE — peninsula community; Hempstead Bay + Reynolds Channel exposure" },
      { name: "Freeport waterfront",           lat: 40.6551, lng: -73.5891, county: "Nassau",  note: "FEMA Zone AE — south shore waterfront; Nautical Mile commercial district flood-exposed" },
      { name: "Massapequa / Seaford shore",    lat: 40.6415, lng: -73.4673, county: "Nassau",  note: "FEMA Zone AE — Great South Bay shore; Sandy produced significant bay flooding" },
      // Suffolk south shore
      { name: "Lindenhurst waterfront",        lat: 40.6826, lng: -73.3711, county: "Suffolk", note: "FEMA Zone AE — Great South Bay; Sandy flooded entire south waterfront residential area" },
      { name: "Amityville Harbor",             lat: 40.6579, lng: -73.4172, county: "Suffolk", note: "FEMA Zone AE — highest storm surge susceptibility on LI per FEMA analysis" },
      { name: "Fire Island (barrier island)",  lat: 40.6325, lng: -73.2093, county: "Suffolk", note: "FEMA Zone VE — entire barrier island; ferry-only access; no road evacuation possible; complete overwash in Cat 2+" },
      { name: "Mastic Beach / Shirley",        lat: 40.7665, lng: -72.8500, county: "Suffolk", note: "FEMA Zone AE — Forge River / Moriches Bay; Sandy severely damaged entire community; ~20,000 affected" },
      { name: "Westhampton Beach",             lat: 40.8030, lng: -72.6415, county: "Suffolk", note: "FEMA Zone VE/AE — barrier spit; Moriches Bay + Atlantic exposure; 1992 northeaster created breach in barrier beach" },
      { name: "Hampton Bays (Shinnecock Bay)", lat: 40.8676, lng: -72.5193, county: "Suffolk", note: "FEMA Zone AE — Shinnecock Bay / Inlet; limited road evacuation options; surge trapping risk" },
      { name: "Montauk (peninsula tip)",       lat: 41.0534, lng: -71.9543, county: "Suffolk", note: "FEMA Zone VE — three-sided water exposure; Block Island Sound, Atlantic, Fort Pond Bay; single road in/out (Route 27)" },
      // Rockaway (from NYC nyc.js — retained and noted as NYC jurisdiction)
      { name: "Breezy Point (Queens/NYC)",     lat: 40.5587, lng: -73.9290, county: "Queens",  note: "FEMA Zone VE (NYC jurisdiction) — barrier spit; 126 homes burned during Sandy surge; extreme wave action; NYC Evac Zone 1" },
      { name: "Rockaway Beach (Queens/NYC)",   lat: 40.5807, lng: -73.8188, county: "Queens",  note: "FEMA Zone AE/VE (NYC jurisdiction) — NYC Evac Zone 1; entire peninsula mandatory evacuation Cat 1+" },
      { name: "Far Rockaway (Queens/NYC)",     lat: 40.6038, lng: -73.7544, county: "Queens",  note: "FEMA Zone AE (NYC jurisdiction) — Jamaica Bay exposure; A-train vulnerability; border with Nassau Atlantic Beach" },
    ]
  },

  // ── LI-SPECIFIC ADDITIONAL LAYERS ──────────────────────────────────────
  ferryRoutes: {
    label: "Emergency Ferry Terminals (Barrier Beach Access)",
    color: "#a78bfa",
    icon: "⛴️",
    features: [
      { name: "Bay Shore Ferry Terminal",      lat: 40.7236, lng: -73.2472, county: "Suffolk", note: "Primary Fire Island evacuation terminal | Bay Shore Ferry 631-665-3600 | Serves Ocean Beach, Kismet, Saltaire, Fair Harbor, Dunewood, Corneille Estates" },
      { name: "Sayville Ferry Terminal",       lat: 40.7417, lng: -73.0829, county: "Suffolk", note: "Fire Island Pines, Cherry Grove, Sailors Haven | Sayville Ferry 631-589-0810" },
      { name: "Patchogue Ferry Terminal",      lat: 40.7693, lng: -73.0169, county: "Suffolk", note: "Watch Hill, Davis Park | Davison's Ferry 631-475-1665" },
      { name: "Orient Point Ferry Terminal",   lat: 41.1341, lng: -72.2216, county: "Suffolk", note: "Cross Sound Ferry to New London CT | North Fork / East End alternate evacuation route | 631-323-2525" },
      { name: "Greenport Ferry (North Ferry)", lat: 41.1048, lng: -72.3612, county: "Suffolk", note: "Shelter Island North Ferry | 631-749-0139 | Connects Shelter Island to North Fork/Southold" },
      { name: "North Haven Ferry (South Ferry)",lat: 41.0629, lng: -72.3394, county: "Suffolk", note: "Shelter Island South Ferry | 631-749-1200 | Connects Shelter Island to South Fork/Southampton" },
      { name: "Marine Pkwy Bridge (Gateway)", lat: 40.5737, lng: -73.8844, county: "Queens",  note: "Primary vehicle egress — Rockaway to Brooklyn (Floyd Bennett Field side); closure protocol in surge events" },
      { name: "Cross Bay Veterans Memorial Bridge", lat: 40.6198, lng: -73.8333, county: "Queens", note: "Rockaway to Howard Beach egress; vulnerable in storm surge; both bridges can close simultaneously — trapping risk" },
      { name: "Atlantic Beach Bridge",         lat: 40.5892, lng: -73.7284, county: "Nassau",  note: "Nassau-operated; connects Atlantic Beach (Nassau Zone A) to Far Rockaway (NYC Zone 1); key cross-county evac link" },
    ]
  },

  lirr: {
    label: "LIRR Infrastructure (Key Emergency Nodes)",
    color: "#f59e0b",
    icon: "🚂",
    features: [
      { name: "Jamaica Station (LIRR Hub)",        lat: 40.7013, lng: -73.8025, county: "Queens",  note: "Central LIRR hub; all branches converge; primary staging for LI evacuation via rail; 511 for status" },
      { name: "Penn Station (Manhattan terminus)",  lat: 40.7506, lng: -73.9939, county: "NYC",     note: "LIRR primary Manhattan terminus; East River tunnels flood risk (Sandy: closed 6 weeks)" },
      { name: "Wreck Lead Bridge (Reynolds Channel)", lat: 40.6101, lng: -73.6482, county: "Nassau", note: "Critical LIRR Long Beach Branch crossing; $120M Sandy hardening completed 2018; most vulnerable rail segment on LI" },
      { name: "Long Beach Station (LIRR)",         lat: 40.5888, lng: -73.6627, county: "Nassau",  note: "Long Beach Branch terminus; Zone AE; suspended pre-Sandy; first branch closed in hurricane protocol" },
      { name: "Babylon Station (LIRR junction)",   lat: 40.7030, lng: -73.3255, county: "Suffolk", note: "Key south shore junction; Montauk/Babylon branch split; evacuation staging point" },
      { name: "Ronkonkoma Station (LIRR)",         lat: 40.8143, lng: -73.1229, county: "Suffolk", note: "Main line central Suffolk hub; Port Jefferson branch junction; inland receiving point for south shore evacuees" },
      { name: "Speonk/Hampton Bays (LIRR)",        lat: 40.8296, lng: -72.7010, county: "Suffolk", note: "East End Montauk branch; critical East End evacuation route limitation; single track east of here" },
    ]
  }
}

// ─── Summarize live API response for LLM context ───────────────────────────────
export function summarizeAPIData(r) {
  if (!r.success) return `[${r.name}: unavailable — ${r.error}]`
  const d = r.data
  try {
    // Weather alerts
    if (r.type === "weather" && d.features) {
      const alerts = d.features.slice(0, 3).map(f => `${f.properties.event} — ${(f.properties.headline || "").substring(0, 90)}`).join("; ")
      return `NWS Active Alerts (NY): ${d.features.length} total. ${alerts || "None active"}`
    }
    // Forecast
    if (r.type === "forecast" && d.properties?.periods) {
      return `NWS Forecast (${r.name}): ` + d.properties.periods.slice(0, 3).map(p => `${p.name}: ${p.shortForecast}, ${p.temperature}°${p.temperatureUnit}`).join("; ")
    }
    // USGS stream gauges
    if (r.type === "flood" && d.value?.timeSeries) {
      return `USGS NY Gauges: ` + d.value.timeSeries.slice(0, 4).map(g => `${g.sourceInfo.siteName}: ${g.values?.[0]?.value?.[0]?.value ?? "N/A"} ft`).join("; ")
    }
    // NOAA tidal (CO-OPS API returns data array)
    if (r.type === "flood" && d.data) {
      const latest = d.data[d.data.length - 1]
      return `${r.name}: ${latest?.v ?? "N/A"} ft (${latest?.t ?? ""})`
    }
    // FEMA declarations
    if (r.type === "fema" && d.DisasterDeclarationsSummaries) {
      return "FEMA NY Declarations: " + d.DisasterDeclarationsSummaries.slice(0, 3).map(x => `${x.incidentType} — ${x.declarationTitle} (${(x.declarationDate || "").substring(0, 10)})`).join("; ")
    }
    // NYC 311
    if (r.type === "civic" && Array.isArray(d)) {
      return "NYC 311 Recent: " + d.slice(0, 3).map(x => `${x.complaint_type}: ${x.descriptor} (${x.borough})`).join("; ")
    }
    // MTA LIRR (GTFS-RT — binary proto; return placeholder)
    if (r.type === "transit") {
      return `LIRR Status: feed received (parse GTFS-RT for alerts)`
    }
    return `[${r.name}: received]`
  } catch {
    return `[${r.name}: parse error]`
  }
}

// ─── Build LLM context string ──────────────────────────────────────────────────
export function buildContext(files, apiResults, activeModules) {
  let ctx = "=== LONG ISLAND EMERGENCY MANAGEMENT KNOWLEDGE BASE ===\n"
  ctx += "=== Covers: Nassau County | Suffolk County | Rockaway Peninsula (Queens) ===\n\n"

  for (const [key, mod] of Object.entries(LI_KB)) {
    if (activeModules.includes(key)) ctx += `--- ${mod.label} [${mod.source}] ---\n${mod.data}\n\n`
  }

  if (apiResults.length) {
    ctx += "--- LIVE API DATA (fetched " + new Date().toUTCString() + ") ---\n"
    apiResults.forEach(r => { ctx += summarizeAPIData(r) + "\n" })
    ctx += "\n"
  }

  if (files.length) {
    ctx += "--- UPLOADED DOCUMENTS ---\n"
    files.forEach(f => { ctx += `[File: ${f.name}]\n${f.content.substring(0, 4000)}\n\n` })
  }

  return ctx
}
