"""Bridge Leaflet overlay controls to Streamlit's public component message API.

Use stable overlay IDs rather than labels, which can duplicate or change.
The st_folium on_change callback applies each event before sidebar widgets run.
"""
from branca.element import MacroElement, Template


class OperationalLayerControl(MacroElement):
    _template = Template(r"""
    {% macro script(this, kwargs) %}
    {% if this.enabled %}
    (function () {
        const map = {{this._parent.get_name()}};
        const overlays = [
          {% for overlay_id, layer in this.overlays.items() %}
          [{{overlay_id | tojson}}, {{layer.get_name()}}],
          {% endfor %}
        ];
        // Folium also schedules a debounced viewport/click update after an
        // overlay event. Carry the latest complete visibility snapshot through
        // every component publication until Python remounts this map, so that
        // update cannot overwrite a toggle (or several quick toggles).
        let pendingVisibility = null;
        const publish = window.Streamlit.setComponentValue.bind(window.Streamlit);
        window.Streamlit.setComponentValue = function (value) {
            publish(pendingVisibility ? {...value, overlay_event: pendingVisibility} : value);
        };
        function visibilityChanged(event) {
            const entry = overlays.find(([id, layer]) => layer === event.layer);
            if (!entry) return;
            map.closePopup();
            const center = map.getCenter();
            pendingVisibility = {
                visibility: Object.fromEntries(overlays.map(([id, layer]) => [id, map.hasLayer(layer)]))
            };
            window.Streamlit.setComponentValue({
                center: {lat: center.lat, lng: center.lng},
                zoom: map.getZoom()
            });
        }
        map.on("overlayadd overlayremove", visibilityChanged);
    })();
    {% endif %}
    {% endmacro %}
    """)

    def __init__(self, overlays, enabled=True):
        super().__init__()
        self._name = "OperationalLayerControl"
        self.overlays = overlays
        self.enabled = enabled
