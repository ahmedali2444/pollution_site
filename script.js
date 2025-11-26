// مركز الخريطة (قريب من المرج / مسطرد)
const INITIAL_VIEW = [30.15, 31.35];
const INITIAL_ZOOM = 12;

// إنشاء الخريطة + الـ basemap
const map = L.map("map", {
  zoomControl: true,
  attributionControl: true,
}).setView(INITIAL_VIEW, INITIAL_ZOOM);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

// Layers containers
const layers = {
  margBoundary: null,
  mostordBoundary: null,
  margFactories: null,
  mostordFactories: null,
};

// نجيب البيانات من ملفات GeoJSON
async function loadData() {
  try {
    const [
      margBoundary,
      mostordBoundary,
      margFactories,
      mostordFactories,
    ] = await Promise.all([
      fetch("data/marg_boundary.geojson").then((r) => r.json()),
      fetch("data/mostord_boundary.geojson").then((r) => r.json()),
      fetch("data/marg_factories.geojson").then((r) => r.json()),
      fetch("data/mostord_factories.geojson").then((r) => r.json()),
    ]);

    addCityBoundary(margBoundary, "marg");
    addCityBoundary(mostordBoundary, "mostord");

    addFactoriesLayer(margFactories, "marg");
    addFactoriesLayer(mostordFactories, "mostord");

    updateSummaryStats(margFactories, mostordFactories);
    fitMapToData();
  } catch (err) {
    console.error("Error loading data:", err);
    alert("حدث خطأ أثناء تحميل البيانات. تأكد من مسارات الملفات.");
  }
}

// إضافة حدود المدن
function addCityBoundary(geojson, city) {
  const style =
    city === "marg"
      ? {
          color: "#3b82f6",
          weight: 2,
          fillColor: "#3b82f6",
          fillOpacity: 0.15,
        }
      : {
          color: "#ec4899",
          weight: 2,
          fillColor: "#ec4899",
          fillOpacity: 0.15,
        };

  const layer = L.geoJSON(geojson, { style }).addTo(map);

  if (city === "marg") layers.margBoundary = layer;
  else layers.mostordBoundary = layer;
}

// تحديد حقل التأثير (الإجمالي) من خصائص البيانات
function detectImpactField(geojson) {
  if (!geojson.features.length) return null;
  const props = geojson.features[0].properties || {};
  if ("total_emissions" in props) return "total_emissions";
  if ("emissions" in props) return "emissions";
  if ("impact" in props) return "impact";
  if ("تأثير" in props) return "تأثير";
  return null;
}

// إضافة طبقة المصانع
function addFactoriesLayer(geojson, city) {
  const impactField = detectImpactField(geojson);
  const cityLabel = city === "marg" ? "المرج" : "مسطرد";

  const totalImpact = geojson.features.reduce((sum, f) => {
    const val = Number(f.properties?.[impactField] ?? 0);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const markerOptions =
    city === "marg"
      ? { radius: 6, color: "#1d4ed8", fillColor: "#3b82f6" }
      : { radius: 6, color: "#be185d", fillColor: "#ec4899" };

  const layer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) => {
      return L.circleMarker(latlng, {
        ...markerOptions,
        weight: 1,
        fillOpacity: 0.9,
      });
    },
    onEachFeature: (feature, layer) => {
      const props = feature.properties || {};

      const rawImpact = Number(props[impactField] ?? 0);
      const percentOfCity =
        totalImpact > 0 && !isNaN(rawImpact)
          ? ((rawImpact / totalImpact) * 100).toFixed(2)
          : null;

      const popupHtml = buildPopupHtml(props, percentOfCity, cityLabel);
      layer.bindPopup(popupHtml);

      // فتح البوب أب عند hover
      layer.on("mouseover", () => layer.openPopup());
      layer.on("mouseout", () => layer.closePopup());
    },
  }).addTo(map);

  if (city === "marg") layers.margFactories = layer;
  else layers.mostordFactories = layer;
}

// بناء محتوى البوب أب: يعرض الغازات + إجمالي الانبعاثات + نسبة المصنع من المنطقة
function buildPopupHtml(props, percentOfCity, cityLabel) {
  const name =
    props.name ||
    props["اسم المصنع"] ||
    props["factory_name"] ||
    "مصنع بدون اسم";

  const ch4 = props.CH4 ?? props["CH4"];
  const co = props.CO ?? props["CO"];
  const no2 = props.NO2 ?? props["NO2"];
  const o3 = props.O3 ?? props["O3"];
  const so2 = props.SO2 ?? props["SO2"];
  const total = props.total_emissions ?? props.emissions ?? null;

  const rows = [];

  if (ch4 !== undefined) rows.push(`<tr><th>CH₄</th><td>${Number(ch4).toFixed(3)}</td></tr>`);
  if (co !== undefined) rows.push(`<tr><th>CO</th><td>${Number(co).toFixed(6)}</td></tr>`);
  if (no2 !== undefined) rows.push(`<tr><th>NO₂</th><td>${Number(no2).toFixed(6)}</td></tr>`);
  if (o3 !== undefined) rows.push(`<tr><th>O₃</th><td>${Number(o3).toFixed(6)}</td></tr>`);
  if (so2 !== undefined) rows.push(`<tr><th>SO₂</th><td>${Number(so2).toFixed(6)}</td></tr>`);

  if (total !== null) {
    rows.push(
      `<tr><th>إجمالي الانبعاثات</th><td>${Number(total).toFixed(3)}</td></tr>`
    );
  }

  if (percentOfCity !== null) {
    rows.push(
      `<tr><th>نسبة التلوث داخل ${cityLabel}</th><td>${percentOfCity}%</td></tr>`
    );
  }

  return `
    <div class="popup">
      <h3>${name}</h3>
      <p class="popup-city">المنطقة: ${cityLabel}</p>
      <table class="popup-table">
        <tbody>
          ${rows.join("")}
        </tbody>
      </table>
    </div>
  `;
}

// تحديث الأرقام في البانل (عدد المصانع + إجمالي الانبعاثات)
function updateSummaryStats(margFactories, mostordFactories) {
  const allFeatures = [
    ...margFactories.features,
    ...mostordFactories.features,
  ];
  const totalFactories = allFeatures.length;

  const impactField =
    detectImpactField(margFactories) || detectImpactField(mostordFactories);

  const totalImpact = allFeatures.reduce((sum, f) => {
    const val = Number(f.properties?.[impactField] ?? 0);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const totalFactoriesEl = document.getElementById("total-factories");
  const totalEmissionsEl = document.getElementById("total-emissions");

  if (totalFactoriesEl) totalFactoriesEl.textContent = totalFactories;
  if (totalEmissionsEl)
    totalEmissionsEl.textContent =
      totalImpact > 0 ? totalImpact.toFixed(2) : "–";
}

// ظبط مدى الخريطة على كل الطبقات
function fitMapToData() {
  const group = L.featureGroup(
    Object.values(layers)
      .filter(Boolean)
      .map((l) => l)
  );
  if (group.getLayers().length) {
    map.fitBounds(group.getBounds().pad(0.1));
  }
}

// بدء التحميل
loadData();