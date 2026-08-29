"""Curated, public ArcGIS quick-add layers for the Streamlit Map Builder."""


LIVING_ATLAS_PRESETS = [
    {
        "name": "USA Flood Hazard Areas (FEMA)",
        "url": "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0",
        "type": "Feature Layer",
        "source": "FEMA / ArcGIS Living Atlas",
        "color": "#60a5fa",
    },
    {
        "name": "Historical Hurricane Tracks (NOAA/IBTrACS)",
        "url": "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/IBTrACS_ALL_list_v04r00_lines_1/FeatureServer/0",
        "type": "Feature Layer",
        "source": "NOAA / Esri U.S. Federal Datasets",
        "color": "#f87171",
    },
    {
        "name": "USA Hospitals/Medical Centers (USGS)",
        "url": "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Structures_Medical_Emergency_Response_v1/FeatureServer/0",
        "type": "Feature Layer",
        "source": "USGS / Esri U.S. Federal Datasets",
        "color": "#34d399",
    },
    {
        "name": "USA Fire/EMS Stations (USGS)",
        "url": "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Structures_Medical_Emergency_Response_v1/FeatureServer/2",
        "type": "Feature Layer",
        "source": "USGS / Esri U.S. Federal Datasets",
        "color": "#fb923c",
    },
    {
        "name": "FEMA Disaster Declaration Totals (2000–2025)",
        "url": "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/Total_FEMA_Disaster_Declarations_2000_2021/FeatureServer/0",
        "type": "Feature Layer",
        "source": "FEMA ArcGIS Online",
        "color": "#facc15",
    },
    {
        "name": "World Imagery",
        "url": "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
        "type": "Map Service",
        "source": "Esri World Imagery",
        "color": "#a78bfa",
    },
]
