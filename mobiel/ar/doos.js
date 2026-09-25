/* Een positie ten opzichte van een vast plaatje; geen wereldkaart of database. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const storageKey = 'binnenapp-ar-doos-hiro-v1';
  const limits = {x: [-100, 100], z: [-100, 100], height: [0, 100], size: [10, 60], angle: [0, 360], markerSize: [3, 100]};
  const defaults = {x: 30, z: 0, height: 0, size: 30, angle: 0, markerSize: 18.4};
  let pose = {...defaults}, stored = false, dirty = false, scene, model, found = false, active = false, session = 0, watchdog;
  const scripts = new Map(), streams = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.version === 1 && Object.entries(limits).every(([k, [min, max]]) => Number.isFinite(saved.pose?.[k]) && saved.pose[k] >= min && saved.pose[k] <= max)) {
      pose = {...saved.pose}; stored = true;
    }
  } catch { /* Een beschadigde of geblokkeerde opslag mag de camera niet blokkeren. */ }
  const summary = text => { $('summary').textContent = text; };
  function syncControls() {
    $('marker-size').value = pose.markerSize;
    for (const key of ['x', 'z', 'height', 'size', 'angle']) {
      $(key).value = pose[key]; $(key + '-value').textContent = pose[key] + (key === 'angle' ? '°' : ' cm');
    }
    $('forget').hidden = !stored;
  }
  function applyPose() {
    if (!model) return;
    model.scale.setScalar(pose.size / pose.markerSize);
    model.position.set(pose.x / pose.markerSize, pose.height / pose.markerSize, pose.z / pose.markerSize);
    model.rotation.y = pose.angle * Math.PI / 180;
  }
  function edited() {
    dirty = true; $('saved').textContent = 'Wijziging nog niet bewaard. Tik op Plek onthouden.'; applyPose();
  }
  syncControls();
  summary(stored ? 'Er is een plek bewaard. Start de camera om je doos terug te vinden.' : 'Nog geen plek bewaard. Start de camera en plaats je doos.');
  for (const key of ['x', 'z', 'height', 'size', 'angle']) $(key).addEventListener('input', () => {
    pose[key] = Number($(key).value); $(key + '-value').textContent = pose[key] + (key === 'angle' ? '°' : ' cm'); edited();
  });
  $('save').onclick = () => {
    if (!active || !found) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({version: 1, pose})); stored = true; dirty = false;
      $('saved').textContent = 'Plek bewaard. Sluit de camera en open hem opnieuw om te testen.';
      $('forget').hidden = false;
    } catch { $('saved').textContent = 'Bewaren lukt niet. Sta websiteopslag toe en gebruik een normaal Safari-tabblad.'; }
  };
  $('forget').onclick = () => {
    try { localStorage.removeItem(storageKey); } catch { summary('Wissen lukt niet. Controleer de websiteopslag in Safari.'); return; }
    stored = false; dirty = false; pose = {...defaults}; syncControls(); summary('Plek gewist. Je kunt een nieuwe plek kiezen.');
  };
  function loadScript(url) {
    if (!scripts.has(url)) scripts.set(url, new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = url; script.onload = resolve;
      script.onerror = () => { scripts.delete(url); script.remove(); reject(new Error('AR-bestanden laden mislukt. Controleer je verbinding.')); };
      document.head.append(script);
    }));
    return scripts.get(url);
  }
  function stop() {
    session++; active = false; found = false; clearTimeout(watchdog);
    streams.forEach(stream => stream.getTracks().forEach(track => track.stop())); streams.clear();
    document.querySelectorAll('video').forEach(video => { video.srcObject?.getTracks().forEach(track => track.stop()); video.srcObject = null; video.remove(); });
    if (scene) {
      scene.pause(); scene.renderer?.setAnimationLoop(null);
      model?.traverse(part => { part.geometry?.dispose(); part.material?.dispose(); });
      scene.renderer?.dispose(); scene.remove(); scene = null; model = null;
    }
    document.querySelectorAll('.arjs-loader,#arjsDebugUIContainer').forEach(el => el.remove());
    document.body.classList.remove('running'); $('setup').hidden = false; $('live').hidden = true;
    $('start').disabled = false; $('start').textContent = 'Camera starten'; $('save').disabled = true;
  }
  // Ook een laat beantwoorde cameratoestemming mag na sluiten geen camera achterlaten.
  if (navigator.mediaDevices?.getUserMedia) {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const current = session, stream = await getUserMedia(constraints);
      if (!active || current !== session) { stream.getTracks().forEach(track => track.stop()); throw new DOMException('Camera gesloten', 'AbortError'); }
      streams.add(stream); return stream;
    };
  }
  $('stop').onclick = () => {
    stop(); summary(dirty ? 'Camera gesloten. Je laatste wijzigingen zijn nog niet bewaard.' : stored ? 'Camera gesloten. Je plek is bewaard. Start opnieuw en richt op hetzelfde plaatje.' : 'Camera gesloten. Er is nog geen plek bewaard.');
  };
  addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden && active) { stop(); summary('Camera gepauzeerd. Start opnieuw om verder te gaan.'); } });
  addEventListener('camera-error', event => {
    if (!active || event.detail?.error?.name === 'AbortError') return;
    stop(); summary('De camera kon niet starten. Geef cameratoegang in Safari en probeer opnieuw.');
  });
  function buildBox(marker) {
    const T = AFRAME.THREE; model = new T.Group(); model.name = 'bewaarde-doos';
    const part = (size, position, color) => {
      const mesh = new T.Mesh(new T.BoxGeometry(...size), new T.MeshStandardMaterial({color, roughness: .9}));
      mesh.position.set(...position); model.add(mesh);
    };
    part([1, 1, 1], [0, .5, 0], 0xb78653);
    part([.18, .005, 1.005], [0, 1.0025, 0], 0x2453b8);
    part([.18, 1, .005], [0, .5, .5025], 0x2453b8);
    part([.18, 1, .005], [0, .5, -.5025], 0x2453b8);
    part([.3, .2, .005], [-.28, .62, .503], 0xf5f7fb);
    for (let i = 0; i < 3; i++) part([.21, .015, .005], [-.28, .67 - i * .04, .506], 0x16324f);
    marker.object3D.add(model); applyPose();
  }
  $('start').onclick = async () => {
    if (active) return;
    if (!navigator.mediaDevices?.getUserMedia) { summary('Open deze pagina via HTTPS in Safari op je iPhone om de camera te gebruiken.'); return; }
    if (!$('marker-size').reportValidity()) return;
    if (pose.markerSize !== Number($('marker-size').value)) { pose.markerSize = Number($('marker-size').value); dirty = true; }
    active = true; const current = ++session; $('start').disabled = true; $('start').textContent = 'AR laden…';
    try {
      await loadScript('/ar/vendor/aframe-1.6.0.min.js');
      if (current !== session) return;
      await loadScript('/ar/vendor/aframe-ar-3.4.7.js');
      if (current !== session) return;
      $('setup').hidden = true; $('live').hidden = false; document.body.classList.add('running');
      $('adjust').open = !stored; $('status').textContent = 'Richt op het hele plaatje, inclusief de witte rand.';
      $('saved').textContent = dirty ? 'Wijziging nog niet bewaard.' : stored ? 'Je bewaarde plek wordt geladen zodra het plaatje herkend is.' : 'Verplaats de doos en tik daarna op Plek onthouden.';
      scene = document.createElement('a-scene'); scene.setAttribute('embedded', '');
      scene.setAttribute('vr-mode-ui', 'enabled: false'); scene.setAttribute('renderer', 'alpha: true; antialias: true');
      scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
      scene.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false; detectionMode: mono; cameraParametersUrl: /ar/vendor/camera_para.dat; maxDetectionRate: 30;');
      const marker = document.createElement('a-marker'); marker.setAttribute('type', 'pattern'); marker.setAttribute('url', '/ar/vendor/patt.hiro'); marker.setAttribute('size', '1'); marker.setAttribute('emitevents', 'true');
      marker.addEventListener('markerFound', () => {
        if (current !== session) return;
        found = true; clearTimeout(watchdog); $('save').disabled = false;
        $('status').textContent = 'Plaatje herkend · houd het in beeld';
      });
      marker.addEventListener('markerLost', () => {
        if (current !== session) return;
        found = false; $('save').disabled = true; $('status').textContent = 'Plaatje uit beeld · richt erop om je doos weer te zien';
      });
      marker.addEventListener('loaded', () => { if (current === session) buildBox(marker); }, {once: true});
      scene.append(marker); const camera = document.createElement('a-entity'); camera.setAttribute('camera', ''); scene.append(camera);
      document.body.append(scene);
      watchdog = setTimeout(() => { if (current === session && !found) $('status').textContent = 'Nog geen plaatje herkend. Houd het hele vierkant goed verlicht in beeld, zonder reflecties.'; }, 18000);
    } catch (error) { if (current === session) { stop(); summary(error.message || 'AR kon niet starten. Probeer opnieuw.'); } }
  };
})();
