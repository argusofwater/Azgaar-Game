import { state } from './state.js';
import { CanvasMapRenderer } from './mapRenderer.js';
import { loadDemoMap } from './importer.js';

const canvas = document.getElementById('map');

const renderer = new CanvasMapRenderer({
  canvas,
  onProvinceSelected: (province) => {
    console.log('Selected province:', province.name);
    const info = document.getElementById('provinceInfo');
    if (info) info.textContent = province.name;
  }
});

function loadWorld(world) {
  state.nations = world.nations;
  state.provinces = world.provinces;

  renderer.setWorld({
    nations: state.nations,
    provinces: state.provinces
  });
}

// TEMP: load demo automatically
loadWorld(loadDemoMap());

console.log('Renderer wired successfully');
