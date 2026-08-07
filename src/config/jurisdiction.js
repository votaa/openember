// Auto-generated from config/jurisdiction.yaml — do not edit directly
// Run: node scripts/build-config.js to regenerate

export const JURISDICTION = {
  "name": "Long Island",
  "short_name": "LI",
  "state": "NY",
  "state_full": "New York",
  "county": "Nassau / Suffolk",
  "center": [
    40.7891,
    -73.135
  ],
  "bbox": {
    "north": 41.2,
    "south": 40.4,
    "east": -71.8,
    "west": -74.3
  },
  "zoom": 10,
  "timezone": "America/New_York"
};
export const NWS = {
  "office": "OKX",
  "grid_x": 62,
  "grid_y": 50,
  "alert_zone": "NYZ178",
  "obs_stations": [
    {
      "id": "KOKX",
      "name": "Upton NY (OKX)",
      "lat": 40.8651,
      "lng": -72.8638
    },
    {
      "id": "KFRG",
      "name": "Republic Airport (Farmingdale)",
      "lat": 40.7288,
      "lng": -73.4138
    },
    {
      "id": "KISP",
      "name": "Long Island MacArthur Airport",
      "lat": 40.7952,
      "lng": -73.1002
    },
    {
      "id": "KHWV",
      "name": "Brookhaven Airport",
      "lat": 40.8219,
      "lng": -72.8694
    },
    {
      "id": "KFOK",
      "name": "Gabreski Airport",
      "lat": 40.8437,
      "lng": -72.6318
    },
    {
      "id": "KMTP",
      "name": "Montauk Airport",
      "lat": 41.0765,
      "lng": -71.9208
    },
    {
      "id": "KJFK",
      "name": "JFK Airport",
      "lat": 40.6413,
      "lng": -73.7781
    },
    {
      "id": "KLGA",
      "name": "LaGuardia Airport",
      "lat": 40.7772,
      "lng": -73.8726
    },
    {
      "id": "KBDR",
      "name": "Bridgeport Airport",
      "lat": 41.1635,
      "lng": -73.1262
    }
  ],
  "alert_url": "https://api.weather.gov/alerts/active?area=NY",
  "forecast_url": "https://api.weather.gov/gridpoints/OKX/62,50/forecast",
  "hourly_url": "https://api.weather.gov/gridpoints/OKX/62,50/forecast/hourly",
  "gridpoint_url": "https://api.weather.gov/gridpoints/OKX/62,50"
};
export const COOPS_STATIONS = [
  {
    "id": "8516945",
    "name": "Kings Point (LI Sound)",
    "lat": 40.8105,
    "lng": -73.7659,
    "is_primary": true,
    "flood_thresholds": {
      "action": 4.5,
      "minor": 5.5,
      "moderate": 6.5,
      "major": 8.5
    }
  },
  {
    "id": "8518750",
    "name": "Battery Park (NYC surge ref)",
    "lat": 40.7003,
    "lng": -74.0141,
    "flood_thresholds": {
      "action": 4.5,
      "minor": 5.5,
      "moderate": 6.5,
      "major": 8.5
    }
  },
  {
    "id": "8515186",
    "name": "Fire Island USCG (Great South Bay inlet)",
    "lat": 40.6278,
    "lng": -73.1788,
    "flood_thresholds": {
      "action": 4.5,
      "minor": 5.5,
      "moderate": 6.5,
      "major": 8.5
    }
  },
  {
    "id": "8515102",
    "name": "Bay Shore (Great South Bay)",
    "lat": 40.7074,
    "lng": -73.2421,
    "flood_thresholds": {
      "action": 4.5,
      "minor": 5.5,
      "moderate": 6.5,
      "major": 8.5
    }
  }
];
export const FLOOD_THRESHOLDS = {
  "8515102": {
    "name": "Bay Shore (Great South Bay)",
    "action": 4.5,
    "minor": 5.5,
    "moderate": 6.5,
    "major": 8.5
  },
  "8515186": {
    "name": "Fire Island USCG (Great South Bay inlet)",
    "action": 4.5,
    "minor": 5.5,
    "moderate": 6.5,
    "major": 8.5
  },
  "8516945": {
    "name": "Kings Point (LI Sound)",
    "action": 4.5,
    "minor": 5.5,
    "moderate": 6.5,
    "major": 8.5
  },
  "8518750": {
    "name": "Battery Park (NYC surge ref)",
    "action": 4.5,
    "minor": 5.5,
    "moderate": 6.5,
    "major": 8.5
  }
};
export const KNOWLEDGE_BASE = {
  "floodZones": {
    "label": "Flood Zones",
    "source": "FEMA / Local",
    "data": "Zone AE (Special Flood Hazard): Long Beach (entire city), Atlantic Beach, Lido Beach, Island Park, Oceanside, Freeport waterfront, Merrick, Massapequa bay-front (Nassau); Lindenhurst, Copiague, Amityville Harbor, Bay Shore waterfront, Mastic Beach, Shirley, Patchogue, Westhampton Beach, Hampton Bays, Shinnecock Bay (Suffolk).\nZone VE (Coastal High-Hazard / wave action): Fire Island (entire barrier island), Jones Beach Island, Long Beach ocean side, Montauk Point, Breezy Point (Queens/NYC).\nZone X (moderate risk): Inland Nassau and Suffolk north of Southern State Pkwy.\nStorm Surge Zones A-D: ~220,000 LI residents (15%) in Zone A/B.\nPost-Sandy (2012): ~$5.5B LI damage; Nassau ~$3B, Suffolk ~$2.5B. FEMA maps substantially revised.\n"
  },
  "evacZones": {
    "label": "Evacuation Zones",
    "source": "Local OEM",
    "data": "Zone A (highest): Barrier islands — mandatory evacuation ANY hurricane or tropical storm. Long Beach, Atlantic Beach, Lido Beach, Point Lookout, Island Park (Nassau); Fire Island, Mastic Beach, Shirley, Westhampton Beach oceanside, Hampton Bays oceanside, Montauk tip (Suffolk); Rockaways (NYC Zone 1).\nZone B: Low-lying bay-adjacent areas — evacuate Cat 1+.\nZone C: Moderate risk inland — evacuate Cat 2+.\nZone D: Lower risk — evacuate Cat 3+.\nNassau shelters: Nassau Community College (Garden City), Kellenberg Memorial HS (Uniondale), Carey HS (Franklin Square). Alert: text OneNassau to 888777.\nSuffolk: Fire Island — FERRY ONLY evacuation via Bay Shore, Sayville, Patchogue terminals. South shore mainland: Southern State Pkwy / Sunrise Hwy. Alert: text SuffolkAlerts to 67283.\nRockaway (NYC Zone 1): Cross Bay Veterans Memorial Bridge + Marine Pkwy Bridge egress. Nassau shelters available to NYC Zone 1 evacuees by agreement.\n"
  },
  "criticalInfrastructure": {
    "label": "Critical Infrastructure",
    "source": "Local OEM",
    "data": "Hospitals — Nassau Level 1 Trauma (3): North Shore University Hospital (Manhasset, ACS + NYS DOH Regional L1); Nassau University Medical Center (East Meadow, NYS DOH L1); NYU Langone LI (Mineola, ACS L1).\nNassau Level 2: Mount Sinai South Nassau (Oceanside, formerly South Nassau Communities).\nSuffolk Level 1 Trauma (3): Stony Brook University Hospital (ACS + NYS DOH Regional L1, adult + peds); South Shore University Hospital (Bay Shore, ACS L1 Aug 2024, NYS DOH state designation pending); Good Samaritan University Hospital (West Islip, ACS L1 adult / L2 peds).\nSuffolk Level 2: NYU Langone Suffolk (East Patchogue, ACS-verified Jul 2025); Northwell Huntington Hospital.\nSuffolk Level 3 / East End: Southampton Hospital; Peconic Bay Medical Center (Riverhead).\nNOTE: No trauma center on Fire Island, Long Beach barrier island, or Rockaway Peninsula itself. South Shore University Hospital NYS state L1 designation still pending as of 2025.\nHelipads: North Shore UH (FAA 7NY3/6NK3), NUMC (FAA 0NK4), Stony Brook (FAA 6NY6), South Shore UH — critical for medevac routing decisions.\n"
  },
  "hazardProfiles": {
    "label": "Hazard Profiles",
    "source": "Local HMP",
    "data": "HURRICANES: Sandy 2012 (Cat 1) — $5.5B LI damage, 13 LI deaths, ~1.1M without power. Primary risk: storm surge (6-10+ ft south shore), not wind. Barrier island overwash possible Cat 2+. 15 tropical systems impacted NYS since 2012; frequency doubled in 6 years (NYS DHSES 2024).\nCOASTAL FLOODING: Great South Bay avg 4ft depth — surge rises rapidly. Combined ocean surge + bay flooding traps south shore mainland. Key gauges: Kings Point (8516945), Fire Island (8515186), Bay Shore (8515102), Battery Park ref (8518750).\nEXTREME HEAT: Fewer cooling centers per capita than NYC. Nassau protocol at Heat Index >= 95F. Hempstead, Brentwood, Central Islip — reduced cooling access in affordable/senior housing.\nWINTER STORMS / NOREASTERS: Jonas 2016 — 25+ inches Suffolk. LIRR third-rail vulnerable. Route 27 and Route 25 single-road dependency for East End communities.\nHAZMAT: Brookhaven National Laboratory (DOE, Upton) — radiological. Bethpage Grumman groundwater plume (Nassau) — active CERCLA remediation 2025.\n"
  },
  "resources": {
    "label": "Contacts & Resources",
    "source": "Local OEM",
    "data": "Nassau OEM: 516-573-9600 | 510 Grumman Rd W, Bethpage | nassaucountyny.gov/oem\nSuffolk OEM: 631-852-4900 | 30 Yaphank Ave, Yaphank | scoem.suffolkcountyny.gov\nNYC OEM (Rockaway coordination): 718-422-8700 | nyc.gov/oem\nNYS DHSES Region 1 (LI): 631-952-6599 | 30 Yaphank Ave, Yaphank\nFEMA Region 2: 212-680-3600 | 26 Federal Plaza, Manhattan\nNassau County PD: 516-573-8800 | Suffolk County PD: 631-852-6000\nNYU Langone LI (Level 1 Trauma): 516-663-0333\nStony Brook SUMC (Level 1 Trauma): 631-444-4000\nGood Samaritan (Level 1 Trauma): 631-376-3000\nPSEG Long Island (outages): 1-800-490-0075 | National Grid (gas): 1-800-930-5003\nNWS OKX (Upton): 631-924-0517 | USCG Emergency: VHF Ch 16\nNassau Nixle: text OneNassau to 888777\nSuffolkAlert: text SuffolkAlerts to 67283\nLIRR: 511 | mta.info/lirr\n"
  }
};
export const MAP_LAYERS = {
  "hospitals": {
    "label": "Trauma Centers",
    "color": "#f87171",
    "icon": "🏥",
    "features": [
      {
        "name": "North Shore University Hospital",
        "lat": 40.7765,
        "lng": -73.6993,
        "note": "Level 1 Adult & Pediatric Trauma | ACS-verified | NYS DOH Regional L1 | 300 Community Dr, Manhasset | 516-562-0100",
        "borough": ""
      },
      {
        "name": "Nassau University Medical Center",
        "lat": 40.7226,
        "lng": -73.5512,
        "note": "Level 1 Adult Trauma | NYS DOH designated | Special Medical Needs Shelter hub | 2201 Hempstead Tpke, East Meadow | 516-572-3000",
        "borough": ""
      },
      {
        "name": "NYU Langone Hospital — Long Island",
        "lat": 40.743,
        "lng": -73.641,
        "note": "Level 1 Adult Trauma | ACS-verified | 259 1st St, Mineola | 516-663-0333",
        "borough": ""
      },
      {
        "name": "Mount Sinai South Nassau Hospital",
        "lat": 40.6472,
        "lng": -73.6358,
        "note": "Level 2 Adult Trauma | ACS-verified | formerly South Nassau Communities Hospital | 1 Health Rd, Oceanside | 516-632-3000",
        "borough": ""
      },
      {
        "name": "Stony Brook University Hospital",
        "lat": 40.9103,
        "lng": -73.1163,
        "note": "Level 1 Adult & Pediatric Trauma | ACS-verified | NYS DOH Regional L1 | 101 Nicolls Rd, Stony Brook | 631-444-4000",
        "borough": ""
      },
      {
        "name": "South Shore University Hospital",
        "lat": 40.7258,
        "lng": -73.2393,
        "note": "Level 1 Adult Trauma | ACS-verified Aug 2024 | NYS DOH state designation pending | formerly Southside Hospital | 301 E Main St, Bay Shore | 631-968-3000",
        "borough": ""
      },
      {
        "name": "Good Samaritan University Hospital",
        "lat": 40.6932,
        "lng": -73.304,
        "note": "Level 1 Adult / Level 2 Pediatric Trauma | ACS-verified | 1000 Montauk Hwy, West Islip | 631-376-3000",
        "borough": ""
      },
      {
        "name": "NYU Langone Hospital — Suffolk",
        "lat": 40.7726,
        "lng": -72.9772,
        "note": "Level 2 Adult Trauma | NYS DOH Oct 2024 | ACS-verified Jul 2025 | 101 Hospital Rd, East Patchogue | 631-654-7100",
        "borough": ""
      },
      {
        "name": "Northwell Huntington Hospital",
        "lat": 40.8762,
        "lng": -73.4274,
        "note": "Level 2 Trauma | North Shore receiving | 270 Park Ave, Huntington | 631-351-2000",
        "borough": ""
      },
      {
        "name": "Southampton Hospital",
        "lat": 40.8837,
        "lng": -72.3849,
        "note": "Level 3 Trauma | Primary East End receiving | nearest L1 is Stony Brook 45+ mi | 240 Meeting House Lane | 631-726-8200",
        "borough": ""
      },
      {
        "name": "Peconic Bay Medical Center",
        "lat": 40.9137,
        "lng": -72.6551,
        "note": "Level 3 Trauma | North Fork / East End hub | 1300 Roanoke Ave, Riverhead | 631-548-6000",
        "borough": ""
      },
      {
        "name": "NYC H+H Queens Hospital Center",
        "lat": 40.7007,
        "lng": -73.7949,
        "note": "Level 1 Trauma (NYC) | Primary receiving for Rockaway Peninsula residents | 82-68 164th St, Jamaica | 718-883-3000",
        "borough": ""
      }
    ]
  },
  "shelters": {
    "label": "Evac Shelters",
    "color": "#60a5fa",
    "icon": "🏫",
    "features": [
      {
        "name": "Nassau Community College",
        "lat": 40.7285,
        "lng": -73.5942,
        "note": "Primary Nassau Red Cross hub | Zone A/B | Garden City",
        "borough": ""
      },
      {
        "name": "Kellenberg Memorial HS",
        "lat": 40.7093,
        "lng": -73.5977,
        "note": "Hurricane Evacuation Center | Zone A | Uniondale",
        "borough": ""
      },
      {
        "name": "Carey HS (Franklin Square)",
        "lat": 40.704,
        "lng": -73.6752,
        "note": "Hurricane Evacuation Center | Nassau",
        "borough": ""
      },
      {
        "name": "Sachem HS North (Ronkonkoma)",
        "lat": 40.8359,
        "lng": -73.1221,
        "note": "Major center | central Suffolk hub",
        "borough": ""
      },
      {
        "name": "Brentwood HS",
        "lat": 40.7776,
        "lng": -73.246,
        "note": "Evacuation Center | central Suffolk",
        "borough": ""
      },
      {
        "name": "William Floyd HS (Mastic Beach)",
        "lat": 40.7795,
        "lng": -72.8476,
        "note": "Evacuation Center | Mastic/Shirley south shore",
        "borough": ""
      },
      {
        "name": "Hampton Bays HS",
        "lat": 40.8699,
        "lng": -72.5148,
        "note": "East End evacuation center",
        "borough": ""
      },
      {
        "name": "NUMC Special Medical Needs Shelter",
        "lat": 40.7295,
        "lng": -73.5576,
        "note": "Special Medical Needs | Nassau University Medical Center",
        "borough": ""
      }
    ]
  },
  "gauges": {
    "label": "Tidal Gauges",
    "color": "#4ade80",
    "icon": "📡",
    "features": [
      {
        "name": "Kings Point (LI Sound)",
        "lat": 40.8105,
        "lng": -73.7659,
        "note": "NOAA 8516945 — LI Sound north shore surge indicator",
        "borough": ""
      },
      {
        "name": "Fire Island USCG",
        "lat": 40.6278,
        "lng": -73.1788,
        "note": "NOAA 8515186 — south shore / Great South Bay inlet",
        "borough": ""
      },
      {
        "name": "Bay Shore (Great South Bay)",
        "lat": 40.7074,
        "lng": -73.2421,
        "note": "NOAA 8515102 — Great South Bay surge monitoring",
        "borough": ""
      },
      {
        "name": "Battery Park (NYC surge ref)",
        "lat": 40.7003,
        "lng": -74.0141,
        "note": "NOAA 8518750 — regional surge reference gauge",
        "borough": ""
      },
      {
        "name": "Jamaica Bay (Inwood)",
        "lat": 40.6226,
        "lng": -73.7576,
        "note": "NOAA tidal — Zone A Jamaica Bay / Rockaway monitoring",
        "borough": ""
      },
      {
        "name": "Nissequogue River nr Smithtown",
        "lat": 40.8662,
        "lng": -73.2059,
        "note": "USGS 01304500 — north shore river flood monitoring",
        "borough": ""
      },
      {
        "name": "Connetquot River at Oakdale",
        "lat": 40.7315,
        "lng": -73.1537,
        "note": "USGS 01306500 — south shore interior flood indicator",
        "borough": ""
      },
      {
        "name": "Carmans River at Yaphank",
        "lat": 40.8165,
        "lng": -72.9171,
        "note": "USGS 01305000 — central Suffolk flood monitoring",
        "borough": ""
      }
    ]
  },
  "eoc": {
    "label": "EOC / Command",
    "color": "#facc15",
    "icon": "🏛",
    "features": [
      {
        "name": "Nassau County EOC",
        "lat": 40.7559,
        "lng": -73.4832,
        "note": "Primary Nassau EOC | 510 Grumman Rd W, Bethpage | 516-573-9600",
        "borough": ""
      },
      {
        "name": "Suffolk OEM / NYS DHSES Region 1",
        "lat": 40.8315,
        "lng": -72.9174,
        "note": "Suffolk OEM + NYS DHSES co-located | 30 Yaphank Ave | 631-852-4900",
        "borough": ""
      },
      {
        "name": "NYC OEM (Queens/Rockaway coord)",
        "lat": 40.6967,
        "lng": -73.9896,
        "note": "NYC EOC | 165 Cadman Plaza East, Brooklyn | 718-422-8700",
        "borough": ""
      },
      {
        "name": "USCG Station Fire Island",
        "lat": 40.652,
        "lng": -73.3227,
        "note": "Active SAR | 1 Rescue Rd, Babylon | 631-661-9101",
        "borough": ""
      },
      {
        "name": "USCG Station Eatons Neck",
        "lat": 40.9526,
        "lng": -73.3957,
        "note": "North Shore / LI Sound SAR | Northport | 631-261-6959",
        "borough": ""
      },
      {
        "name": "USCG Station Shinnecock",
        "lat": 40.8777,
        "lng": -72.5094,
        "note": "East End SAR | Hampton Bays | 631-728-0078",
        "borough": ""
      },
      {
        "name": "USCG Station Montauk",
        "lat": 41.0632,
        "lng": -71.9574,
        "note": "Easternmost LI SAR | 631-668-2773",
        "borough": ""
      },
      {
        "name": "MacArthur Airport (KISP)",
        "lat": 40.7952,
        "lng": -73.1002,
        "note": "Emergency air ops + medevac staging | Islip",
        "borough": ""
      },
      {
        "name": "Republic Airport (KFRG)",
        "lat": 40.7288,
        "lng": -73.4138,
        "note": "Medevac, law enforcement, fire aviation | Farmingdale",
        "borough": ""
      },
      {
        "name": "FEMA Region 2",
        "lat": 40.7143,
        "lng": -74.0071,
        "note": "26 Federal Plaza, Manhattan | 212-680-3600",
        "borough": ""
      }
    ]
  },
  "floodRisk": {
    "label": "Flood Risk Areas",
    "color": "#fb923c",
    "icon": "💧",
    "features": [
      {
        "name": "Long Beach (City)",
        "lat": 40.5884,
        "lng": -73.6579,
        "note": "Zone AE/VE — entire city on barrier island; no on-island trauma center",
        "borough": ""
      },
      {
        "name": "Atlantic Beach / Lido Beach",
        "lat": 40.5906,
        "lng": -73.7286,
        "note": "Zone AE/VE — barrier beach; Atlantic Beach Bridge only Nassau-Queens link",
        "borough": ""
      },
      {
        "name": "Island Park",
        "lat": 40.6025,
        "lng": -73.6568,
        "note": "Zone AE — peninsula; Hempstead Bay + Reynolds Channel exposure",
        "borough": ""
      },
      {
        "name": "Freeport waterfront",
        "lat": 40.6551,
        "lng": -73.5891,
        "note": "Zone AE — Nautical Mile commercial district flood-exposed",
        "borough": ""
      },
      {
        "name": "Lindenhurst waterfront",
        "lat": 40.6826,
        "lng": -73.3711,
        "note": "Zone AE — Great South Bay; Sandy flooded entire south waterfront district",
        "borough": ""
      },
      {
        "name": "Amityville Harbor",
        "lat": 40.6579,
        "lng": -73.4172,
        "note": "Zone AE — highest storm surge susceptibility on LI per FEMA analysis",
        "borough": ""
      },
      {
        "name": "Fire Island (barrier island)",
        "lat": 40.6325,
        "lng": -73.2093,
        "note": "Zone VE — ferry-only; no road evacuation; complete overwash Cat 2+",
        "borough": ""
      },
      {
        "name": "Mastic Beach / Shirley",
        "lat": 40.7665,
        "lng": -72.85,
        "note": "Zone AE — Forge River/Moriches Bay; ~20,000 affected by Sandy",
        "borough": ""
      },
      {
        "name": "Westhampton Beach",
        "lat": 40.803,
        "lng": -72.6415,
        "note": "Zone VE/AE — barrier spit; 1992 northeaster created beach breach",
        "borough": ""
      },
      {
        "name": "Hampton Bays (Shinnecock Bay)",
        "lat": 40.8676,
        "lng": -72.5193,
        "note": "Zone AE — surge trapping risk; limited evacuation options",
        "borough": ""
      },
      {
        "name": "Montauk (peninsula tip)",
        "lat": 41.0534,
        "lng": -71.9543,
        "note": "Zone VE — 3-sided water exposure; single road in/out (Route 27)",
        "borough": ""
      },
      {
        "name": "Breezy Point (Queens/NYC)",
        "lat": 40.5587,
        "lng": -73.929,
        "note": "Zone VE (NYC) — 126 homes burned during Sandy surge; NYC Evac Zone 1",
        "borough": ""
      },
      {
        "name": "Rockaway Beach (Queens/NYC)",
        "lat": 40.5807,
        "lng": -73.8188,
        "note": "Zone AE/VE (NYC) — mandatory evacuation Cat 1+; NYC Evac Zone 1",
        "borough": ""
      }
    ]
  }
};
export const SOCRATA = {
  "domain": "data.cityofnewyork.us",
  "presets": [
    {
      "id": "uqnk-2pcv",
      "name": "Hurricane Evacuation Centers (NYC/Rockaway)",
      "agency": "NYC OEM",
      "lat_col": "latitude",
      "lng_col": "longitude",
      "label_col": "facility_name",
      "color": "#facc15",
      "icon": "🏫",
      "desc": "NYC-designated hurricane evacuation shelters (relevant for Rockaway Zone 1)"
    },
    {
      "id": "fhrw-4uyv",
      "name": "NYC 311 Service Requests (Rockaway)",
      "agency": "311",
      "lat_col": "latitude",
      "lng_col": "longitude",
      "label_col": "complaint_type",
      "color": "#60a5fa",
      "icon": "📞",
      "desc": "Real-time 311 complaints — filter by borough Queens for Rockaway data"
    },
    {
      "id": "nuhi-jiwk",
      "name": "FDNY Incidents (Rockaway area)",
      "agency": "FDNY",
      "lat_col": "latitude",
      "lng_col": "longitude",
      "label_col": "incident_type_desc",
      "color": "#f87171",
      "icon": "🚒",
      "desc": "FDNY incident data — operationally relevant for Rockaway Peninsula"
    }
  ]
};
export const NOAA_STATES = {
  "alerts": "NY",
  "usgs": "NY",
  "fema": "NY"
};
export const BRANDING = {
  "appTitle": "EMBER",
  "appSubtitle": "Emergency Management Body of Evidence & Resources",
  "jurisdictionLine": "LONG ISLAND — Nassau · Suffolk · Rockaway Peninsula",
  "primaryColor": "#1d4ed8",
  "logoEmoji": "🚨"
};
