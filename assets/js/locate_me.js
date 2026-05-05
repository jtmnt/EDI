import { updatePage } from "./logs.js";

/** Locate me functionality */
const locateMe = function(pos) {
    let a = "abcdefghijklmnopqrstuvwxyz"
    /* Positions */
    let lng = pos.coords.longitude;
    let lat = pos.coords.latitude;

    let lng_a = lng + 180;
    let lat_a = lat + 90;

    let qth_1 = a[Math.trunc(lng_a/20)].toUpperCase();
    let qth_2 = a[Math.trunc(lat_a/10)].toUpperCase();
    let qth_3 = Math.trunc(lng_a/2 % 10);
    let qth_4 = Math.trunc((lat_a) % 10);

    let lng_b = (lng_a - 2*Math.trunc(lng_a/2)) * 12;
    let lat_b = (lat_a - Math.trunc(lat_a)) * 24;

    let qth_5 = a[Math.trunc(lng_b)];
    let qth_6 = a[Math.trunc(lat_b)];

    let qth = ''.concat(qth_1,qth_2,qth_3,qth_4,qth_5,qth_6);
    document.getElementById('PWWLo').value = qth;
    localStorage['PWWLo'] = qth;
    updatePage();
};

document.getElementById('locate_me').addEventListener('click', function(){
    if (navigator.geolocation) {
        let options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };
        navigator.geolocation.getCurrentPosition(locateMe, null, options);
    } else {
        alert("Geolocation is not supported by this browser.");
    }
});
