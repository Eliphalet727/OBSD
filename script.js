const map = L.map('map').setView([25.0376, 121.5148], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);
const drawControl = new L.Control.Draw({
  draw: {
    polyline: { shapeOptions: { color: 'blue', weight: 4, opacity: 0.7 } },
    polygon: { allowIntersection: false, shapeOptions: { color: 'green', weight: 4, opacity: 0.5 } },
    circle: { shapeOptions: { color: 'red', weight: 4, opacity: 0.5 } },
    rectangle: false,
    marker: false,
    circlemarker: false
  },
  edit: { featureGroup: drawnItems, remove: true }
});
map.addControl(drawControl);

map.on(L.Draw.Event.CREATED, function (event) {
  const layer = event.layer;
  drawnItems.addLayer(layer);
  if (layer instanceof L.Circle) {
    const center = layer.getLatLng();
    const radius = layer.getRadius();
    layer.bindPopup(`Center: ${center.toString()}, Radius: ${radius.toFixed(0)} meters`);
  } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
    const distance = layer.getDistance();
    layer.bindPopup(`Distance: ${distance.toFixed(2)} meters`).openPopup();
  } else if (layer instanceof L.Polygon) {
    const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
    const areaKm2 = area / 1000000;
    layer.bindPopup(`Area: ${areaKm2.toFixed(2)} km²`).openPopup();
  }
});
L.Polyline.prototype.getDistance = function() {
  let total = 0;
  for (let i = 0; i < this._latlngs.length - 1; i++) {
    total += this._latlngs[i].distanceTo(this._latlngs[i + 1]);
  }
  return total;
};

const armtsLayer = L.layerGroup().addTo(map);
const mesoLayer = L.layerGroup().addTo(map);
const rainfallLayer = L.layerGroup().addTo(map);

let armtsStations = [], mesoStations = [], rainfallStations = [];
let armtsData = {}, mesoData = {}, rainfallData = {};
const stationMarkers = {}; 

function generatePopupContent(station) {
  let nowPrecip = (station.NowPrecipitation !== null) ? station.NowPrecipitation : "N/A";
  let past1hr = (station.Past1hrPrecipitation !== null) ? station.Past1hrPrecipitation : "N/A";
  return `<strong>${station.StationName} (${station.StationId})</strong><br>
          溫度: ${station.AirTemperature} °C<br>
          濕度: ${station.RelativeHumidity}%<br>
          日累積雨量: ${nowPrecip} mm<br>
          過去1小時雨量: ${past1hr} mm`;
}

function generateLabelContent(station) {
  let nowPrecip = (station.NowPrecipitation !== null) ? station.NowPrecipitation : "N/A";
  let past1hr = (station.Past1hrPrecipitation !== null) ? station.Past1hrPrecipitation : "N/A";
  return `${station.StationName} (${station.StationId})<br>
          ${station.AirTemperature}°C, ${station.RelativeHumidity}%<br>
          日累積雨量: ${nowPrecip} mm, 過去1小時雨量: ${past1hr} mm`;
}

function generateRainfallPopupContent(station) {
  return `<strong>${station.StationName} (${station.StationId})</strong><br>
          日累積雨量: ${station.NowPrecipitation} mm<br>
          過去1小時雨量: ${station.Past1hrPrecipitation} mm`;
}

async function fetchArmtsData() {
  try {
    const response = await fetch('https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=rdec-key-123-45678-011121314&format=JSON');
    const data = await response.json();
    if (data.success === "true") {
      const stations = data.records.Station;
      let highestTemp = -Infinity, lowestTemp = Infinity;
      let highestTempStations = [], lowestTempStations = [];
      let highestHumidity = -Infinity, lowestHumidity = Infinity;
      let highestHumidityStations = [], lowestHumidityStations = [];
      let missingDataStations = [];
      let highestTempTime = "", lowestTempTime = "";
      let highestHumidityTime = "", lowestHumidityTime = "";
      let observationTime = "";

      stations.forEach(station => {
        const stationData = {
          StationName: station.StationName,
          StationId: station.StationId,
          ObsTime: station.ObsTime.DateTime,
          AirTemperature: parseFloat(station.WeatherElement.AirTemperature),
          RelativeHumidity: parseFloat(station.WeatherElement.RelativeHumidity),
          Latitude: parseFloat(station.GeoInfo.Coordinates[1].StationLatitude),
          Longitude: parseFloat(station.GeoInfo.Coordinates[1].StationLongitude),
          NowPrecipitation: null,
          Past1hrPrecipitation: null,
          Source: 'ARMTS'
        };
        armtsStations.push(stationData);

        if (stationData.AirTemperature === -99 || stationData.RelativeHumidity === -99) {
          missingDataStations.push(stationData.StationName);
        }
        if (stationData.AirTemperature !== -99) {
          if (stationData.AirTemperature > highestTemp) {
            highestTemp = stationData.AirTemperature;
            highestTempStations = [stationData.StationName];
            highestTempTime = stationData.ObsTime;
          } else if (stationData.AirTemperature === highestTemp) {
            highestTempStations.push(stationData.StationName);
          }
          if (stationData.AirTemperature < lowestTemp) {
            lowestTemp = stationData.AirTemperature;
            lowestTempStations = [stationData.StationName];
            lowestTempTime = stationData.ObsTime;
          } else if (stationData.AirTemperature === lowestTemp) {
            lowestTempStations.push(stationData.StationName);
          }
        }
        if (stationData.RelativeHumidity !== -99) {
          if (stationData.RelativeHumidity > highestHumidity) {
            highestHumidity = stationData.RelativeHumidity;
            highestHumidityStations = [stationData.StationName];
            highestHumidityTime = stationData.ObsTime;
          } else if (stationData.RelativeHumidity === highestHumidity) {
            highestHumidityStations.push(stationData.StationName);
          }
          if (stationData.RelativeHumidity < lowestHumidity) {
            lowestHumidity = stationData.RelativeHumidity;
            lowestHumidityStations = [stationData.StationName];
            lowestHumidityTime = stationData.ObsTime;
          } else if (stationData.RelativeHumidity === lowestHumidity) {
            lowestHumidityStations.push(stationData.StationName);
          }
        }
        if (!observationTime) {
          observationTime = stationData.ObsTime;
        }
        const marker = L.marker([stationData.Latitude, stationData.Longitude]);
        marker.bindPopup(generatePopupContent(stationData));
        marker.bindTooltip(generateLabelContent(stationData), {
          permanent: true,
          direction: "top",
          offset: [0, -20],
          className: "label-tooltip"
        });
        marker.addTo(armtsLayer);
        stationMarkers[stationData.StationId] = marker;
      });

      if (lowestTemp === Infinity) { lowestTemp = "N/A"; lowestTempStations = ["N/A"]; }
      if (highestHumidity === -Infinity) { highestHumidity = "N/A"; highestHumidityStations = ["N/A"]; highestHumidityTime = "N/A"; }
      if (lowestHumidity === Infinity) { lowestHumidity = "N/A"; lowestHumidityStations = ["N/A"]; lowestHumidityTime = "N/A"; }

      armtsData = {
        stationCount: stations.length,
        highestTemp,
        highestTempStations,
        lowestTemp,
        lowestTempStations,
        highestTempTime,
        lowestTempTime,
        highestHumidity,
        highestHumidityStations,
        lowestHumidity,
        lowestHumidityStations,
        highestHumidityTime,
        lowestHumidityTime,
        missingDataStations: missingDataStations.length === 0 ? "N/A" : missingDataStations.join(", "),
        observationTime
      };
    } else {
      console.error("ARMTS API response failed:", data);
    }
  } catch (error) {
    console.error("Error fetching ARMTS data:", error);
  }
}

async function fetchMesoData() {
  try {
    const response = await fetch('https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001?Authorization=rdec-key-123-45678-011121314&format=JSON');
    const data = await response.json();
    if (data.success === "true") {
      const stations = data.records.Station;
      let highestTemp = -Infinity, lowestTemp = Infinity;
      let highestTempStations = [], lowestTempStations = [];
      let highestHumidity = -Infinity, lowestHumidity = Infinity;
      let highestHumidityStations = [], lowestHumidityStations = [];
      let missingDataStations = [];
      let highestTempTime = "", lowestTempTime = "";
      let highestHumidityTime = "", lowestHumidityTime = "";
      let observationTime = "";

      stations.forEach(station => {
        const stationData = {
          StationName: station.StationName,
          StationId: station.StationId,
          ObsTime: station.ObsTime.DateTime,
          AirTemperature: parseFloat(station.WeatherElement.AirTemperature),
          RelativeHumidity: parseFloat(station.WeatherElement.RelativeHumidity),
          Latitude: parseFloat(station.GeoInfo.Coordinates[0].StationLatitude),
          Longitude: parseFloat(station.GeoInfo.Coordinates[0].StationLongitude),
          NowPrecipitation: null,
          Past1hrPrecipitation: null,
          Source: 'MESO'
        };
        mesoStations.push(stationData);

        if (stationData.AirTemperature === -99 || stationData.RelativeHumidity === -99) {
          missingDataStations.push(stationData.StationName);
        }
        if (stationData.AirTemperature !== -99) {
          if (stationData.AirTemperature > highestTemp) {
            highestTemp = stationData.AirTemperature;
            highestTempStations = [stationData.StationName];
            highestTempTime = stationData.ObsTime;
          } else if (stationData.AirTemperature === highestTemp) {
            highestTempStations.push(stationData.StationName);
          }
          if (stationData.AirTemperature < lowestTemp) {
            lowestTemp = stationData.AirTemperature;
            lowestTempStations = [stationData.StationName];
            lowestTempTime = stationData.ObsTime;
          } else if (stationData.AirTemperature === lowestTemp) {
            lowestTempStations.push(stationData.StationName);
          }
        }
        if (stationData.RelativeHumidity !== -99) {
          if (stationData.RelativeHumidity > highestHumidity) {
            highestHumidity = stationData.RelativeHumidity;
            highestHumidityStations = [stationData.StationName];
            highestHumidityTime = stationData.ObsTime;
          } else if (stationData.RelativeHumidity === highestHumidity) {
            highestHumidityStations.push(stationData.StationName);
          }
          if (stationData.RelativeHumidity < lowestHumidity) {
            lowestHumidity = stationData.RelativeHumidity;
            lowestHumidityStations = [stationData.StationName];
            lowestHumidityTime = stationData.ObsTime;
          } else if (stationData.RelativeHumidity === lowestHumidity) {
            lowestHumidityStations.push(stationData.StationName);
          }
        }
        if (!observationTime) { observationTime = stationData.ObsTime; }
        const marker = L.marker([stationData.Latitude, stationData.Longitude]);
        marker.bindPopup(generatePopupContent(stationData));
        marker.bindTooltip(generateLabelContent(stationData), {
          permanent: true,
          direction: "top",
          offset: [0, -20],
          className: "label-tooltip"
        });
        marker.addTo(mesoLayer);
        stationMarkers[stationData.StationId] = marker;
      });

      if (lowestTemp === Infinity) { lowestTemp = "N/A"; lowestTempStations = ["N/A"]; }
      if (highestHumidity === -Infinity) { highestHumidity = "N/A"; highestHumidityStations = ["N/A"]; highestHumidityTime = "N/A"; }
      if (lowestHumidity === Infinity) { lowestHumidity = "N/A"; lowestHumidityStations = ["N/A"]; lowestHumidityTime = "N/A"; }
      mesoData = {
        stationCount: stations.length,
        highestTemp,
        highestTempStations,
        lowestTemp,
        lowestTempStations,
        highestTempTime,
        lowestTempTime,
        highestHumidity,
        highestHumidityStations,
        lowestHumidity,
        lowestHumidityStations,
        highestHumidityTime,
        lowestHumidityTime,
        missingDataStations: missingDataStations.length === 0 ? "N/A" : missingDataStations.join(", "),
        observationTime
      };
    } else {
      console.error("MESO API response failed:", data);
    }
  } catch (error) {
    console.error("Error fetching MESO data:", error);
  }
}

async function fetchRainfallData() {
  try {
    const response = await fetch('https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0002-001?Authorization=rdec-key-123-45678-011121314&format=JSON');
    const data = await response.json();
    if (data.success === "true") {
      const stations = data.records.Station;
      let highestNowPrecipitation = -Infinity;
      let highestNowPrecipitationStations = [];
      let highestNowPrecipitationTime = "";
      let highestPast1hrPrecipitation = -Infinity;
      let highestPast1hrPrecipitationStations = [];
      let highestPast1hrPrecipitationTime = "";
      let missingDataStations = [];
      let observationTime = "";

      stations.forEach(station => {
        const stationData = {
          StationName: station.StationName,
          StationId: station.StationId,
          ObsTime: station.ObsTime.DateTime,
          Latitude: parseFloat(station.GeoInfo.Coordinates[1].StationLatitude),
          Longitude: parseFloat(station.GeoInfo.Coordinates[1].StationLongitude),
          NowPrecipitation: parseFloat(station.RainfallElement.Now.Precipitation),
          Past1hrPrecipitation: parseFloat(station.RainfallElement.Past1hr.Precipitation),
          AirTemperature: null,
          RelativeHumidity: null,
          Source: 'Rainfall'
        };
        rainfallStations.push(stationData);
        const armtsStation = armtsStations.find(s => s.StationId === stationData.StationId);
        if (armtsStation) {
          armtsStation.NowPrecipitation = stationData.NowPrecipitation;
          armtsStation.Past1hrPrecipitation = stationData.Past1hrPrecipitation;
        }
        const mesoStation = mesoStations.find(s => s.StationId === stationData.StationId);
        if (mesoStation) {
          mesoStation.NowPrecipitation = stationData.NowPrecipitation;
          mesoStation.Past1hrPrecipitation = stationData.Past1hrPrecipitation;
        }
        if (stationData.NowPrecipitation === -998 || stationData.NowPrecipitation === -999 || stationData.NowPrecipitation === null) {
          stationData.NowPrecipitation = 0;
        }
        if (stationData.Past1hrPrecipitation === -998 || stationData.Past1hrPrecipitation === -999 || stationData.Past1hrPrecipitation === null) {
          stationData.Past1hrPrecipitation = 0;
        }
        if (stationData.NowPrecipitation > highestNowPrecipitation) {
          highestNowPrecipitation = stationData.NowPrecipitation;
          highestNowPrecipitationStations = [stationData.StationName];
          highestNowPrecipitationTime = stationData.ObsTime;
        } else if (stationData.NowPrecipitation === highestNowPrecipitation) {
          highestNowPrecipitationStations.push(stationData.StationName);
        }
        if (stationData.Past1hrPrecipitation > highestPast1hrPrecipitation) {
          highestPast1hrPrecipitation = stationData.Past1hrPrecipitation;
          highestPast1hrPrecipitationStations = [stationData.StationName];
          highestPast1hrPrecipitationTime = stationData.ObsTime;
        } else if (stationData.Past1hrPrecipitation === highestPast1hrPrecipitation) {
          highestPast1hrPrecipitationStations.push(stationData.StationName);
        }
        if (!observationTime) { observationTime = stationData.ObsTime; }
        if (!stationMarkers[stationData.StationId]) {
          const marker = L.marker([stationData.Latitude, stationData.Longitude]);
          marker.bindPopup(generateRainfallPopupContent(stationData));
          marker.bindTooltip(generateLabelContent(stationData), {
            permanent: true,
            direction: "top",
            offset: [0, -20],
            className: "label-tooltip"
          });
          marker.addTo(rainfallLayer);
          stationMarkers[stationData.StationId] = marker;
        }
      });
      rainfallData = {
        stationCount: stations.length,
        highestNowPrecipitation: highestNowPrecipitation === -Infinity ? "N/A" : highestNowPrecipitation,
        highestNowPrecipitationStations,
        highestNowPrecipitationTime,
        highestPast1hrPrecipitation: highestPast1hrPrecipitation === -Infinity ? "N/A" : highestPast1hrPrecipitation,
        highestPast1hrPrecipitationStations,
        highestPast1hrPrecipitationTime,
        missingDataStations: missingDataStations.length === 0 ? "N/A" : missingDataStations.join(", "),
        observationTime
      };
    } else {
      console.error("Rainfall API response failed:", data);
    }
  } catch (error) {
    console.error("Error fetching Rainfall data:", error);
  }
}

function updateArmtsRainfallLabels() {
  armtsStations.forEach(station => {
    if (station.NowPrecipitation !== null || station.Past1hrPrecipitation !== null) {
      const popupContent = generatePopupContent(station);
      const tooltipContent = generateLabelContent(station);
      const marker = stationMarkers[station.StationId];
      if (marker) {
        marker.setPopupContent(popupContent);
        marker.setTooltipContent(tooltipContent);
      }
    }
  });
}

function updateMesoRainfallLabels() {
  mesoStations.forEach(station => {
    if (station.NowPrecipitation !== null || station.Past1hrPrecipitation !== null) {
      const popupContent = generatePopupContent(station);
      const tooltipContent = generateLabelContent(station);
      const marker = stationMarkers[station.StationId];
      if (marker) {
        marker.setPopupContent(popupContent);
        marker.setTooltipContent(tooltipContent);
      }
    }
  });
}

function renderArmtsSummary() {
  const container = document.getElementById('armts-summary-content');
  container.innerHTML = `
    <table border="1" style="border-collapse: collapse; width: 100%;">
      <tr><th>測站數量</th><td>${armtsData.stationCount}</td></tr>
      <tr><th>最高溫度</th><td>${armtsData.highestTemp} °C (${armtsData.highestTempStations.join(', ')})</td></tr>
      <tr><th>最低溫度</th><td>${armtsData.lowestTemp} °C (${armtsData.lowestTempStations.join(', ')})</td></tr>
      <tr><th>最高濕度</th><td>${armtsData.highestHumidity}% (${armtsData.highestHumidityStations.join(', ')})</td></tr>
      <tr><th>最低濕度</th><td>${armtsData.lowestHumidity}% (${armtsData.lowestHumidityStations.join(', ')})</td></tr>
      <tr><th>資料缺失</th><td>${armtsData.missingDataStations}</td></tr>
      <tr><th>觀測時間</th><td>${armtsData.observationTime}</td></tr>
    </table>
  `;
}

function renderMesoSummary() {
  const container = document.getElementById('meso-summary-content');
  container.innerHTML = `
    <table border="1" style="border-collapse: collapse; width: 100%;">
      <tr><th>測站數量</th><td>${mesoData.stationCount}</td></tr>
      <tr><th>最高溫度</th><td>${mesoData.highestTemp} °C (${mesoData.highestTempStations.join(', ')})</td></tr>
      <tr><th>最低溫度</th><td>${mesoData.lowestTemp} °C (${mesoData.lowestTempStations.join(', ')})</td></tr>
      <tr><th>最高濕度</th><td>${mesoData.highestHumidity}% (${mesoData.highestHumidityStations.join(', ')})</td></tr>
      <tr><th>最低濕度</th><td>${mesoData.lowestHumidity}% (${mesoData.lowestHumidityStations.join(', ')})</td></tr>
      <tr><th>資料缺失</th><td>${mesoData.missingDataStations}</td></tr>
      <tr><th>觀測時間</th><td>${mesoData.observationTime}</td></tr>
    </table>
  `;
}

function renderRainfallSummary() {
  const container = document.getElementById('rainfall-summary-content');
  container.innerHTML = `
    <table border="1" style="border-collapse: collapse; width: 100%;">
      <tr><th>測站數量</th><td>${rainfallData.stationCount}</td></tr>
      <tr><th>日累積雨量</th><td>${rainfallData.highestNowPrecipitation} mm (${rainfallData.highestNowPrecipitationStations.join(', ')})</td></tr>
      <tr><th>過去1小時雨量</th><td>${rainfallData.highestPast1hrPrecipitation} mm (${rainfallData.highestPast1hrPrecipitationStations.join(', ')})</td></tr>
      <tr><th>資料缺失</th><td>${rainfallData.missingDataStations}</td></tr>
      <tr><th>觀測時間</th><td>${rainfallData.observationTime}</td></tr>
    </table>
  `;
}

function initAccordion() {
  const toggles = document.querySelectorAll('.accordion-toggle');
  toggles.forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      if (!content) return;
      content.style.display = (content.style.display === 'block') ? 'none' : 'block';
    });
  });
}

function searchStation() {
  const searchTerm = document.getElementById('search-box').value.toLowerCase();
  let found = false;
  for (const station of armtsStations) {
    if (station.StationName.toLowerCase().includes(searchTerm) ||
        station.StationId.toLowerCase().includes(searchTerm)) {
      map.setView([station.Latitude, station.Longitude], 15);
      found = true;
      break;
    }
  }
  if (!found) {
    for (const station of mesoStations) {
      if (station.StationName.toLowerCase().includes(searchTerm) ||
          station.StationId.toLowerCase().includes(searchTerm)) {
        map.setView([station.Latitude, station.Longitude], 15);
        found = true;
        break;
      }
    }
  }
  if (!found) {
    for (const station of rainfallStations) {
      if (station.StationName.toLowerCase().includes(searchTerm) ||
          station.StationId.toLowerCase().includes(searchTerm)) {
        map.setView([station.Latitude, station.Longitude], 15);
        found = true;
        break;
      }
    }
  }
  if (!found) { alert('Station not found!'); }
}
document.getElementById('search-button').addEventListener('click', searchStation);
document.getElementById('search-box').addEventListener('keypress', function(event) {
  if (event.key === "Enter") { event.preventDefault(); searchStation(); }
});

document.getElementById('toggle-armts').addEventListener('change', function() {
  if (this.checked) { map.addLayer(armtsLayer); }
  else { map.removeLayer(armtsLayer); }
});
document.getElementById('toggle-meso').addEventListener('change', function() {
  if (this.checked) { map.addLayer(mesoLayer); }
  else { map.removeLayer(mesoLayer); }
});
document.getElementById('toggle-rainfall').addEventListener('change', function() {
  if (this.checked) { map.addLayer(rainfallLayer); }
  else { map.removeLayer(rainfallLayer); }
});

async function initializeMap() {
  await fetchArmtsData();
  await fetchMesoData();
  await fetchRainfallData();
  updateArmtsRainfallLabels();
  updateMesoRainfallLabels();
  renderArmtsSummary();
  renderMesoSummary();
  renderRainfallSummary();
  initAccordion();
  console.log("Data fetched and summaries rendered with layer control!");
}
initializeMap();
