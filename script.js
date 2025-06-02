// --- 圖示定義 ---
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
const orangeIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// --- 全域變數 ---
let allStations = {}; // 儲存所有測站資料的物件
const stationMarkers = {}; // 儲存所有測站 L.marker 物件，以 stationId 為鍵
let tempPlacemark = null; // 用於儲存臨時搜尋座標產生的標記

// --- 地圖初始化 ---
const map = L.map('map').setView([25.0376, 121.5148], 15); // 預設視圖中心與縮放級別
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// --- 繪圖工具初始化 ---
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

// 繪圖事件處理
map.on(L.Draw.Event.CREATED, function (event) {
  const layer = event.layer;
  drawnItems.addLayer(layer);
  if (layer instanceof L.Circle) {
    const center = layer.getLatLng();
    const radius = layer.getRadius();
    layer.bindPopup(`中心點: ${center.toString()}, 半徑: ${radius.toFixed(0)} 公尺`);
  } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
    const distance = layer.getDistance(); // 使用自訂的 getDistance 方法
    layer.bindPopup(`距離: ${distance.toFixed(2)} 公尺`).openPopup();
  } else if (layer instanceof L.Polygon) {
    const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
    const areaKm2 = area / 1000000;
    layer.bindPopup(`面積: ${areaKm2.toFixed(2)} 平方公里`).openPopup();
  }
});

// 為 L.Polyline 擴展 getDistance 方法
L.Polyline.prototype.getDistance = function() {
  let total = 0;
  const latlngs = this.getLatLngs(); // 使用 getLatLngs() 而非 _latlngs
  for (let i = 0; i < latlngs.length - 1; i++) {
    total += latlngs[i].distanceTo(latlngs[i + 1]);
  }
  return total;
};

// --- 圖層組定義 ---
const armtsLayer = L.layerGroup().addTo(map);
const mesoLayer = L.layerGroup().addTo(map);
const rainfallLayer = L.layerGroup().addTo(map);

// --- 資料陣列與物件 ---
let armtsStations = [], mesoStations = [], rainfallStations = [];
let armtsData = {}, mesoData = {}, rainfallData = {};

// --- 彈出視窗與標籤內容生成函數 ---
function generatePopupContent(station) {
  let nowPrecip = (station.NowPrecipitation !== null && station.NowPrecipitation !== -99) ? station.NowPrecipitation : "N/A";
  let past1hr = (station.Past1hrPrecipitation !== null && station.Past1hrPrecipitation !== -99) ? station.Past1hrPrecipitation : "N/A";
  return `<strong>${station.StationName} (${station.StationId})</strong><br>
          溫度: ${station.AirTemperature !== -99 ? station.AirTemperature : "N/A"} °C<br>
          濕度: ${station.RelativeHumidity !== -99 ? station.RelativeHumidity : "N/A"}%<br>
          日累積雨量: ${nowPrecip} mm<br>
          過去1小時雨量: ${past1hr} mm`;
}

function generateLabelContent(station) {
  let nowPrecip = (station.NowPrecipitation !== null && station.NowPrecipitation !== -99) ? station.NowPrecipitation : "N/A";
  let past1hr = (station.Past1hrPrecipitation !== null && station.Past1hrPrecipitation !== -99) ? station.Past1hrPrecipitation : "N/A";
  let temp = (station.AirTemperature !== null && station.AirTemperature !== -99) ? station.AirTemperature + "°C" : "N/A";
  let humid = (station.RelativeHumidity !== null && station.RelativeHumidity !== -99) ? station.RelativeHumidity + "%" : "N/A";

  let content = `${station.StationName} (${station.StationId})<br>`;
  if (station.Source === 'Rainfall') { // 雨量站只顯示雨量
    content += `日累積雨量: ${nowPrecip} mm, 過去1小時雨量: ${past1hr} mm`;
  } else { // 其他測站顯示溫濕雨
    content += `${temp}, ${humid}<br>
                日累積雨量: ${nowPrecip} mm, 過去1小時雨量: ${past1hr} mm`;
  }
  return content;
}

function generateRainfallPopupContent(station) {
  return `<strong>${station.StationName} (${station.StationId})</strong><br>
          日累積雨量: ${station.NowPrecipitation !== -99 ? station.NowPrecipitation : "N/A"} mm<br>
          過去1小時雨量: ${station.Past1hrPrecipitation !== -99 ? station.Past1hrPrecipitation : "N/A"} mm`;
}

// --- 標籤可見性更新 ---
function updateLabelsVisibility(visible) {
  for (const stationId in stationMarkers) {
    const marker = stationMarkers[stationId];
    const station = allStations[stationId]; // 從 allStations 獲取最新資料
    if (!marker || !station) continue;

    if (visible) {
      marker.bindTooltip(generateLabelContent(station), {
        permanent: true,
        direction: "top",
        offset: [0, -20],
        className: "label-tooltip"
      }).openTooltip(); // 可以選擇是否預設開啟
    } else {
      marker.unbindTooltip();
    }
  }
}

// --- 資料獲取函數 (ARMTS 自動氣象站) ---
async function fetchArmtsData() {
  try {
    const response = await fetch('https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=CWA-8C514C02-902A-4A8C-9B43-E5941B7AAB1D&format=JSON');
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

      armtsStations = []; // 清空舊資料

      stations.forEach(station => {
        const stationData = {
          StationName: station.StationName,
          StationId: station.StationId,
          ObsTime: station.ObsTime.DateTime,
          AirTemperature: parseFloat(station.WeatherElement.AirTemperature),
          RelativeHumidity: parseFloat(station.WeatherElement.RelativeHumidity),
          Latitude: parseFloat(station.GeoInfo.Coordinates[1].StationLatitude),
          Longitude: parseFloat(station.GeoInfo.Coordinates[1].StationLongitude),
          NowPrecipitation: null, // 預設為 null，稍後由雨量資料更新
          Past1hrPrecipitation: null, // 預設為 null
          Source: 'ARMTS'
        };
        armtsStations.push(stationData);
        allStations[stationData.StationId] = stationData; // 更新到全域測站資料

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
        // ... (濕度最高最低邏輯類似)
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

        if (!observationTime && station.ObsTime.DateTime) {
          observationTime = station.ObsTime.DateTime;
        }

        // 如果 marker 已存在，則更新；否則創建新的
        let marker = stationMarkers[stationData.StationId];
        if (marker) {
            marker.setLatLng([stationData.Latitude, stationData.Longitude]);
            marker.setIcon(redIcon); // 確保圖示正確
        } else {
            marker = L.marker([stationData.Latitude, stationData.Longitude], { icon: redIcon });
            stationMarkers[stationData.StationId] = marker; // 儲存 marker
            marker.addTo(armtsLayer); // 加入圖層
        }
        marker.bindPopup(generatePopupContent(stationData));
        // 標籤可見性由 updateLabelsVisibility 控制
      });

      if (lowestTemp === Infinity) { lowestTemp = "N/A"; lowestTempStations = ["N/A"]; lowestTempTime = observationTime || "N/A"; }
      if (highestTemp === -Infinity) { highestTemp = "N/A"; highestTempStations = ["N/A"]; highestTempTime = observationTime || "N/A"; }
      if (highestHumidity === -Infinity) { highestHumidity = "N/A"; highestHumidityStations = ["N/A"]; highestHumidityTime = observationTime || "N/A"; }
      if (lowestHumidity === Infinity) { lowestHumidity = "N/A"; lowestHumidityStations = ["N/A"]; lowestHumidityTime = observationTime || "N/A"; }


      armtsData = {
        stationCount: stations.length,
        highestTemp, highestTempStations, lowestTemp, lowestTempStations,
        highestTempTime, lowestTempTime,
        highestHumidity, highestHumidityStations, lowestHumidity, lowestHumidityStations,
        highestHumidityTime, lowestHumidityTime,
        missingDataStations: missingDataStations.length === 0 ? "無" : missingDataStations.join(", "),
        observationTime: observationTime || "N/A"
      };
    } else {
      console.error("ARMTS API 回應失敗:", data);
    }
  } catch (error) {
    console.error("獲取 ARMTS 資料錯誤:", error);
  }
}

// --- 資料獲取函數 (MESO 無人自動站) ---
async function fetchMesoData() {
  try {
    const response = await fetch('https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001?Authorization=CWA-8C514C02-902A-4A8C-9B43-E5941B7AAB1D&format=JSON');
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

      mesoStations = []; // 清空舊資料

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
          Source: 'MESO'
        };
        mesoStations.push(stationData);
        allStations[stationData.StationId] = stationData;

        // ... (最高最低溫濕度邏輯，同 ARMTS)
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


        if (!observationTime && station.ObsTime.DateTime) {
          observationTime = station.ObsTime.DateTime;
        }

        let marker = stationMarkers[stationData.StationId];
        if (marker) {
            marker.setLatLng([stationData.Latitude, stationData.Longitude]);
            marker.setIcon(orangeIcon);
        } else {
            marker = L.marker([stationData.Latitude, stationData.Longitude], { icon: orangeIcon });
            stationMarkers[stationData.StationId] = marker;
            marker.addTo(mesoLayer);
        }
        marker.bindPopup(generatePopupContent(stationData));
      });

      if (lowestTemp === Infinity) { lowestTemp = "N/A"; lowestTempStations = ["N/A"]; lowestTempTime = observationTime || "N/A"; }
      if (highestTemp === -Infinity) { highestTemp = "N/A"; highestTempStations = ["N/A"]; highestTempTime = observationTime || "N/A"; }
      if (highestHumidity === -Infinity) { highestHumidity = "N/A"; highestHumidityStations = ["N/A"]; highestHumidityTime = observationTime || "N/A"; }
      if (lowestHumidity === Infinity) { lowestHumidity = "N/A"; lowestHumidityStations = ["N/A"]; lowestHumidityTime = observationTime || "N/A"; }

      mesoData = {
        stationCount: stations.length,
        highestTemp, highestTempStations, lowestTemp, lowestTempStations,
        highestTempTime, lowestTempTime,
        highestHumidity, highestHumidityStations, lowestHumidity, lowestHumidityStations,
        highestHumidityTime, lowestHumidityTime,
        missingDataStations: missingDataStations.length === 0 ? "無" : missingDataStations.join(", "),
        observationTime: observationTime || "N/A"
      };
    } else {
      console.error("MESO API 回應失敗:", data);
    }
  } catch (error) {
    console.error("獲取 MESO 資料錯誤:", error);
  }
}

// --- 資料獲取函數 (Rainfall 雨量站) ---
async function fetchRainfallData() {
  try {
    const response = await fetch('https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0002-001?Authorization=CWA-8C514C02-902A-4A8C-9B43-E5941B7AAB1D&format=JSON');
    const data = await response.json();
    if (data.success === "true") {
      const stations = data.records.Station;
      let highestNowPrecipitation = -Infinity;
      let highestNowPrecipitationStations = [];
      let highestNowPrecipitationTime = "";
      let highestPast1hrPrecipitation = -Infinity;
      let highestPast1hrPrecipitationStations = [];
      let highestPast1hrPrecipitationTime = "";
      let missingDataStations = []; // 雨量站比較少-99，但還是保留
      let observationTime = "";

      rainfallStations = []; // 清空舊資料

      stations.forEach(station => {
        const stationData = {
          StationName: station.StationName,
          StationId: station.StationId,
          ObsTime: station.ObsTime.DateTime,
          Latitude: parseFloat(station.GeoInfo.Coordinates[1].StationLatitude),
          Longitude: parseFloat(station.GeoInfo.Coordinates[1].StationLongitude),
          NowPrecipitation: parseFloat(station.RainfallElement.Now.Precipitation),
          Past1hrPrecipitation: parseFloat(station.RainfallElement.Past1hr.Precipitation),
          AirTemperature: null, // 雨量站無此資料
          RelativeHumidity: null, // 雨量站無此資料
          Source: 'Rainfall'
        };
        rainfallStations.push(stationData);

        // 更新 allStations 中對應測站的雨量數據
        if (allStations[stationData.StationId]) {
          allStations[stationData.StationId].NowPrecipitation = stationData.NowPrecipitation;
          allStations[stationData.StationId].Past1hrPrecipitation = stationData.Past1hrPrecipitation;
          allStations[stationData.StationId].ObsTime = stationData.ObsTime; // 也更新觀測時間
        } else {
          // 如果此雨量站不在 ARMTS 或 MESO 中，則將其作為獨立測站加入
          allStations[stationData.StationId] = stationData;
        }

        // 處理無效雨量值 (-998, -999 代表儀器故障或無資料，視為0或N/A)
        if (stationData.NowPrecipitation === -998 || stationData.NowPrecipitation === -999 || stationData.NowPrecipitation === null) {
          stationData.NowPrecipitation = -99; // 使用-99代表N/A，以便 generatePopupContent 統一處理
        }
        if (stationData.Past1hrPrecipitation === -998 || stationData.Past1hrPrecipitation === -999 || stationData.Past1hrPrecipitation === null) {
          stationData.Past1hrPrecipitation = -99;
        }

        // ... (最高雨量邏輯)
        if (stationData.NowPrecipitation !== -99 && stationData.NowPrecipitation > highestNowPrecipitation) {
            highestNowPrecipitation = stationData.NowPrecipitation;
            highestNowPrecipitationStations = [stationData.StationName];
            highestNowPrecipitationTime = stationData.ObsTime;
        } else if (stationData.NowPrecipitation !== -99 && stationData.NowPrecipitation === highestNowPrecipitation) {
            highestNowPrecipitationStations.push(stationData.StationName);
        }

        if (stationData.Past1hrPrecipitation !== -99 && stationData.Past1hrPrecipitation > highestPast1hrPrecipitation) {
            highestPast1hrPrecipitation = stationData.Past1hrPrecipitation;
            highestPast1hrPrecipitationStations = [stationData.StationName];
            highestPast1hrPrecipitationTime = stationData.ObsTime;
        } else if (stationData.Past1hrPrecipitation !== -99 && stationData.Past1hrPrecipitation === highestPast1hrPrecipitation) {
            highestPast1hrPrecipitationStations.push(stationData.StationName);
        }


        if (!observationTime && station.ObsTime.DateTime) {
          observationTime = station.ObsTime.DateTime;
        }

        let marker = stationMarkers[stationData.StationId];
        if (marker) { 
        } else { 
            marker = L.marker([stationData.Latitude, stationData.Longitude], { icon: blueIcon });
            stationMarkers[stationData.StationId] = marker;
            marker.bindPopup(generateRainfallPopupContent(allStations[stationData.StationId])); // 使用 allStations 的資料確保一致
            marker.addTo(rainfallLayer);
        }
      });

      rainfallData = {
        stationCount: stations.length,
        highestNowPrecipitation: highestNowPrecipitation === -Infinity ? "N/A" : highestNowPrecipitation,
        highestNowPrecipitationStations: highestNowPrecipitationStations.length > 0 ? highestNowPrecipitationStations : ["N/A"],
        highestNowPrecipitationTime: highestNowPrecipitationTime || (observationTime || "N/A"),
        highestPast1hrPrecipitation: highestPast1hrPrecipitation === -Infinity ? "N/A" : highestPast1hrPrecipitation,
        highestPast1hrPrecipitationStations: highestPast1hrPrecipitationStations.length > 0 ? highestPast1hrPrecipitationStations : ["N/A"],
        highestPast1hrPrecipitationTime: highestPast1hrPrecipitationTime || (observationTime || "N/A"),
        missingDataStations: "N/A", // 雨量站較少提供此類資訊
        observationTime: observationTime || "N/A"
      };
    } else {
      console.error("Rainfall API 回應失敗:", data);
    }
  } catch (error) {
    console.error("獲取 Rainfall 資料錯誤:", error);
  }
}

function updateCombinedStationLabels() {
    for (const stationId in allStations) {
        const station = allStations[stationId];
        const marker = stationMarkers[stationId];
        if (marker && station) {
            if (station.Source === 'Rainfall' && (!station.AirTemperature && !station.RelativeHumidity)) {
                marker.setPopupContent(generateRainfallPopupContent(station));
            } else {
                marker.setPopupContent(generatePopupContent(station));
            }
            if (marker.getTooltip()) { 
                 marker.setTooltipContent(generateLabelContent(station));
            }
        }
    }
}


// --- 渲染統計資訊表格 ---
function renderArmtsSummary() {
  const container = document.getElementById('armts-summary-content');
  if (!armtsData || Object.keys(armtsData).length === 0) {
    container.innerHTML = `<p>ARMTS 資料載入中或無資料...</p>`;
    return;
  }
  container.innerHTML = `
    <table border="1" style="border-collapse: collapse; width: 100%;">
      <tr><th>測站數量</th><td>${armtsData.stationCount || 'N/A'}</td></tr>
      <tr><th>最高溫度</th><td>${armtsData.highestTemp}°C (${(armtsData.highestTempStations || ['N/A']).join(', ')})</td></tr>
      <tr><th>最低溫度</th><td>${armtsData.lowestTemp}°C (${(armtsData.lowestTempStations || ['N/A']).join(', ')})</td></tr>
      <tr><th>最高濕度</th><td>${armtsData.highestHumidity}% (${(armtsData.highestHumidityStations || ['N/A']).join(', ')})</td></tr>
      <tr><th>最低濕度</th><td>${armtsData.lowestHumidity}% (${(armtsData.lowestHumidityStations || ['N/A']).join(', ')})</td></tr>
      <tr><th>資料缺失</th><td>${armtsData.missingDataStations}</td></tr>
      <tr><th>觀測時間</th><td>${armtsData.observationTime}</td></tr>
    </table>
  `;
}

function renderMesoSummary() {
  const container = document.getElementById('meso-summary-content');
   if (!mesoData || Object.keys(mesoData).length === 0) {
    container.innerHTML = `<p>MESO 資料載入中或無資料...</p>`;
    return;
  }
  container.innerHTML = `
    <table border="1" style="border-collapse: collapse; width: 100%;">
      <tr><th>測站數量</th><td>${mesoData.stationCount || 'N/A'}</td></tr>
      <tr><th>最高溫度</th><td>${mesoData.highestTemp}°C (${(mesoData.highestTempStations || ['N/A']).join(', ')})</td></tr>
      <tr><th>最低溫度</th><td>${mesoData.lowestTemp}°C (${(mesoData.lowestTempStations || ['N/A']).join(', ')})</td></tr>
      <tr><th>最高濕度</th><td>${mesoData.highestHumidity}% (${(mesoData.highestHumidityStations || ['N/A']).join(', ')})</td></tr>
      <tr><th>最低濕度</th><td>${mesoData.lowestHumidity}% (${(mesoData.lowestHumidityStations || ['N/A']).join(', ')})</td></tr>
      <tr><th>資料缺失</th><td>${mesoData.missingDataStations}</td></tr>
      <tr><th>觀測時間</th><td>${mesoData.observationTime}</td></tr>
    </table>
  `;
}

function renderRainfallSummary() {
  const container = document.getElementById('rainfall-summary-content');
  if (!rainfallData || Object.keys(rainfallData).length === 0) {
    container.innerHTML = `<p>雨量資料載入中或無資料...</p>`;
    return;
  }
  container.innerHTML = `
    <table border="1" style="border-collapse: collapse; width: 100%;">
      <tr><th>測站數量</th><td>${rainfallData.stationCount || 'N/A'}</td></tr>
      <tr><th>最高日累積雨量</th><td>${rainfallData.highestNowPrecipitation} mm (${(rainfallData.highestNowPrecipitationStations || ['N/A']).join(', ')})</td></tr>
      <tr><th>最高過去1小時雨量</th><td>${rainfallData.highestPast1hrPrecipitation} mm (${(rainfallData.highestPast1hrPrecipitationStations || ['N/A']).join(', ')})</td></tr>
      <tr><th>資料缺失</th><td>${rainfallData.missingDataStations}</td></tr>
      <tr><th>觀測時間</th><td>${rainfallData.observationTime}</td></tr>
    </table>
  `;
}

// --- 手風琴效果初始化 ---
function initAccordion() {
  const toggles = document.querySelectorAll('.accordion-toggle');
  toggles.forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      if (!content) return;
      const isVisible = content.style.display === 'block';
      content.style.display = isVisible ? 'none' : 'block';
      btn.textContent = isVisible ? btn.textContent.replace('▼', '►') : btn.textContent.replace('►', '▼');
    });
  });
}

// --- 測站搜尋功能 (已修改) ---
function searchStation() {
  const searchTerm = document.getElementById('search-box').value.trim(); // 去除頭尾空白

  // 如果存在臨時的經緯度標記，先移除它
  if (tempPlacemark && map.hasLayer(tempPlacemark)) {
    map.removeLayer(tempPlacemark);
    tempPlacemark = null;
  }

  // 嘗試解析輸入是否為 "緯度,經度" 格式
  // 正則表達式：可選空白, 數字(可帶負號與小數點), 可選空白, 逗號, 可選空白, 數字(可帶負號與小數點), 可選空白
  const coordPattern = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
  const match = searchTerm.match(coordPattern);

  if (match) {
    const lat = parseFloat(match[1]); // 取得緯度
    const lon = parseFloat(match[2]); // 取得經度

    // 驗證緯度和經度是否在有效範圍內
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      map.setView([lat, lon], 15); // 移動地圖視圖到該座標，縮放級別設為 15

      // 創建一個臨時標記，可以使用預設圖示或自訂圖示
      tempPlacemark = L.marker([lat, lon]) // 使用 Leaflet 預設圖示
        .addTo(map)
        .bindPopup(`<b>自訂位置</b><br>緯度: ${lat.toFixed(4)}, 經度: ${lon.toFixed(4)}`)
        .openPopup();
      return; // 成功處理座標搜尋，結束函數
    } else {
      // 輸入看起來像座標，但數值無效
      alert('無效的緯度或經度數值。\n緯度必須介於 -90 和 90 之間，經度必須介於 -180 和 180 之間。');
      return; // 結束函數，因為座標輸入格式正確但值錯誤
    }
  }

  // 如果輸入的不是有效的經緯度格式，則執行測站名稱或 ID 搜尋
  let found = false;
  const lowerSearchTerm = searchTerm.toLowerCase(); // 轉換為小寫以進行不區分大小寫的比對

  // 在所有測站資料中搜尋 (allStations 包含所有來源的測站)
  for (const stationId in allStations) {
    const station = allStations[stationId];
    if (station.StationName.toLowerCase().includes(lowerSearchTerm) ||
        station.StationId.toLowerCase().includes(lowerSearchTerm)) {
      map.setView([station.Latitude, station.Longitude], 15);
      // 如果該測站的 marker 存在，則打開其 popup
      if (stationMarkers[station.StationId]) {
        stationMarkers[station.StationId].openPopup();
      }
      found = true;
      break; // 找到即停止搜尋
    }
  }

  if (!found) {
       alert('找不到測站或有效的座標 (格式: 緯度,經度)！');
  }
}

// --- 事件監聽器 ---
document.getElementById('search-button').addEventListener('click', searchStation);
document.getElementById('search-box').addEventListener('keypress', function(event) {
  if (event.key === "Enter") {
    event.preventDefault(); 
    searchStation();
  }
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
document.getElementById('toggle-labels').addEventListener('change', function() {
  updateLabelsVisibility(this.checked);
});

// --- 地圖與資料初始化函數 ---
async function initializeMap() {
  // 顯示載入訊息
  document.getElementById('armts-summary-content').innerHTML = '<p>ARMTS 資料載入中...</p>';
  document.getElementById('meso-summary-content').innerHTML = '<p>MESO 資料載入中...</p>';
  document.getElementById('rainfall-summary-content').innerHTML = '<p>雨量資料載入中...</p>';

  await fetchArmtsData();
  await fetchMesoData();
  await fetchRainfallData();

  updateCombinedStationLabels(); 

  renderArmtsSummary();
  renderMesoSummary();
  renderRainfallSummary();

  initAccordion(); 

  const showLabels = document.getElementById('toggle-labels').checked;
  updateLabelsVisibility(showLabels); // 根據核取方塊狀態更新標籤

  console.log("資料獲取完畢，摘要已渲染，圖層控制已設定！");
}

// --- 執行初始化 ---
initializeMap();
