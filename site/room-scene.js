// Renders the room photos: the stills in photos/ and the "Update photo" renders.
import * as THREE from "./vendor/three.module.js";
import { RoundedBoxGeometry } from "./vendor/RoundedBoxGeometry.js";
import { CAMERA } from "./room.js";

// The canvas must be 3:2 (CAMERA.aspect) so pixels line up with room.js projections.

export function createRoomScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e8e5df");
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(37)) / CAMERA.aspect));
  const camera = new THREE.PerspectiveCamera(fov, CAMERA.aspect, .05, 40);
  camera.position.set(...CAMERA.pos);
  camera.lookAt(...CAMERA.target);
  scene.add(new THREE.HemisphereLight(0xf6f8ff, 0xc1b9aa, 2.4));
  const sun = new THREE.DirectionalLight(0xfff2d9, 3.2);
  sun.position.set(3, 4, -6); sun.target.position.set(-1, 0, 1.5);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .1, far: 18 });
  sun.shadow.bias = -.0003; sun.shadow.normalBias = .014; sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xe9efff, .9);
  fill.position.set(-1, 2.4, 4); scene.add(fill);
  const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...options });
  function surface(kind) {
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const ctx = c.getContext("2d"); let seed = 34;
    const random = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
    ctx.fillStyle = kind === "wood" ? "#d0b38d" : "#e6e3de"; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 7000; i++) {
      const x = random() * 512, y = random() * 512;
      ctx.strokeStyle = `rgba(55,43,31,${random() * (kind === "wood" ? .032 : .12)})`;
      ctx.lineWidth = .5 + random(); ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + (kind === "wood" ? Math.sin(y / 40) * 3 : 2), y + (kind === "wood" ? random() * 200 : 2)); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return texture;
  }
  const wood = surface("wood"), fabric = surface("fabric");
  const ash = mat("#ead9bb", { map: wood, roughness: .55 });
  const birch = mat("#f2dfb8", { map: wood, roughness: .48 });
  const grey = mat("#9b9c99", { map: fabric, bumpMap: fabric, bumpScale: .002 });
  const green = mat("#7b8975", { map: fabric, bumpMap: fabric, bumpScale: .002 });
  const white = mat("#f3f0e8"), plaster = mat("#e1ded5"), seam = mat("#a18a6b");
  function box(parent, size, position, material, radius = 0) {
    const geometry = radius ? new RoundedBoxGeometry(...size, 3, radius) : new THREE.BoxGeometry(...size);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function rod(parent, start, end, radius, material, topRadius = radius) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), delta = b.clone().sub(a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, radius, delta.length(), 16), material);
    mesh.position.copy(a.add(b).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  const floor = mat("#e6d2b2", { map: wood, roughness: .62 });
  box(scene, [4.2, .1, 3.6], [0, -.05, 0], floor);
  for (let x = -2.1; x < 2.1; x += .21) {
    box(scene, [.003, .001, 3.6], [x, .001, 0], seam);
    for (let z = -1.8 + ((Math.round(x * 100) % 3 + 3) % 3) * .45; z < 1.8; z += 1.2) {
      box(scene, [.21, .001, .003], [x + .105, .001, z], seam);
    }
  }
  box(scene, [2.6, 2.65, .16], [-.8, 1.325, -1.88], plaster);
  box(scene, [.36, 2.65, .16], [1.92, 1.325, -1.88], plaster);
  box(scene, [1.24, 1.035, .16], [1.12, .5175, -1.88], plaster);
  box(scene, [1.24, .345, .16], [1.12, 2.4775, -1.88], plaster);
  box(scene, [.16, 2.65, 3.6], [-2.18, 1.325, 0], mat("#d8d6ce"));
  box(scene, [.16, 2.65, 2.4], [2.18, 1.325, -.6], white);
  box(scene, [.16, 2.65, .3], [2.18, 1.325, 1.65], white);
  box(scene, [.16, .55, .9], [2.18, 2.375, 1.05], white);
  box(scene, [4.36, .12, 3.76], [0, 2.71, -.04], white);
  box(scene, [4.2, .085, .025], [0, .0425, -1.785], white);
  box(scene, [.025, .085, 3.6], [-2.085, .0425, 0], white);
  box(scene, [.025, .085, 2.4], [2.085, .0425, -.6], white);
  const sky = mat("#d3e4e7", { emissive: 0xa7c9d6, emissiveIntensity: .55 });
  box(scene, [1.24, 1.27, .015], [1.12, 1.67, -1.98], sky).castShadow = false;
  for (const x of [.5, 1.12, 1.74]) box(scene, [.045, 1.31, .11], [x, 1.67, -1.82], white);
  for (const y of [1.035, 2.305]) box(scene, [1.31, .045, .11], [1.12, y, -1.82], white);
  box(scene, [1.38, .04, .28], [1.12, 1.015, -1.73], ash);
  box(scene, [.018, .09, .035], [1.075, 1.57, -1.745], mat("#aaa79e", { metalness: .8, roughness: .25 }));
  for (const z of [.6, 1.5]) box(scene, [.055, 2.14, .06], [2.065, 1.07, z], white);
  box(scene, [.055, .06, .96], [2.065, 2.13, 1.05], white);
  const door = new THREE.Group(); door.position.set(2.08, 0, 1.5); door.rotation.y = Math.PI / 4;
  box(door, [.035, 2.08, .88], [0, 1.04, -.44], mat("#c7b18d", { map: wood }));
  rod(door, [-.04, 1.02, -.72], [-.04, 1.02, -.82], .013, mat("#69685f", { metalness: .7, roughness: .3 })); scene.add(door);
  const rug = new THREE.Group();
  box(rug, [2.4, .012, 1.7], [0, .008, 0], mat("#d4c9b6", { map: fabric, bumpMap: fabric, bumpScale: .003 }), .005);
  for (const z of [-.84, .84]) for (let x = -1.18; x < 1.19; x += .045) box(rug, [.012, .004, .055], [x, .01, z], mat("#d7cdbb"));
  scene.add(rug);

  const furniture = new Map();
  const sofa = new THREE.Group();
  const metal = mat("#a1a3a0", { metalness: .75, roughness: .3 });
  for (const x of [-.74, .74]) for (const z of [-.31, .31]) rod(sofa, [x, .015, z], [x, .16, z], .023, metal);
  box(sofa, [1.76, .23, .84], [0, .265, 0], grey, .045);
  box(sofa, [1.8, .38, .22], [0, .47, -.33], grey, .085);
  for (const x of [-.79, .79]) box(sofa, [.22, .43, .84], [x, .445, .02], grey, .085);
  box(sofa, [1.36, .14, .64], [0, .36, .1], grey, .055);
  box(sofa, [1.27, .006, .008], [0, .349, .421], mat("#81847f"), .002);
  furniture.set("sofa", sofa);
  const table = new THREE.Group();
  box(table, [1.18, .035, .5], [0, .4825, 0], ash, .017);
  for (const x of [-1, 1]) for (const z of [-1, 1]) rod(table, [x * .52, .015, z * .19], [x * .43, .465, z * .14], .016, birch, .028);
  furniture.set("table", table);
  const chair = new THREE.Group();
  const rail = new THREE.Shape();
  rail.moveTo(-.36, .025); rail.lineTo(.31, .025); rail.quadraticCurveTo(.4, .025, .4, .14);
  rail.lineTo(.4, .48); rail.quadraticCurveTo(.4, .61, .29, .61); rail.lineTo(-.22, .61);
  rail.lineTo(-.22, .574); rail.lineTo(.28, .574); rail.quadraticCurveTo(.362, .574, .362, .48);
  rail.lineTo(.362, .14); rail.quadraticCurveTo(.362, .063, .30, .063); rail.lineTo(-.36, .063); rail.closePath();
  for (const x of [-.34, .285]) {
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(rail, { depth: .055, bevelEnabled: false, curveSegments: 16 }), birch);
    mesh.rotation.y = -Math.PI / 2; mesh.position.x = x + .055; mesh.castShadow = true; mesh.receiveShadow = true; chair.add(mesh);
  }
  for (const x of [-.285, .285]) rod(chair, [x, .33, -.02], [x, .96, -.35], .022, birch);
  rod(chair, [-.29, .31, -.04], [.29, .31, -.04], .025, birch);
  rod(chair, [-.29, .91, -.32], [.29, .91, -.32], .024, birch);
  const seat = box(chair, [.56, .09, .5], [0, .375, .13], green, .035); seat.rotation.x = -.1;
  const back = box(chair, [.56, .60, .095], [0, .665, -.18], green, .035); back.rotation.x = -.43;
  const pillow = box(chair, [.52, .17, .12], [0, .902, -.28], green, .05); pillow.rotation.x = -.43;
  const bounds = new THREE.Box3().setFromObject(chair), size = bounds.getSize(new THREE.Vector3());
  chair.scale.set(.68 / size.x, 1 / size.y, .82 / size.z);
  const chairModel = new THREE.Group(); chairModel.add(chair);
  const scaled = new THREE.Box3().setFromObject(chair);
  chair.position.set(-(scaled.min.x + scaled.max.x) / 2, -scaled.min.y, -(scaled.min.z + scaled.max.z) / 2);
  furniture.set("chair", chairModel);
  const art = new THREE.Group();
  box(art, [.6, .8, .035], [0, 0, 0], ash, .003);
  box(art, [.558, .758, .008], [0, 0, .021], mat("#f0e7d8"));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(.15, 64), mat("#a9674e")); disc.position.set(-.045, .14, .027); art.add(disc);
  box(art, [.37, .22, .004], [.045, -.11, .028], mat("#75846c"));
  box(art, [.23, .06, .004], [-.04, -.26, .029], mat("#bd9c70"));
  furniture.set("painting", art);
  // BILLY-like bookcase, 80 W × 28 D × 202 H cm, back toward -z like the sofa.
  const shelf = new THREE.Group(), panel = mat("#f2efe9", { roughness: .7 });
  for (const x of [-.391, .391]) box(shelf, [.018, 2.02, .28], [x, 1.01, 0], panel);
  box(shelf, [.8, .018, .28], [0, 2.011, 0], panel);
  box(shelf, [.764, .07, .26], [0, .035, .01], panel);
  box(shelf, [.764, 1.95, .006], [0, 1.0, -.137], mat("#e6e2da"));
  const shelves = [.07, .45, .83, 1.21, 1.59];
  for (const y of shelves.slice(1)) box(shelf, [.764, .018, .26], [0, y, .005], panel);
  let seed = 11; const rnd = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
  const tones = ["#7f8c99", "#c8b79e", "#9a6a52", "#61705f", "#d9cfbf", "#44505d", "#b8a78a"];
  for (const [index, base] of shelves.entries()) {
    if (index === 4) continue;
    let x = -.36; const stop = index % 2 ? .05 : .3;
    while (x < stop) {
      const w = .018 + rnd() * .03, h = .2 + rnd() * .1;
      box(shelf, [w, h, .19], [x + w / 2, base + .009 + h / 2, -.02], mat(tones[Math.floor(rnd() * tones.length)], { roughness: .9 }));
      x += w + .002;
    }
  }
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(.05, .04, .16, 24), mat("#a9674e", { roughness: .6 }));
  vase.position.set(.22, 1.68, -.02); vase.castShadow = true; shelf.add(vase);
  furniture.set("bookcase", shelf);
  for (const group of furniture.values()) { group.visible = false; scene.add(group); }

  // Items use room.js centimetres; the rug is an item with id "rug" and is hidden when absent.
  function draw(items, { doorOpen = true } = {}) {
    door.rotation.y = doorOpen ? Math.PI / 4 : 0;
    rug.visible = false;
    for (const group of furniture.values()) group.visible = false;
    for (const item of items) {
      const mesh = item.id === "rug" ? rug : furniture.get(item.id);
      mesh.visible = true;
      mesh.position.set((item.x - 210) / 100, item.wall ? item.z / 100 : 0, item.wall ? -1.78 : (item.y - 180) / 100);
      mesh.rotation.set(0, item.wall ? 0 : -item.angle * Math.PI / 180, 0);
    }
    renderer.render(scene, camera);
  }
  return { draw };
}
