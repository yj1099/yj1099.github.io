/*
speedTTS/index.js
Version: 2.2.6  @2023/06/01
Wenchin Hsieh @Goomo.Net Studio, wenchin@goomo.net
*/

const zoomSize = 14;
const ttsRadius = 420;      // 多少公尺內提醒
const fileCamera = "camera.json"
const iColors = ['#FDD', '#FCC', '#FBB', '#FAA', '#F88', '#F66', '#F33', '#F00', '#E00', '#D00', '#C00', '#B00', '#A00', '#900'];

const optWatch = {
    enableHighAccuracy: true,
    timeout: 3000,
    maximumAge: 0,
}

const fakeGeo = {
    coords: {
        latitude: 25.0465767,
        longitude: 121.5612388,
        accuracy: 15,
        speed: 12.3,
        heading: 45,
        altitude: null,
        altitudeAccuracy: null,
    },
    timestamp: new Date(),
}

var x = document.getElementById("result");
var speedStyles = [];
var toInit = true;
var rotateView = true;
var usingTTS = false;
var prevCamera = -1;
var prevDFloor = ttsRadius;
var map, olCenter;
var jsonCamera, idWatch;
var carFeature, carGeometry, car_style, car_bord_style, arrow_style, arrow_shape;


// 透過 GeoLocation API 取得 使用者經緯度座標
function getLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(showPosition, showError);
    } else {
        console.log("您使用的 Browser 不支援 GeoLocation API！");
    }
}


function startWatching() {
    if (navigator.geolocation) {
        idWatch = navigator.geolocation.watchPosition(showPosition, showError, optWatch);
        document.getElementById("btnStart").disabled = true;
        document.getElementById("btnStop").disabled = false;
    } else {
        x.value += "您使用的 Browser 不支援 GeoLocation API！\n";
    }
}


function stopWatching() {
    navigator.geolocation.clearWatch(idWatch);
    document.getElementById("btnStop").disabled = true;
    document.getElementById("btnStart").disabled = false;
}


function showError(error) {
    console.log('[Error: ' + error.code + '] ' + error.message);
}


function showPosition(position) {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const lat6 = lat.toFixed(6);
    const lon6 = lon.toFixed(6);
    const accuracy = position.coords.accuracy.toFixed(0);
    const speed = position.coords.speed ? position.coords.speed : 0;
    const speed1 = speed.toFixed(1);
    const heading = position.coords.heading ? position.coords.heading : -1;
    const radians = Math.PI * heading / 180;
    const direction = (heading >= 0) ? heading.toFixed(0) : "?";
    const gpstime = (new Date(position.timestamp)).toLocaleTimeString();
    const currtime = (new Date()).toLocaleTimeString();

    olCenter = ol.proj.fromLonLat([lon, lat]);
    x.value += `${currtime} - 緯度:${lat6}, 經度:${lon6}, 誤差:${accuracy}m, ` +
        `速度:${speed1}m/s, 方向:${direction}°, 時間:${gpstime}\n`;
    x.scrollTop = x.scrollHeight;

    if (toInit) {
        initMap(); // 初始化地圖
        toInit = false;
    } else {
        // 移動人車位置
        carGeometry.setCoordinates(olCenter);

        // 標示人車前進方向
        if (speed == 0 || heading == -1) { // 設為 無指向性 的圓形圖示
            carFeature.setStyle([car_bord_style, car_style]);
        } else { // 設為 指向性 的圓錐形圖示
            arrow_shape.setRotation(radians);
            carFeature.setStyle([car_bord_style, arrow_style, car_style]);
        }

        // 平移 地圖景窗
        const v = map.getView();
        v.setCenter(olCenter);

        // 旋轉 地圖景窗
        if (rotateView && heading >= 0) {
            v.setRotation(- radians);
        }

        // 找尋最近的 測速相機
        findNearestCamera(lon, lat);
    }
}


// 找尋最近的 測速相機
function findNearestCamera(lon, lat) {
    let nearestCamera = 1;
    let minDegree = 99;

    for (let i = 1, cnt = jsonCamera.result.total; i < cnt; i++) {
        let r = jsonCamera.result.records[i];
        let m = Math.max(Math.abs(r.Longitude - lon), Math.abs(r.Latitude - lat));
        if (m < minDegree) {
            nearestCamera = i;
            minDegree = m;
        }
    }

    let r = jsonCamera.result.records[nearestCamera];
    let d = Math.trunc(distanceMarkers(lon, lat, r.Longitude, r.Latitude) * 1000);
    let dFloor = Math.floor(d / 100) * 200;         // 相隔200公尺提醒
    let s1 = `📸 距離 ${d} 公尺，限速 ${r.limit} 公里 【${r.Address} ~ ${r.direct}】\n`;
    let s2 = `距離 ${dFloor}，限速 ${r.limit}，${r.direct}`;

    x.value += s1;

    if (nearestCamera == prevCamera) {
        if (usingTTS && d < ttsRadius)
            if (dFloor < prevDFloor) {
                convertToSpeech(s2);
            }
            prevDFloor = dFloor;
    } else {
        prevCamera = nearestCamera;
        prevDFloor = ttsRadius;
    }
}


// 計算兩個經緯度座標之間的距離
function distanceMarkers(lon1, lat1, lon2, lat2) {
    var R = 6371; // km (change this constant to get miles)
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;

    return d;
}


// TTS 文字轉語音
function convertToSpeech(message) {
    const speech = new SpeechSynthesisUtterance();
    speech.text = message;
    window.speechSynthesis.speak(speech);
}


// 初始化 Map 及所有圖層
function initMap() {
    // 建立底層 Tile Layer 電子地圖
    let tileLayer = new ol.layer.Tile({
        source: new ol.source.Stamen({
            layer: 'terrain',
        })
    });

    // 建立 Map Object
    map = new ol.Map({
        target: 'map',
        layers: [
            tileLayer,
        ],
        view: new ol.View({
            center: olCenter,
            zoom: zoomSize,
        })
    });

    // 為地圖增添 比例尺 ScaleLine
    let myscale = new ol.control.ScaleLine({
        units: 'metric',
        bar: true,
        steps: 4,
        text: false,
        minWidth: 140,
    });
    map.addControl(myscale);

    // 為地圖增添 縮放滑桿 ZoomSlider
    let myzoomslider = new ol.control.ZoomSlider();
    map.addControl(myzoomslider);

    // Call ~ 建立交通速限標誌的 Styles
    makeSpeedLimitSign();
    
    // 定期發送心跳訊息 -- 2023.06.03 --
//     setInterval(() => {
//       fetch('/heartbeat');
//     }, 30000);
}


// 為不同速限的交通標誌 建立不同的 Styles
function makeSpeedLimitSign() {
    let bord = new ol.style.Style({
        image: new ol.style.Circle({
            radius: 12,
            stroke: new ol.style.Stroke({ color: '#FFF', width: 5 }),
        }),
    });

    for (let i = 0; i < iColors.length; i++) {
        let iStyle = new ol.style.Style({
            image: new ol.style.Circle({
                radius: 12,
                fill: new ol.style.Fill({ color: 'rgba(255, 238, 238, 0.9)' }),
                stroke: new ol.style.Stroke({ color: iColors[i], width: 3 }),
            }),
            text: new ol.style.Text({
                text: (i * 10).toString(),
                offsetY: 1,
                scale: 1.2,
                stroke: new ol.style.Stroke({ color: 'white', width: 1 }),
            }),
        });

        speedStyles.push([bord, iStyle]);
    }

    // 匯入 測速執法點 Camera & 指派 Feature for n Points
    fetch(fileCamera)
        .then(response => response.text())
        .then(data => {
            jsonCamera = JSON.parse(data);

            // 在此加入 國道公路固定式測速照相地點 https://data.gov.tw/dataset/13940
            // ...

            createCameraLayer(); // 建立 測速執法點 圖層
        })
        .catch(error => {
            console.log('Error:', error);
        });
}


// 建立上層 Vector Layer for 測速執法點
function createCameraLayer() {
    const cameraFeatures = [];

    for (let i = 0, cnt = jsonCamera.result.total; i < cnt; i++) {
        let r = jsonCamera.result.records[i];
        let f = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([r.Longitude, r.Latitude])),
            speedLimit: r.limit,
            address: r.Address,
            direct: r.direct,
        });

        f.setStyle(speedStyles[(r.limit / 10) | 0]);
        cameraFeatures.push(f);
    }

    var cameraLayer = new ol.layer.Vector({
        source: new ol.source.Vector({
            features: cameraFeatures,
        }),
    });

    map.addLayer(cameraLayer); // 疊加 測速執法點 圖層

    createCarLayer(); // 建立 車子 或 行人 圖層
}


// 建立最上層 Vector Layer for 車子或行人
function createCarLayer() {
    carGeometry = new ol.geom.Point(olCenter);

    carFeature = new ol.Feature({
        geometry: carGeometry,
    });

    car_style = new ol.style.Style({
        image: new ol.style.Circle({
            radius: 10,
            fill: new ol.style.Fill({ color: '#FF0' }),
            stroke: new ol.style.Stroke({ color: '#F84', width: 2 }),
        }),
    });

    car_bord_style = new ol.style.Style({
        image: new ol.style.Circle({
            radius: 12,
            fill: new ol.style.Fill({ color: 'white' }),
        }),
    });

    arrow_shape = new ol.style.RegularShape({
        points: 3,
        radius: 10,
        rotation: 0,
        rotateWithView: true,
        displacement: [0, 12],
        fill: new ol.style.Fill({ color: '#F84' }),
        stroke: new ol.style.Stroke({ color: 'white', width: 1 }),
    });

    arrow_style = new ol.style.Style({
        image: arrow_shape,
    });

    carFeature.setStyle([car_bord_style, car_style]);

    const carLayer = new ol.layer.Vector({
        source: new ol.source.Vector({
            features: [carFeature],
        }),
    });

    map.addLayer(carLayer); // 疊加 車子或行人 圖層
}


// 切換成 自動依行進方向來旋轉地圖
function toggleRotate() {
    rotateView = !rotateView;
    if (!rotateView)
        map.getView().setRotation(0);

}


// 開啟或關閉 TTS
function toggleTTS() {
    usingTTS = !usingTTS;
}


// 偽造座標 並更新地圖
function fakeLocation() {
    showPosition(fakeGeo);
}


// 先透過 GeoLocation 取得 使用者經緯度座標，再初始化 Map 及所有圖層
getLocation();
