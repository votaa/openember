"""
setup_wizard.py — EMBER Jurisdiction Setup Wizard

Renders a multi-section Streamlit form that collects all jurisdiction config
and writes/updates config/jurisdiction.yaml.
"""

import streamlit as st
import yaml
from pathlib import Path
from config_loader import (
    save_config, load_config, get_example_yaml,
    discover_nws_office, discover_coops_stations,
    config_exists, _DEFAULT_CFG,
)


def render_wizard():
    """Render the full setup wizard. Called from app.py inside with tab_setup:"""

    st.markdown("## ⚙️ Jurisdiction Setup Wizard")
    st.markdown(
        "Configure EMBER for your municipality. Complete each section below. "
        "Your answers are saved to `config/jurisdiction.yaml` and take effect immediately on next reload."
    )

    # Load existing config as starting values if it exists
    existing = {}
    if config_exists():
        with open(_DEFAULT_CFG) as f:
            existing = yaml.safe_load(f) or {}

    def ex(section, key, default=""):
        return existing.get(section, {}).get(key, default)

    changed = False  # Track whether to show save button

    # ── Section 1: Basic Jurisdiction Info ─────────────────────────────────────
    with st.expander("📍 Step 1 — Basic Jurisdiction Info", expanded=not config_exists()):
        st.caption("Core information about your jurisdiction that drives all data queries and map defaults.")

        col1, col2 = st.columns(2)
        with col1:
            j_name       = st.text_input("Jurisdiction Name *",  value=ex("jurisdiction","name","City of Example"), help="Full display name, e.g. 'City of Baltimore'")
            j_short      = st.text_input("Short Name",           value=ex("jurisdiction","short_name","Example"),  help="Abbreviation for headers, e.g. 'Baltimore'")
            j_state      = st.text_input("State Code *",         value=ex("jurisdiction","state","NY"),            help="Two-letter state code, e.g. NY, MD, CA").upper()
            j_state_full = st.text_input("State Full Name",      value=ex("jurisdiction","state_full","New York"))
        with col2:
            j_county  = st.text_input("Primary County",          value=ex("jurisdiction","county",""))
            j_lat     = st.number_input("Center Latitude *",     value=float(ex("jurisdiction","center_lat", 40.7128)), format="%.4f", step=0.0001)
            j_lng     = st.number_input("Center Longitude *",    value=float(ex("jurisdiction","center_lng",-74.0060)), format="%.4f", step=0.0001)
            j_zoom    = st.slider("Default Map Zoom",             value=int(ex("jurisdiction","zoom_default",11)), min_value=8, max_value=15)

        st.markdown("**Bounding Box** (used for CO-OPS station discovery)")
        bc1, bc2, bc3, bc4 = st.columns(4)
        with bc1: j_north = st.number_input("North", value=float(ex("jurisdiction","bbox_north", j_lat+0.5)), format="%.3f")
        with bc2: j_south = st.number_input("South", value=float(ex("jurisdiction","bbox_south", j_lat-0.5)), format="%.3f")
        with bc3: j_east  = st.number_input("East",  value=float(ex("jurisdiction","bbox_east",  j_lng+0.5)), format="%.3f")
        with bc4: j_west  = st.number_input("West",  value=float(ex("jurisdiction","bbox_west",  j_lng-0.5)), format="%.3f")

        j_tz = st.selectbox("Timezone", [
            "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
            "America/Anchorage","Pacific/Honolulu","America/Puerto_Rico",
        ], index=["America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
                  "America/Anchorage","Pacific/Honolulu","America/Puerto_Rico"].index(
            ex("jurisdiction","timezone","America/New_York")
        ))

    # ── Section 2: NWS Discovery ───────────────────────────────────────────────
    with st.expander("🌩 Step 2 — National Weather Service", expanded=False):
        st.caption("EMBER uses the NWS API for alerts, forecasts, and observations. It can auto-discover your office and grid coordinates.")

        if st.button("🔍 Auto-Discover NWS Office from Coordinates", key="wiz_discover_nws"):
            with st.spinner(f"Querying NWS API for {j_lat:.4f}, {j_lng:.4f}…"):
                result = discover_nws_office(j_lat, j_lng)
            if result:
                st.success(f"Found: Office **{result['office']}**, Grid ({result['grid_x']}, {result['grid_y']}), Zone **{result['alert_zone']}**")
                st.session_state["_wiz_nws"] = result
            else:
                st.error("Could not reach NWS API. Enter values manually below.")

        nws_prev = st.session_state.get("_wiz_nws", {})
        nc1, nc2, nc3 = st.columns(3)
        with nc1: nws_office = st.text_input("NWS Office ID *", value=nws_prev.get("office", ex("nws","office","OKX")), help="e.g. OKX, LWX, LOT, MFR").upper()
        with nc2: nws_gx     = st.number_input("Grid X *",      value=int(nws_prev.get("grid_x", ex("nws","grid_x",33))), min_value=0, max_value=200)
        with nc3: nws_gy     = st.number_input("Grid Y *",      value=int(nws_prev.get("grid_y", ex("nws","grid_y",37))), min_value=0, max_value=200)

        nws_zone = st.text_input("Alert Zone ID", value=nws_prev.get("alert_zone", ex("nws","alert_zone","")), help="e.g. NYZ178 — find at weather.gov/youroffice")

        st.markdown("**Observation Stations** (ASOS/AWOS — ICAO codes)")
        st.caption("These are the airport/weather stations used for live wind obs on the map. Add up to 6.")
        existing_obs = ex("nws", "obs_stations", [])
        obs_stations = []
        for idx in range(6):
            prev = existing_obs[idx] if idx < len(existing_obs) else {}
            oc1, oc2, oc3, oc4 = st.columns([2, 3, 2, 2])
            with oc1: sid  = st.text_input(f"ICAO {idx+1}",  value=prev.get("id",""),   key=f"obs_id_{idx}",  placeholder="KBWI").upper()
            with oc2: snam = st.text_input(f"Name {idx+1}",  value=prev.get("name",""), key=f"obs_nm_{idx}",  placeholder="BWI Airport")
            with oc3: slat = st.number_input(f"Lat {idx+1}", value=float(prev.get("lat",0)), key=f"obs_lat_{idx}", format="%.4f")
            with oc4: slng = st.number_input(f"Lng {idx+1}", value=float(prev.get("lng",0)), key=f"obs_lng_{idx}", format="%.4f")
            if sid:
                obs_stations.append({"id": sid, "name": snam, "lat": slat, "lng": slng})

    # ── Section 3: CO-OPS Tidal Gauges ────────────────────────────────────────
    with st.expander("🌊 Step 3 — CO-OPS Tidal Gauges", expanded=False):
        st.caption("Water level gauges power the live map layer and flood status strip. EMBER can discover nearby stations automatically.")

        if st.button("🔍 Auto-Discover CO-OPS Stations in Bounding Box", key="wiz_discover_coops"):
            bbox = {"north": j_north, "south": j_south, "east": j_east, "west": j_west}
            with st.spinner("Querying CO-OPS Metadata API…"):
                found = discover_coops_stations(bbox, limit=8)
            if found:
                st.success(f"Found {len(found)} station(s) in your bounding box")
                st.session_state["_wiz_coops"] = found
                for s in found:
                    st.markdown(f"- `{s['id']}` — **{s['name']}** ({s['lat']:.4f}, {s['lng']:.4f})")
            else:
                st.warning("No CO-OPS stations found in bounding box. Try expanding it, or enter station IDs manually.")
                st.caption("Find stations at: [tidesandcurrents.noaa.gov/map](https://tidesandcurrents.noaa.gov/map/)")

        auto_coops = st.session_state.get("_wiz_coops", [])
        existing_coops = existing.get("coops_stations", [])
        base_coops = auto_coops if auto_coops else existing_coops

        st.markdown("**Configure Stations** (up to 8)")
        coops_stations = []
        for idx in range(min(8, max(len(base_coops), 2))):
            prev = base_coops[idx] if idx < len(base_coops) else {}
            prev_thresh = prev.get("flood_thresholds", {})
            with st.container():
                st.markdown(f"**Station {idx+1}**")
                gc1, gc2, gc3, gc4 = st.columns([2, 3, 2, 2])
                with gc1: gid  = st.text_input(f"Station ID",  value=prev.get("id",""),   key=f"coops_id_{idx}")
                with gc2: gnam = st.text_input(f"Name",        value=prev.get("name",""), key=f"coops_nm_{idx}")
                with gc3: glat = st.number_input("Lat",        value=float(prev.get("lat",0)), key=f"coops_lat_{idx}", format="%.4f")
                with gc4: glng = st.number_input("Lng",        value=float(prev.get("lng",0)), key=f"coops_lng_{idx}", format="%.4f")

                ft1, ft2, ft3, ft4, ft5 = st.columns([1,1,1,1,2])
                with ft1: fa = st.number_input("Action (ft)", value=float(prev_thresh.get("action",4.5)), key=f"coops_fa_{idx}", format="%.1f", step=0.5)
                with ft2: fm = st.number_input("Minor (ft)",  value=float(prev_thresh.get("minor",5.5)),  key=f"coops_fm_{idx}", format="%.1f", step=0.5)
                with ft3: fo = st.number_input("Moderate",    value=float(prev_thresh.get("moderate",6.5)),key=f"coops_fo_{idx}", format="%.1f", step=0.5)
                with ft4: fj = st.number_input("Major (ft)",  value=float(prev_thresh.get("major",8.5)),  key=f"coops_fj_{idx}", format="%.1f", step=0.5)
                with ft5: is_pri = st.checkbox("Primary gauge", value=prev.get("is_primary", idx==0), key=f"coops_pri_{idx}")
                st.markdown("---")

                if gid:
                    coops_stations.append({
                        "id":         gid,
                        "name":       gnam,
                        "lat":        glat,
                        "lng":        glng,
                        "is_primary": is_pri,
                        "flood_thresholds": {"action": fa, "minor": fm, "moderate": fo, "major": fj},
                    })

    # ── Section 4: Knowledge Base ──────────────────────────────────────────────
    with st.expander("📚 Step 4 — Knowledge Base Text", expanded=False):
        st.caption("These text blocks are what the AI draws on when answering queries. Be specific — include actual zone names, street names, and operational details.")

        kb_sections = {
            "flood_zones":             ("Flood Zones",             "Describe FEMA flood zone designations for your jurisdiction. Include zone types (A, AE, VE, X), key affected areas, and any notable flood events."),
            "evac_zones":              ("Evacuation Zones",        "Describe your evacuation zone system. Include zone names, trigger conditions, shelter locations, and contraflow routes."),
            "critical_infrastructure": ("Critical Infrastructure", "List hospitals (with trauma level), power substations, water/wastewater plants, transit hubs, airports. Note any in flood zones."),
            "hazard_profiles":         ("Hazard Profiles",         "Describe primary hazards: hurricanes, flooding, extreme heat, winter storms, earthquake, hazmat, etc. Include historical events."),
            "resources":               ("Contacts & Resources",    "Emergency management office, fire, police, public health, utilities, state EM agency, FEMA region, emergency alert signup."),
        }

        kb_values = {}
        for key, (label, placeholder) in kb_sections.items():
            prev_text = existing.get("knowledge_base", {}).get(key, "")
            kb_values[key] = st.text_area(
                label, value=prev_text, height=150,
                placeholder=placeholder, key=f"wiz_kb_{key}",
                help=f"Write plain text — no markdown needed."
            )

    # ── Section 5: Map Points ─────────────────────────────────────────────────
    with st.expander("📍 Step 5 — Map Points", expanded=False):
        st.caption("Static markers that always appear on the operational map. Add your hospitals, shelters, EOC locations, and flood risk areas.")
        st.info("For large numbers of locations, consider using the Open Data / Socrata tab to pull them dynamically instead of hardcoding here.")

        map_categories = {
            "hospitals":  ("Hospitals / Trauma Centers", "#f87171", "🏥"),
            "shelters":   ("Evacuation Shelters",         "#60a5fa", "🏫"),
            "eoc":        ("EOC / Command Posts",         "#facc15", "🏛"),
            "flood_risk": ("High Flood Risk Areas",       "#fb923c", "💧"),
        }

        map_points_out = {}
        for cat_key, (cat_label, cat_color, cat_icon) in map_categories.items():
            st.markdown(f"**{cat_icon} {cat_label}**")
            existing_feats = existing.get("map_points", {}).get(cat_key, {}).get("features", [])

            features_out = []
            for fi in range(max(len(existing_feats), 1)):
                prev_f = existing_feats[fi] if fi < len(existing_feats) else {}
                mc1, mc2, mc3, mc4 = st.columns([3, 2, 2, 3])
                with mc1: fn   = st.text_input("Name",     value=prev_f.get("name",""), key=f"{cat_key}_name_{fi}")
                with mc2: flat = st.number_input("Lat",    value=float(prev_f.get("lat",0)), key=f"{cat_key}_lat_{fi}", format="%.4f")
                with mc3: flng = st.number_input("Lng",    value=float(prev_f.get("lng",0)), key=f"{cat_key}_lng_{fi}", format="%.4f")
                with mc4: fnot = st.text_input("Note",     value=prev_f.get("note",""), key=f"{cat_key}_note_{fi}")
                if fn:
                    features_out.append({"name": fn, "lat": flat, "lng": flng, "note": fnot})

            if st.button(f"+ Add {cat_label} row", key=f"add_{cat_key}"):
                existing.setdefault("map_points", {}).setdefault(cat_key, {}).setdefault("features", []).append({})
                st.rerun()

            map_points_out[cat_key] = {
                "label": cat_label, "color": cat_color, "icon": cat_icon,
                "features": features_out,
            }

    # ── Section 6: Socrata / Open Data ────────────────────────────────────────
    with st.expander("🗽 Step 6 — Open Data Portal", expanded=False):
        st.caption("Configure your municipality's Socrata open data domain. This unlocks the  Open Data tab for your city's datasets.")

        soc_domain = st.text_input(
            "Socrata Domain",
            value=ex("socrata","domain","opendata.suffolkcountyny.gov"),
            help="e.g. data.baltimorecity.gov · data.cityofchicago.org · data.sfgov.org · data.seattle.gov"
        )

        st.caption("Find your city's domain at [data.cityofnewyork.us](https://data.cityofnewyork.us) or search at [opendatanetwork.com](https://opendatanetwork.com)")

    # ── Section 7: Branding ───────────────────────────────────────────────────
    with st.expander("🎨 Step 7 — Branding", expanded=False):
        bc1, bc2 = st.columns(2)
        with bc1:
            b_title    = st.text_input("App Title",          value=ex("branding","app_title","EMBER"))
            b_subtitle = st.text_input("App Subtitle",       value=ex("branding","app_subtitle","Emergency Management Body of Evidence & Resources"))
            b_jline    = st.text_input("Jurisdiction Line",  value=ex("branding","jurisdiction_line",f"{j_short} JURISDICTION"))
        with bc2:
            b_color = st.color_picker("Primary Accent Color", value=ex("branding","primary_color","#e8372c"))
            b_emoji = st.text_input("Logo Emoji",             value=ex("branding","logo_emoji","🚨"),
                                    help="Single emoji shown in browser tab")

    # ── Save ───────────────────────────────────────────────────────────────────
    st.divider()
    col_save, col_dl, col_reset = st.columns([2, 2, 1])

    with col_save:
        if st.button("💾 Save Configuration", type="primary", use_container_width=True):
            config_data = {
                "jurisdiction": {
                    "name":         j_name,
                    "short_name":   j_short,
                    "state":        j_state,
                    "state_full":   j_state_full,
                    "county":       j_county,
                    "center_lat":   j_lat,
                    "center_lng":   j_lng,
                    "bbox_north":   j_north,
                    "bbox_south":   j_south,
                    "bbox_east":    j_east,
                    "bbox_west":    j_west,
                    "timezone":     j_tz,
                    "zoom_default": j_zoom,
                },
                "nws": {
                    "office":       nws_office,
                    "grid_x":       int(nws_gx),
                    "grid_y":       int(nws_gy),
                    "alert_zone":   nws_zone,
                    "obs_stations": obs_stations,
                },
                "coops_stations": coops_stations,
                "knowledge_base": kb_values,
                "map_points":     map_points_out,
                "socrata": {
                    "domain":          soc_domain,
                    "preset_datasets": ex("socrata","preset_datasets",[]),
                },
                "noaa": {
                    "alert_state": j_state,
                    "usgs_state":  j_state,
                    "fema_state":  j_state,
                },
                "branding": {
                    "app_title":         b_title,
                    "app_subtitle":      b_subtitle,
                    "jurisdiction_line": b_jline,
                    "primary_color":     b_color,
                    "logo_emoji":        b_emoji,
                },
            }
            try:
                saved_path = save_config(config_data)
                st.success(f"✓ Saved to `{saved_path}`. Reload the page to apply your configuration.")
                st.balloons()
            except Exception as e:
                st.error(f"Save failed: {e}")

    with col_dl:
        # Download current config as YAML
        if config_exists():
            with open(_DEFAULT_CFG) as f:
                yaml_str = f.read()
            st.download_button(
                "⬇ Download jurisdiction.yaml",
                data=yaml_str,
                file_name="jurisdiction.yaml",
                mime="text/yaml",
                use_container_width=True,
            )

    with col_reset:
        if st.button("↺ Reset to NYC", use_container_width=True,
                     help="Revert to the built-in NYC configuration"):
            nyc_path = Path(__file__).parent.parent / "config" / "jurisdiction.yaml"
            # The NYC yaml is the default — just reload
            st.session_state["_wiz_nws"] = {}
            st.session_state["_wiz_coops"] = []
            st.rerun()

    st.divider()

    # ── Upload existing YAML ───────────────────────────────────────────────────
    st.markdown("**Or upload an existing `jurisdiction.yaml`**")
    uploaded = st.file_uploader("Upload jurisdiction.yaml", type=["yaml","yml"], key="yaml_upload")
    if uploaded:
        try:
            content = yaml.safe_load(uploaded.read().decode())
            save_config(content)
            st.success("✓ Config uploaded and saved. Reload to apply.")
        except Exception as e:
            st.error(f"Invalid YAML: {e}")

    # ── Template download ──────────────────────────────────────────────────────
    example = get_example_yaml()
    if example:
        st.markdown("**Download the blank template to fill out offline:**")
        st.download_button(
            "⬇ Download jurisdiction.example.yaml",
            data=example,
            file_name="jurisdiction.example.yaml",
            mime="text/yaml",
        )
