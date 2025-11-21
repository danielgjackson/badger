import { Detector } from './detector.js';

function showError(message) {
    const errorElement = document.querySelector('#error');
    errorElement.innerHTML = message;
    errorElement.classList.remove('hidden');
}

async function run() {
    console.log('Running...');
    const detector = new Detector({});
    let err = await detector.init();
    if (err) {
        showError(err);
        return false;
    }

    console.log('...APIs are supported or successfully polyfilled.');
    err = await detector.start();
    if (err) {
        showError(err);
        return false;
    }

    console.log('...started.');
    return true;
}

addEventListener("DOMContentLoaded", async (event) => {
    run();
});

