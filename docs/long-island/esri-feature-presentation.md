# ESRI Feature Layer presentation contract

The Streamlit operational map and ArcGIS Map Builder now use one metadata-driven presentation contract for public ArcGIS Feature Layers.

## Behavior

- FeatureServer roots are inspected before use. If a service contains multiple Feature Layers, the user chooses one or more sublayers instead of the app assuming layer `0`.
- Layer metadata is cached for one hour and records field aliases, coded-value domains, subtype domains, renderer fields, and the object/display fields.
- Automatic hover labels prefer a human-readable string field used by the renderer, followed by a string display/type field and semantic name/title/route fields.
- Each layer exposes an optional label override. The override changes both the hover label and popup title without re-fetching data.
- Click popups work for points, lines, and polygons. They show the eight highest-priority useful attributes first, using aliases and decoded domain values, with remaining attributes in an expandable section.
- Object IDs, geometry measurements, GUIDs, and empty values are omitted from useful attributes.
- If metadata cannot be loaded, the operational map infers a conservative contract from returned properties and continues with layer-name fallback labels.

## Regression fixture

`fixtures/esri/lirr-branches.json` represents the public LIRR branches service, whose Feature Layer is ID `4`. Its numeric `route_id` display field previously caused numeric tooltips because it was the first returned attribute. The renderer's string `route_long` field is now selected automatically and displayed with its `Rail Line Name` alias.

## Scope

This contract applies to ArcGIS Feature Layers. Map, imagery, and vector-tile services continue to use the ArcGIS SDK's native presentation because they do not expose the same per-feature field contract.
