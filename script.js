// مركز الخريطة (غيّره على حسب موقع المرج / مسطرد)
const INITIAL_VIEW = [30.15, 31.35]; // مثال: قريب من القاهرة
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

// إضافة طبقة المصانع
function addFactoriesLayer(geojson, city) {
  // هنستخدم حقل emissions أو impact لحساب نسبة التأثير
  const impactField = detectImpactField(geojson);
  if (!impactField) {
    console.warn("لم يتم العثور على حقل impact/emissions في البيانات.");
  }

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
      const percent =
        totalImpact > 0 && !isNaN(rawImpact)
          ? ((rawImpact / totalImpact) * 100).toFixed(1)
          : null;

      const popupHtml = buildPopupHtml(props, percent, city);
      layer.bindPopup(popupHtml);

      // فتح البوب أب عند hover
      layer.on("mouseover", () => layer.openPopup());
      layer.on("mouseout", () => layer.closePopup());
    },
  }).addTo(map);

  if (city === "marg") layers.margFactories = layer;
  else layers.mostordFactories = layer;
}

// محاولة اكتشاف اسم حقل التأثير من الخصائص
function detectImpactField(geojson) {
  if (!geojson.features.length) return null;
  const props = geojson.features[0].properties || {};
  if ("emissions" in props) return "emissions";
  if ("impact" in props) return "impact";
  if ("تأثير" in props) return "تأثير";
  // لو عندك اسم تاني للحقل، ضيفه هنا أو عدّل الدالة حسب بياناتك
  return null;
}

// بناء محتوى البوب أب
function buildPopupHtml(props, percent, city) {
  const name =
    props.name || props["اسم المصنع"] || props["factory_name"] || "مصنع بدون اسم";

  let rowsHtml = "";
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === "") continue;
    rowsHtml += `
      <tr>
        <th>${key}</th>
        <td>${value}</td>
      </tr>
    `;
  }

  const percentRow = percent
    ? `
    <tr>
      <th>نسبة التأثير</th>
      <td>${percent}% من إجمالي المصانع في ${city === "marg" ? "المرج" : "مسطرد"}</td>
    </tr>
  `
    : "";

  return `
    <div class="popup">
      <h3>${name}</h3>
      <table>
        <tbody>
          ${rowsHtml}
          ${percentRow}
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

  document.getElementById("total-factories").textContent = totalFactories;
  document.getElementById("total-emissions").textContent =
    totalImpact > 0 ? totalImpact.toLocaleString("en-US") : "–";
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
