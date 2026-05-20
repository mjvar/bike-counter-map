const map = L.map("map").setView([43.69, -79.391085], 12);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  maxZoom: 19,
}).addTo(map);

const layerControl = L.control.layers(null, {}, { collapsed: false }).addTo(map);

const layerTitle = document.createElement("div");
layerTitle.className = "layer-control-title";
layerTitle.textContent = "Map Layers";
layerControl.getContainer().prepend(layerTitle);

// --- Panel ---
const panel        = document.getElementById("panel");
const panelContent = document.getElementById("panel-content");
const panelClose   = document.getElementById("panel-close");

function openPanel(html) {
  panelContent.innerHTML = html;
  panel.classList.add("open");
}

let activeEl = null;

function closePanel() {
  panel.classList.remove("open");
  if (activeEl) { activeEl.classList.remove("active"); activeEl = null; }
}

panelClose.addEventListener("click", closePanel);

// --- Wards ---
fetch("data/City Wards Data - 4326.geojson")
  .then(r => r.json())
  .then(geojson => {
    const wardLabels = L.layerGroup();
    const wardsLayer = L.geoJSON(geojson, {
      style: { color: "#4a90d9", weight: 1, fillColor: "#4a90d9", fillOpacity: 0.2 },
      onEachFeature(feature, layer) {
        const { AREA_SHORT_CODE, AREA_NAME } = feature.properties;
        wardLabels.addLayer(L.marker(layer.getBounds().getCenter(), {
          icon: L.divIcon({
            className: "ward-label",
            html: `Ward ${parseInt(AREA_SHORT_CODE)}<br>${AREA_NAME}`,
            iconSize: [160, 40],
            iconAnchor: [80, 20],
          }),
          interactive: false,
        }));
      },
    });
    layerControl.addOverlay(L.layerGroup([wardsLayer, wardLabels]), "City Wards");
  });

// --- Cycling network ---
fetch("data/cycling-network - 4326.geojson")
  .then(r => r.json())
  .then(geojson => {
    layerControl.addOverlay(
      L.geoJSON(geojson, { style: { color: "#2ecc71", weight: 1.5, opacity: 0.7 } }),
      "Cycling Network"
    );
  });

// --- Counters ---
const directions = ["northbound", "southbound", "eastbound", "westbound"];

function rowAvg(row) {
  const vals = directions.map(d => row[`avg_${d}`]).filter(v => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

function rowPeak(row) {
  return { val: row.peak_combined ?? null, date: row.peak_combined_date ?? null };
}

function counterColor(t) {
  const r = Math.round(220 - 180 * t);
  const g = Math.round(230 - 170 * t);
  const b = Math.round(255 - 80 * t);
  return `rgb(${r},${g},${b})`;
}

// fmt and fmtDate are defined in panel.js

Promise.all([
  fetch("data/cleaned/counters_combined_directions.json").then(r => r.json()),
  fetch("data/cleaned/counters_daily.json").then(r => r.json()),
]).then(([rows, dailyData]) => {
    rows = rows.filter(row => row.latitude && row.longitude);

    const avgs   = rows.map(rowAvg).filter(v => v != null);
    const minAvg = Math.min(...avgs);
    const maxAvg = Math.max(...avgs);

    const SIZE = 44;
    let activeMarker = null;

    const markers = rows.map(row => {
      const avg  = rowAvg(row);
      const peak = rowPeak(row);
      const t    = avg != null ? (avg - minAvg) / (maxAvg - minAvg) : 0;
      const label = avg != null ? (avg >= 1000 ? `${(avg / 1000).toFixed(1)}k` : Math.round(avg).toString()) : "—";

      const textColor = avg != null && avg > 3000 ? "#fff" : "#1a1a2e";
      const icon = L.divIcon({
        className: "",
        html: `<div class="counter-marker" style="width:${SIZE}px;height:${SIZE}px;background:${counterColor(t)};color:${textColor}">${label}</div>`,
        iconSize: [SIZE, SIZE],
        iconAnchor: [SIZE / 2, SIZE / 2],
      });

      const marker = L.marker([row.latitude, row.longitude], { icon });

      marker.bindTooltip(`
        <div class="tip-name">${row.location_name}</div>
        <div class="tip-stats">
          <div class="tip-stat">
            <span class="tip-value">${fmt(avg)}</span>
            <span class="tip-label">daily avg.</span>
          </div>
          <div class="tip-stat">
            <div class="tip-peak-row">
              <span class="tip-value">${fmt(peak.val)}</span>
              <span class="tip-date">${fmtDate(peak.date)}</span>
            </div>
            <span class="tip-label">peak</span>
          </div>
        </div>
      `, { sticky: true });

      marker.on("click", () => {
        if (activeEl) activeEl.classList.remove("active");
        activeMarker = marker;
        activeEl = marker.getElement().querySelector(".counter-marker");
        activeEl.classList.add("active");
        renderPanel(panelContent, row, dailyData[String(row.centreline_id)]);
        panel.classList.add("open");
      });

      return marker;
    });

    const countersLayer = L.layerGroup(markers).addTo(map);
    layerControl.addOverlay(countersLayer, "Bike Counters");
  });
