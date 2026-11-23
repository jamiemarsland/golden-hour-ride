// Build in a temporary directory containing this entry and npm packages
// three@0.160.0 and esbuild@0.25.12. Copy Three's LICENSE alongside the result.
// esbuild entry.mjs --bundle --minify --format=iife --global-name=RideThree --legal-comments=inline --outfile=ride-three.min.js
export * as THREE from 'three';
export { Sky } from 'three/addons/objects/Sky.js';
export { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
export { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
export { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
export { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
export { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
export { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
