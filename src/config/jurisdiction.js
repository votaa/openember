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
    "north": 41.32,
    "south": 40.4,
    "east": -71.8,
    "west": -74.3
  },
  "zoom": 10,
  "timezone": "America/New_York"
};
export const REGIONS = {
  "nassau": {
    "name": "Nassau County",
    "geography": "nassau",
    "county_fips": "36059",
    "bbox": {
      "north": 40.93,
      "south": 40.53,
      "east": -73.42,
      "west": -73.77
    },
    "boundary_source_id": "nys_civil_boundaries",
    "scope_method": "authoritative_polygon",
    "boundary_filter": {
      "field": "FIPS_CODE",
      "value": "36059"
    }
  },
  "suffolk": {
    "name": "Suffolk County",
    "geography": "suffolk",
    "county_fips": "36103",
    "bbox": {
      "north": 41.31,
      "south": 40.54,
      "east": -71.85,
      "west": -73.5
    },
    "boundary_source_id": "nys_civil_boundaries",
    "scope_method": "authoritative_polygon",
    "boundary_filter": {
      "field": "FIPS_CODE",
      "value": "36103"
    }
  },
  "rockaway": {
    "name": "Rockaway / Queens Community Board 14",
    "geography": "rockaway",
    "county_fips": "36081",
    "bbox": {
      "north": 40.67,
      "south": 40.53,
      "east": -73.73,
      "west": -73.96
    },
    "boundary_source_id": null,
    "scope_method": "community_board_filter",
    "boundary_filter": {
      "borough": "QUEENS",
      "community_board": "14 QUEENS"
    },
    "includes_broad_channel": true,
    "future_enhancement": "Replace the CB14 filter with an authoritative peninsula polygon to exclude Broad Channel."
  }
};
export const SOURCE_REGISTRY = [
  {
    "id": "nyc_311_rockaway",
    "name": "NYC 311 service requests — Rockaway",
    "owner": "NYC 311",
    "geographies": [
      "rockaway"
    ],
    "family": "socrata",
    "endpoint": "https://data.cityofnewyork.us/resource/erm2-nwe9.json",
    "format": "json",
    "qualification": "qualified",
    "enabled": true,
    "refresh_seconds": 300,
    "stale_after_seconds": 900,
    "required_filter": "borough = 'QUEENS' AND community_board = '14 QUEENS' AND latitude IS NOT NULL AND longitude IS NOT NULL",
    "attribution": "NYC Open Data / NYC 311",
    "failure_state": "unavailable"
  },
  {
    "id": "nassau_town_boundaries",
    "name": "Nassau town and city boundaries",
    "owner": "Nassau County GIS",
    "geographies": [
      "nassau"
    ],
    "family": "arcgis_feature_server",
    "endpoint": "https://gis.nassaucountyny.gov/server/rest/services/Hosted/My_Nassau/FeatureServer/5",
    "format": "geojson",
    "qualification": "prototype_only",
    "enabled": false,
    "refresh_seconds": 86400,
    "stale_after_seconds": 604800,
    "attribution": "Nassau County GIS",
    "gate": "County reuse, attribution, ownership, and update-cadence confirmation",
    "failure_state": "unavailable"
  },
  {
    "id": "suffolk_evacuation_zones",
    "name": "Suffolk evacuation zones",
    "owner": "Suffolk County GIS",
    "geographies": [
      "suffolk"
    ],
    "family": "arcgis_feature_server",
    "endpoint": "https://gis.suffolkcountyny.gov/hosted/rest/services/Hosted/FRES_Evacuation_Zones_Final/FeatureServer",
    "layer_ids": [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9
    ],
    "format": "geojson",
    "qualification": "prototype_only",
    "enabled": false,
    "refresh_seconds": 86400,
    "stale_after_seconds": 604800,
    "attribution": "Suffolk County GIS",
    "gate": "County ownership, meaning, currency, reuse, and attribution confirmation",
    "failure_state": "unavailable"
  },
  {
    "id": "suffolk_flood_100yr",
    "name": "Suffolk 100-year flood zones",
    "owner": "Suffolk County GIS",
    "geographies": [
      "suffolk"
    ],
    "family": "arcgis_feature_server",
    "endpoint": "https://gis.suffolkcountyny.gov/hosted/rest/services/Hosted/100YR_Flood/FeatureServer/0",
    "format": "geojson",
    "qualification": "prototype_only",
    "enabled": false,
    "refresh_seconds": 86400,
    "stale_after_seconds": 604800,
    "attribution": "Suffolk County GIS; preserve source_cit from each record",
    "gate": "County reuse, attribution, and update-cadence confirmation",
    "failure_state": "unavailable"
  },
  {
    "id": "coops_kings_point",
    "name": "NOAA CO-OPS Kings Point water level",
    "owner": "NOAA CO-OPS",
    "geographies": [
      "regional"
    ],
    "family": "noaa_coops",
    "endpoint": "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter",
    "format": "json",
    "qualification": "qualified",
    "enabled": true,
    "refresh_seconds": 360,
    "stale_after_seconds": 900,
    "station_id": "8516945",
    "role": "primary",
    "attribution": "NOAA CO-OPS",
    "failure_state": "stale"
  },
  {
    "id": "coops_montauk",
    "name": "NOAA CO-OPS Montauk water level",
    "owner": "NOAA CO-OPS",
    "geographies": [
      "suffolk",
      "regional"
    ],
    "family": "noaa_coops",
    "endpoint": "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter",
    "format": "json",
    "qualification": "qualified",
    "enabled": true,
    "refresh_seconds": 360,
    "stale_after_seconds": 900,
    "station_id": "8510560",
    "role": "primary",
    "attribution": "NOAA CO-OPS",
    "failure_state": "stale"
  },
  {
    "id": "coops_battery_reference",
    "name": "NOAA CO-OPS The Battery water-level reference",
    "owner": "NOAA CO-OPS",
    "geographies": [
      "reference"
    ],
    "family": "noaa_coops",
    "endpoint": "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter",
    "format": "json",
    "qualification": "qualified",
    "enabled": true,
    "refresh_seconds": 360,
    "stale_after_seconds": 900,
    "station_id": "8518750",
    "role": "reference",
    "attribution": "NOAA CO-OPS",
    "failure_state": "stale"
  },
  {
    "id": "coops_sandy_hook_reference",
    "name": "NOAA CO-OPS Sandy Hook water-level reference",
    "owner": "NOAA CO-OPS",
    "geographies": [
      "reference"
    ],
    "family": "noaa_coops",
    "endpoint": "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter",
    "format": "json",
    "qualification": "qualified",
    "enabled": true,
    "refresh_seconds": 360,
    "stale_after_seconds": 900,
    "station_id": "8531680",
    "role": "reference",
    "attribution": "NOAA CO-OPS",
    "failure_state": "stale"
  },
  {
    "id": "usgs_massapequa_creek",
    "name": "USGS Massapequa Creek gauge height",
    "owner": "USGS Water Data",
    "geographies": [
      "nassau"
    ],
    "family": "usgs_ogc",
    "endpoint": "https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items",
    "format": "geojson",
    "qualification": "qualified",
    "enabled": false,
    "refresh_seconds": 900,
    "stale_after_seconds": 3600,
    "monitoring_location_id": "USGS-01309500",
    "parameter_code": "00065",
    "attribution": "USGS Water Data for the Nation",
    "gate": "Phase 3 normalized adapter with an explicit bounded datetime window",
    "failure_state": "stale"
  },
  {
    "id": "usgs_peconic_river",
    "name": "USGS Peconic River gauge height",
    "owner": "USGS Water Data",
    "geographies": [
      "suffolk"
    ],
    "family": "usgs_ogc",
    "endpoint": "https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items",
    "format": "geojson",
    "qualification": "qualified",
    "enabled": false,
    "refresh_seconds": 900,
    "stale_after_seconds": 3600,
    "monitoring_location_id": "USGS-01304500",
    "parameter_code": "00065",
    "attribution": "USGS Water Data for the Nation",
    "gate": "Phase 3 normalized adapter with an explicit bounded datetime window",
    "failure_state": "stale"
  },
  {
    "id": "usgs_rosedale_reference",
    "name": "USGS Conselyeas Pond Tributary reference",
    "owner": "USGS Water Data",
    "geographies": [
      "reference"
    ],
    "family": "usgs_ogc",
    "endpoint": "https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items",
    "format": "geojson",
    "qualification": "qualified",
    "enabled": false,
    "refresh_seconds": 900,
    "stale_after_seconds": 3600,
    "monitoring_location_id": "USGS-01311810",
    "parameter_code": "00065",
    "attribution": "USGS Water Data for the Nation",
    "gate": "Phase 3 normalized adapter with an explicit bounded datetime window",
    "failure_state": "stale"
  },
  {
    "id": "nys_dec_active_sites",
    "name": "NYS DEC active cleanup sites",
    "owner": "NYS Department of Environmental Conservation",
    "geographies": [
      "nassau",
      "suffolk"
    ],
    "family": "arcgis_map_server",
    "endpoint": "https://gisservices.dec.ny.gov/arcgis/rest/services/dil/dil_clean_up/MapServer/2",
    "format": "geojson",
    "qualification": "qualified",
    "enabled": false,
    "refresh_seconds": 86400,
    "stale_after_seconds": 604800,
    "required_filter": "COUNTY IN ('Nassau','Suffolk')",
    "attribution": "NYS Department of Environmental Conservation",
    "disclaimer": "Provided as-is and subject to change without notice",
    "gate": "Phase 3 ArcGIS adapter and county geometry validation",
    "failure_state": "stale"
  },
  {
    "id": "nys_civil_boundaries",
    "name": "NYS county civil boundaries",
    "owner": "NYS ITS Geospatial Data Services",
    "geographies": [
      "regional"
    ],
    "family": "arcgis_feature_server",
    "endpoint": "https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/arcgis/rest/services/NYS_Civil_Boundaries/FeatureServer/2",
    "format": "geojson",
    "qualification": "qualified",
    "enabled": false,
    "refresh_seconds": 86400,
    "stale_after_seconds": 2592000,
    "required_fips": [
      "36059",
      "36103",
      "36081"
    ],
    "attribution": "NYS Office of Information Technology Services Geospatial Data Services",
    "disclaimer": "Provided as-is without warranty",
    "gate": "Phase 3 ArcGIS adapter and FIPS validation",
    "failure_state": "stale"
  },
  {
    "id": "511ny_events",
    "name": "511NY traffic events",
    "owner": "New York State Department of Transportation",
    "geographies": [
      "nassau",
      "suffolk",
      "rockaway"
    ],
    "family": "rest_json",
    "endpoint": "https://www.511ny.org/api/getevents",
    "format": "json",
    "qualification": "access_required",
    "enabled": false,
    "refresh_seconds": 60,
    "stale_after_seconds": 300,
    "credential_requirement": "server_side_developer_key",
    "gate": "Approved account, intended-use approval, access agreement, and server-side key storage",
    "attribution": "511NY / NYSDOT",
    "failure_state": "access_required"
  },
  {
    "id": "mta_lirr_realtime",
    "name": "MTA LIRR realtime",
    "owner": "Metropolitan Transportation Authority",
    "geographies": [
      "nassau",
      "suffolk",
      "rockaway",
      "regional"
    ],
    "family": "gtfs_realtime",
    "endpoint": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr",
    "format": "protobuf",
    "qualification": "qualified",
    "enabled": false,
    "refresh_seconds": 30,
    "stale_after_seconds": 60,
    "access_requirement": "server_side_proxy_cache",
    "gate": "OpenEmber proxy/cache and lag disclosure",
    "attribution": "Metropolitan Transportation Authority",
    "failure_state": "unavailable"
  },
  {
    "id": "mta_ace_realtime",
    "name": "MTA A/C/E realtime",
    "owner": "Metropolitan Transportation Authority",
    "geographies": [
      "rockaway"
    ],
    "family": "gtfs_realtime",
    "endpoint": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
    "format": "protobuf",
    "qualification": "qualified",
    "enabled": false,
    "refresh_seconds": 30,
    "stale_after_seconds": 60,
    "access_requirement": "server_side_proxy_cache",
    "gate": "OpenEmber proxy/cache, route/stop filtering, and lag disclosure",
    "attribution": "Metropolitan Transportation Authority",
    "failure_state": "unavailable"
  },
  {
    "id": "mta_lirr_alerts",
    "name": "MTA LIRR alerts",
    "owner": "Metropolitan Transportation Authority",
    "geographies": [
      "nassau",
      "suffolk",
      "rockaway",
      "regional"
    ],
    "family": "rest_json",
    "endpoint": "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Flirr-alerts.json",
    "format": "json",
    "qualification": "qualified",
    "enabled": false,
    "refresh_seconds": 60,
    "stale_after_seconds": 120,
    "access_requirement": "server_side_proxy_cache",
    "gate": "OpenEmber proxy/cache and lag disclosure",
    "attribution": "Metropolitan Transportation Authority",
    "failure_state": "unavailable"
  },
  {
    "id": "nyhops_reference",
    "name": "NYHOPS maritime forecast reference",
    "owner": "Stevens Institute of Technology",
    "geographies": [
      "regional"
    ],
    "family": "link_only",
    "endpoint": "https://hudson.dl.stevens-tech.edu/maritimeforecast/maincontrol.shtml",
    "format": "html",
    "qualification": "gated",
    "enabled": false,
    "attribution": "Stevens Institute of Technology NYHOPS",
    "gate": "Stable machine-readable contract, cadence, attribution, and redistribution approval",
    "failure_state": "access_required"
  }
];
export const NWS = {
  "office": "OKX",
  "grid_x": 62,
  "grid_y": 50,
  "alert_zone": "NYZ178",
  "obs_stations": [
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
    "id": "8510560",
    "name": "Montauk",
    "lat": 41.0483,
    "lng": -71.9594,
    "role": "primary",
    "flood_thresholds": {
      "action": 3.5,
      "minor": 4.5,
      "moderate": 5.5,
      "major": 7
    }
  },
  {
    "id": "8518750",
    "name": "Battery Park (NYC surge ref)",
    "lat": 40.7003,
    "lng": -74.0141,
    "role": "reference",
    "flood_thresholds": {
      "action": 4.5,
      "minor": 5.5,
      "moderate": 6.5,
      "major": 8.5
    }
  },
  {
    "id": "8531680",
    "name": "Sandy Hook (outer-harbor ref)",
    "lat": 40.4669,
    "lng": -74.0094,
    "role": "reference",
    "flood_thresholds": {
      "action": 4.5,
      "minor": 5.5,
      "moderate": 6.5,
      "major": 8.5
    }
  }
];
export const FLOOD_THRESHOLDS = {
  "8510560": {
    "name": "Montauk",
    "action": 3.5,
    "minor": 4.5,
    "moderate": 5.5,
    "major": 7
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
  },
  "8531680": {
    "name": "Sandy Hook (outer-harbor ref)",
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
    "data": "HURRICANES: Sandy 2012 (Cat 1) — $5.5B LI damage, 13 LI deaths, ~1.1M without power. Primary risk: storm surge (6-10+ ft south shore), not wind. Barrier island overwash possible Cat 2+. 15 tropical systems impacted NYS since 2012; frequency doubled in 6 years (NYS DHSES 2024).\nCOASTAL FLOODING: Great South Bay avg 4ft depth — surge rises rapidly. Combined ocean surge + bay flooding traps south shore mainland. Active live gauges: Kings Point (8516945) and Montauk (8510560). Battery Park (8518750) and Sandy Hook (8531680) are regional references. Fire Island (8515186) and Bay Shore (8515102) are retired as live-water-level stations.\nEXTREME HEAT: Fewer cooling centers per capita than NYC. Nassau protocol at Heat Index >= 95F. Hempstead, Brentwood, Central Islip — reduced cooling access in affordable/senior housing.\nWINTER STORMS / NOREASTERS: Jonas 2016 — 25+ inches Suffolk. LIRR third-rail vulnerable. Route 27 and Route 25 single-road dependency for East End communities.\nHAZMAT: Brookhaven National Laboratory (DOE, Upton) — radiological. Bethpage Grumman groundwater plume (Nassau) — active CERCLA remediation 2025.\n"
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
        "name": "Montauk",
        "lat": 41.0483,
        "lng": -71.9594,
        "note": "NOAA 8510560 — active eastern Long Island water-level station",
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
        "name": "Sandy Hook (outer-harbor ref)",
        "lat": 40.4669,
        "lng": -74.0094,
        "note": "NOAA 8531680 — active outer-harbor reference station",
        "borough": ""
      },
      {
        "name": "Massapequa Creek at Massapequa",
        "lat": 40.689,
        "lng": -73.4554,
        "note": "USGS 01309500 — selected Nassau gauge-height station",
        "borough": ""
      },
      {
        "name": "Peconic River at Riverhead",
        "lat": 40.9137,
        "lng": -72.6869,
        "note": "USGS 01304500 — selected Suffolk gauge-height station",
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
      "id": "erm2-nwe9",
      "name": "NYC 311 Service Requests (Rockaway)",
      "agency": "311",
      "lat_col": "latitude",
      "lng_col": "longitude",
      "label_col": "complaint_type",
      "color": "#60a5fa",
      "icon": "📞",
      "required_filter": "borough = 'QUEENS' AND community_board = '14 QUEENS' AND latitude IS NOT NULL AND longitude IS NOT NULL",
      "desc": "Real-time 311 complaints — Queens Community Board 14, including Broad Channel in the initial implementation"
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
