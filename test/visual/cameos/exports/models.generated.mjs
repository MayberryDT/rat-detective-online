import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
//#region src/shared/ratAppearance.ts
/** Approved September 12 pool: same clothing colors, independently assigned. */
var CLOTHING_PALETTE = [
	{
		name: "Blue",
		color: 3697834
	},
	{
		name: "Green",
		color: 4424286
	},
	{
		name: "Plum",
		color: 8936329
	},
	{
		name: "Teal",
		color: 3771794
	},
	{
		name: "Ochre",
		color: 12951620
	},
	{
		name: "Orange",
		color: 13469503
	},
	{
		name: "Brown",
		color: 9926239
	},
	{
		name: "Slate",
		color: 8161692
	}
];
var HIGHLIGHT_PALETTE = [
	{
		name: "Ivory",
		color: 15327177
	},
	{
		name: "Tan",
		color: 13350294
	},
	{
		name: "Pearl gray",
		color: 12106184
	},
	{
		name: "Pale gold",
		color: 14270336
	}
];
var FUR_PALETTE = [
	{
		name: "Golden",
		color: 15251533
	},
	{
		name: "Taupe",
		color: 12033411
	},
	{
		name: "Warm gray",
		color: 11841707
	},
	{
		name: "Ivory",
		color: 15260352
	}
];
var HAT_COLORS = CLOTHING_PALETTE.map((entry) => entry.color);
var COAT_COLORS = CLOTHING_PALETTE.map((entry) => entry.color);
var HIGHLIGHT_COLORS = HIGHLIGHT_PALETTE.map((entry) => entry.color);
var FUR_COLORS = FUR_PALETTE.map((entry) => entry.color);
HAT_COLORS.length * COAT_COLORS.length * HIGHLIGHT_COLORS.length * FUR_COLORS.length;
var DEFAULT_APPEARANCE = {
	hatType: "fedora",
	hatColor: HAT_COLORS[6],
	coatColor: COAT_COLORS[0],
	highlightColor: HIGHLIGHT_COLORS[1],
	furColor: FUR_COLORS[0]
};
//#endregion
//#region src/utils/RatCoatGeometry.ts
/** Keep the rat's accepted body volume; tailoring sits just above this surface. */
var COAT_PROFILE = [
	[0, 0],
	[.485, 0],
	[.505, .025],
	[.503, .07],
	[.477, .65],
	[.434, 1.15],
	[.403, 1.285],
	[.35, 1.34],
	[0, 1.34]
];
function radiusAt(y) {
	for (let i = 3; i < COAT_PROFILE.length - 1; i++) {
		const [r0, y0] = COAT_PROFILE[i - 1], [r1, y1] = COAT_PROFILE[i];
		if (y <= y1) return THREE.MathUtils.lerp(r0, r1, (y - y0) / (y1 - y0));
	}
	return .35;
}
var frontZ = (x, y) => Math.sqrt(Math.max(0, radiusAt(y) ** 2 - x * x));
function addCoatTailoring(body, coat, highlight, shirt, fasteners) {
	const add = (name, geometry, mat) => {
		const part = new THREE.Mesh(geometry, mat);
		part.name = name;
		part.castShadow = true;
		part.userData.noOutline = true;
		body.add(part);
		return part;
	};
	const panel = (name, points, mat, offset, bevel = .005) => {
		const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
		const geometry = new THREE.ExtrudeGeometry(shape, {
			depth: .009,
			bevelEnabled: true,
			bevelSize: bevel,
			bevelThickness: .004,
			bevelSegments: 1,
			steps: 1,
			curveSegments: 2
		});
		const positions = geometry.getAttribute("position");
		for (let i = 0; i < positions.count; i++) {
			const x = positions.getX(i), y = positions.getY(i);
			positions.setZ(i, positions.getZ(i) + .445 - Math.abs(x) * .3 - (y - 1.35) * .18 + offset);
		}
		geometry.computeVertexNormals();
		return add(name, geometry, mat);
	};
	panel("rat-shirt-insert", [
		[-.11, 1.397],
		[.11, 1.397],
		[.068, 1.25],
		[0, 1.205],
		[-.068, 1.25]
	], shirt, -.014);
	panel("rat-tie", [
		[0, 1.327],
		[.026, 1.288],
		[.034, 1.223],
		[0, 1.185],
		[-.034, 1.223],
		[-.026, 1.288]
	], fasteners, .006, .003);
	panel("rat-tie-knot", [
		[-.026, 1.344],
		[.026, 1.344],
		[.022, 1.31],
		[0, 1.298],
		[-.022, 1.31]
	], fasteners, .015, .004);
	for (const side of [-1, 1]) panel(side < 0 ? "rat-lapel-left" : "rat-lapel-right", [
		[.068, 1.36],
		[.211, 1.457],
		[.287, 1.397],
		[.256, 1.367],
		[.274, 1.343],
		[.185, 1.218]
	].map(([x, y]) => [side * x, y]), highlight, .003, .006);
	const folds = [];
	function strip(points, width, height) {
		const positions = [], indices = [];
		for (const p of points) {
			const back = p.z < 0 ? -1 : 1;
			positions.push(p.x - width / 2, p.y, p.z, p.x, p.y, p.z + back * height, p.x + width / 2, p.y, p.z);
		}
		for (let i = 0; i < points.length - 1; i++) for (let j = 0; j < 2; j++) {
			const a = i * 3 + j, b = a + 3;
			indices.push(a, b, a + 1, a + 1, b, b + 1);
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
		if (points[0].z > 0) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
		geometry.setIndex(indices);
		geometry.computeVertexNormals();
		folds.push(geometry);
	}
	strip(Array.from({ length: 12 }, (_, i) => {
		const y = .065 + i * .098;
		return new THREE.Vector3(.014, y, frontZ(.014, y) + .002);
	}), .022, .008);
	strip([
		.058,
		.07,
		.65,
		1.15,
		1.285
	].map((y) => new THREE.Vector3(0, y, -radiusAt(y) - .004)), .022, .007);
	const hem = new THREE.LatheGeometry([
		new THREE.Vector2(.497, .023),
		new THREE.Vector2(.507, .033),
		new THREE.Vector2(.507, .044),
		new THREE.Vector2(.502, .055)
	], 32);
	folds.push(hem);
	const pocketRecesses = [];
	for (const side of [-1, 1]) {
		const shape = new THREE.Shape();
		shape.moveTo(-.094, -.014);
		shape.lineTo(.094, -.014);
		shape.lineTo(.094, .014);
		shape.lineTo(-.094, .014);
		shape.closePath();
		const lip = new THREE.ExtrudeGeometry(shape, {
			depth: .012,
			bevelEnabled: true,
			bevelSize: .005,
			bevelThickness: .003,
			bevelSegments: 1,
			steps: 1
		});
		const x = side * .302, y = .5;
		lip.rotateZ(side * .47);
		lip.rotateY(side * .63);
		lip.translate(x, y, frontZ(x, y) + .009);
		folds.push(lip);
		const recess = new THREE.PlaneGeometry(.156, .01);
		recess.rotateZ(side * .47);
		recess.rotateY(side * .63);
		recess.translate(x, y - .01, frontZ(x, y) + .025);
		pocketRecesses.push(recess);
	}
	const merge = (name, pieces, mat) => {
		const normalized = pieces.map((g) => g.index ? g.toNonIndexed() : g.clone());
		const merged = mergeGeometries(normalized);
		add(name, merged, mat);
		pieces.forEach((g) => g.dispose());
		normalized.forEach((g) => g.dispose());
	};
	merge("rat-coat-tailoring", folds, coat);
	merge("rat-pocket-openings", pocketRecesses, fasteners);
	for (const [index, y] of [
		1.035,
		.8,
		.565
	].entries()) {
		const geometry = new THREE.LatheGeometry([
			[0, -.008],
			[.033, -.008],
			[.043, -.002],
			[.043, .003],
			[.034, .013],
			[.024, .014],
			[0, .008]
		].map(([r, h]) => new THREE.Vector2(r, h)), 16);
		const button = add(`rat-button-${index + 1}`, geometry, fasteners);
		button.rotation.x = Math.PI / 2;
		button.position.set(.072, y, frontZ(.072, y) + .016);
	}
}
//#endregion
//#region src/utils/RatArmModel.ts
/** A floating cartoon sleeve and cuff, without an elbow or anatomical hand.
* Used for the pistol and equipped case; local +Z points toward the grip.
*/
function createRatArm(coat, highlight) {
	const root = new THREE.Group();
	root.name = "rat-floating-sleeve";
	const add = (name, profile, material) => {
		const geometry = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), 16);
		geometry.rotateX(Math.PI / 2);
		const part = new THREE.Mesh(geometry, material);
		part.name = name;
		part.castShadow = true;
		root.add(part);
	};
	add("rat-arm-sleeve", [
		[0, -.37],
		[.092, -.37],
		[.107, -.357],
		[.108, -.338],
		[.097, -.16],
		[.089, -.109],
		[0, -.109]
	], coat);
	add("rat-arm-cuff", [
		[0, -.117],
		[.091, -.117],
		[.098, -.11],
		[.098, -.007],
		[.104, .001],
		[.104, .011],
		[.095, .02],
		[0, .02]
	], highlight);
	const grip = new THREE.Object3D();
	grip.name = "rat-sleeve-grip";
	root.add(grip);
	return root;
}
/** The visible sleeve pivots here; weapon aiming keeps its existing independent rig. */
var RAT_GUN_SHOULDER = new THREE.Vector3(-.49, 1.2, -.12);
var sleeveTip = new THREE.Vector3(), sleeveForward = new THREE.Vector3(0, 0, 1);
/** Keep the shoulder fixed in coat space while the cuff follows the actual pistol grip. */
function updateGunSleeve({ shoulder, sleeve, arm, pistol }) {
	arm.updateMatrix();
	pistol.updateMatrix();
	sleeveTip.set(-.035, -.065, -.055).applyMatrix4(pistol.matrix).applyMatrix4(arm.matrix).sub(shoulder.position);
	const reach = Math.max(.001, sleeveTip.length());
	shoulder.quaternion.setFromUnitVectors(sleeveForward, sleeveTip.divideScalar(reach));
	sleeve.scale.z = reach / .37;
	sleeve.position.set(0, 0, reach);
}
//#endregion
//#region src/utils/RatModel.ts
function material(color, roughness = .78) {
	return new THREE.MeshStandardMaterial({
		color,
		roughness
	});
}
function mesh(parent, geometry, mat, x = 0, y = 0, z = 0) {
	const part = new THREE.Mesh(geometry, mat);
	part.position.set(x, y, z);
	part.castShadow = true;
	parent.add(part);
	return part;
}
function pivot(parent, name, x = 0, y = 0, z = 0) {
	const part = new THREE.Group();
	part.name = name;
	part.position.set(x, y, z);
	parent.add(part);
	return part;
}
/** Continuous cross sections keep the muzzle joined to the cheeks without a cylinder seam. */
function muzzleGeometry() {
	const rings = [
		[
			-.26,
			.025,
			.035,
			.06
		],
		[
			-.16,
			.025,
			.26,
			.25
		],
		[
			.02,
			.015,
			.32,
			.265
		],
		[
			.2,
			-.025,
			.26,
			.19
		],
		[
			.39,
			-.072,
			.145,
			.105
		],
		[
			.54,
			-.08,
			.055,
			.06
		]
	];
	const positions = [], indices = [];
	const segments = 16;
	for (const [z, cy, rx, ry] of rings) for (let i = 0; i < segments; i++) {
		const angle = i / segments * Math.PI * 2;
		positions.push(Math.cos(angle) * rx, cy + Math.sin(angle) * ry, z);
	}
	for (let ring = 0; ring < rings.length - 1; ring++) for (let i = 0; i < segments; i++) {
		const a = ring * segments + i, b = ring * segments + (i + 1) % segments;
		indices.push(a, b, a + segments, b, b + segments, a + segments);
	}
	for (let i = 1; i < segments - 1; i++) {
		indices.push(0, i + 1, i);
		const end = (rings.length - 1) * segments;
		indices.push(end, end + i, end + i + 1);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}
/** Solid open collar with a finished inner rim, rather than overlapping shoulder spheres. */
function collarGeometry() {
	const positions = [], indices = [];
	const segments = 24;
	for (const [radius, y] of [
		[.355, 1.255],
		[.405, 1.465],
		[.382, 1.455],
		[.33, 1.27]
	]) for (let i = 0; i <= segments; i++) {
		const angle = .56 + i / segments * (Math.PI * 2 - 1.12);
		positions.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius * .92);
	}
	for (let face = 0; face < 4; face++) for (let i = 0; i < segments; i++) {
		const a = face * 25 + i, b = (face + 1) % 4 * 25 + i;
		indices.push(a, b, a + 1, b, b + 1, a + 1);
	}
	for (const i of [0, segments]) {
		const a = i, b = 25 + i, c = 50 + i, d = 75 + i;
		if (i === 0) indices.push(a, c, b, a, d, c);
		else indices.push(a, b, c, a, c, d);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}
function cheesePistol(parent, coat, highlight) {
	const arm = pivot(parent, "rat-arm", -.49, .91, .09);
	arm.rotation.x = 1.28;
	const limb = createRatArm(coat, highlight);
	const shoulder = pivot(parent, "rat-gun-shoulder", RAT_GUN_SHOULDER.x, RAT_GUN_SHOULDER.y, RAT_GUN_SHOULDER.z);
	shoulder.add(limb);
	limb.getObjectByName("rat-arm-cuff").name = "rat-pistol-cuff";
	const pistol = pivot(arm, "rat-pistol");
	const cheese = material(15709742, .62), dark = material(2697258, .65);
	const shape = new THREE.Shape();
	shape.moveTo(-.17, .02);
	shape.lineTo(.23, .02);
	shape.lineTo(.25, .05);
	shape.lineTo(.25, .17);
	shape.lineTo(.2, .2);
	shape.lineTo(-.17, .17);
	shape.lineTo(-.2, .13);
	shape.closePath();
	for (const [x, y, radius] of [
		[
			.055,
			.105,
			.041
		],
		[
			-.11,
			.125,
			.025
		],
		[
			-.055,
			.035,
			.025
		]
	]) {
		const hole = new THREE.Path();
		hole.absarc(x, y, radius, 0, Math.PI * 2, true);
		shape.holes.push(hole);
	}
	const shell = new THREE.ExtrudeGeometry(shape, {
		depth: .13,
		bevelEnabled: true,
		bevelThickness: .008,
		bevelSize: .008,
		bevelSegments: 1,
		steps: 1,
		curveSegments: 12
	});
	shell.translate(0, 0, -.065);
	shell.rotateY(-Math.PI / 2);
	mesh(pistol, shell, cheese);
	const gripShape = new THREE.Shape();
	gripShape.moveTo(-.06, .035);
	gripShape.lineTo(.04, .035);
	gripShape.lineTo(.06, -.17);
	gripShape.lineTo(-.055, -.17);
	gripShape.closePath();
	const grip = new THREE.ExtrudeGeometry(gripShape, {
		depth: .075,
		bevelEnabled: true,
		bevelSize: .012,
		bevelThickness: .01,
		bevelSegments: 1,
		steps: 1
	});
	grip.translate(0, 0, -.0375);
	grip.rotateY(-Math.PI / 2);
	mesh(pistol, grip, dark, 0, 0, -.09);
	const rim = mesh(pistol, new THREE.TorusGeometry(.047, .012, 6, 16), material(10254111), 0, .106, .259);
	rim.name = "pistol-barrel";
	mesh(pistol, new THREE.CircleGeometry(.039, 16), dark, 0, .106, .259);
	pivot(pistol, "rat-muzzle", 0, .106, .28);
	updateGunSleeve({
		shoulder,
		sleeve: limb,
		arm,
		pistol
	});
}
/** Approved cheese-pistol concept, built as lightweight editable geometry. */
function createRatMesh(options = {}) {
	const root = new THREE.Group();
	const coat = material(options.coatColor ?? DEFAULT_APPEARANCE.coatColor), fur = material(options.furColor ?? DEFAULT_APPEARANCE.furColor);
	const skin = material(13209737, .68);
	coat.name = "rat-coat";
	skin.name = "rat-skin";
	const felt = material(options.hatColor ?? DEFAULT_APPEARANCE.hatColor);
	const highlight = material(options.highlightColor ?? DEFAULT_APPEARANCE.highlightColor);
	highlight.name = "rat-highlight";
	const shirt = material(highlight.color.clone().lerp(new THREE.Color(16777215), .22));
	const darkCoat = material(coat.color.clone().multiplyScalar(.32));
	shirt.name = "rat-shirt";
	darkCoat.name = "rat-fasteners";
	const body = pivot(root, "rat-body");
	const coatBody = mesh(body, new THREE.LatheGeometry(COAT_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 32), coat);
	coatBody.name = "rat-coat-body";
	mesh(body, collarGeometry(), highlight).name = "rat-collar";
	addCoatTailoring(body, coat, highlight, shirt, darkCoat);
	const head = pivot(body, "rat-head", 0, 1.6, .015);
	mesh(head, muzzleGeometry(), fur);
	mesh(head, new THREE.SphereGeometry(.068, 16, 10), material(3678759, .42), 0, -.08, .545);
	const white = material(15656140), pupil = material(1249818, .5);
	for (const side of [-1, 1]) {
		const eye = pivot(head, side < 0 ? "rat-eye-left" : "rat-eye-right", side * .175, .102, .268);
		eye.scale.x = .93;
		eye.rotation.y = side * .55;
		eye.rotation.z = side * .09;
		mesh(eye, new THREE.CircleGeometry(.101, 20, Math.PI, Math.PI), white);
		mesh(eye, new THREE.CircleGeometry(.063, 20, Math.PI, Math.PI), pupil, -side * .017, -.004, .004);
	}
	const hat = pivot(head, "rat-hat", 0, .19, 0);
	hat.rotation.x = .06;
	const brimRadius = .64;
	const brim = mesh(hat, new THREE.LatheGeometry([
		[0, -.0175],
		[brimRadius - .012, -.0175],
		[brimRadius, -.008],
		[brimRadius, .008],
		[brimRadius - .012, .0175],
		[0, .0175]
	].map(([r, y]) => new THREE.Vector2(r, y)), 40), felt);
	brim.name = "hat-brim";
	brim.scale.z = .8;
	const crownHeight = .38, crownBottom = .35, crownTop = .315;
	const crown = new THREE.CylinderGeometry(crownTop, crownBottom, crownHeight, 24, 3);
	{
		const points = crown.getAttribute("position");
		for (let i = 0; i < points.count; i++) {
			const top = Math.max(0, points.getY(i) / crownHeight * 2);
			const dent = .045 * (1 - Math.min(1, Math.abs(points.getX(i)) / .24));
			points.setY(i, points.getY(i) - dent * top);
		}
		crown.computeVertexNormals();
	}
	const crownMesh = mesh(hat, crown, felt, 0, .202, 0);
	crownMesh.name = "hat-crown";
	crownMesh.scale.z = .86;
	const radiusAt = (height) => crownBottom + (crownTop - crownBottom) * ((height - .012) / crownHeight) + .008;
	const hatBand = mesh(hat, new THREE.CylinderGeometry(radiusAt(.1025), radiusAt(.0275), .075, 24), highlight, 0, .065, 0);
	hatBand.name = "rat-hatband";
	hatBand.scale.z = .86;
	for (const side of [-1, 1]) {
		const ear = pivot(hat, side < 0 ? "rat-ear-left" : "rat-ear-right", side * .475, .026, 0);
		const outer = mesh(ear, new THREE.SphereGeometry(.13, 20, 12), fur, 0, .14, 0);
		outer.scale.set(1, 1.075, .34);
		outer.userData.noOutline = true;
		const inner = mesh(ear, new THREE.SphereGeometry(.095, 20, 12), skin, 0, .143, .032);
		inner.scale.set(1, 1.07, .2);
		inner.userData.noOutline = true;
	}
	const tailCurve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(0, 0, 0),
		new THREE.Vector3(.02, -.18, -.42),
		new THREE.Vector3(.17, -.19, -.88),
		new THREE.Vector3(.2, -.17, -1.17)
	]);
	const tail = mesh(root, new THREE.TubeGeometry(tailCurve, 24, .052, 10, false), skin, 0, .25, -.44);
	tail.name = "rat-tail";
	mesh(tail, new THREE.SphereGeometry(.052, 12, 8), skin, .2, -.17, -1.17);
	cheesePistol(body, coat, highlight);
	return root;
}
//#endregion
//#region src/utils/disposeMeshResources.ts
/** Release an owned, untextured model. Parts may share resources within it. */
function disposeMeshResources(root) {
	const skeletons = /* @__PURE__ */ new Set();
	const geometries = /* @__PURE__ */ new Set();
	const materials = /* @__PURE__ */ new Set();
	root.traverse((child) => {
		if (child instanceof THREE.SkinnedMesh) skeletons.add(child.skeleton);
		if (child instanceof THREE.Mesh) {
			geometries.add(child.geometry);
			for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
		}
	});
	skeletons.forEach((skeleton) => skeleton.dispose());
	geometries.forEach((geometry) => geometry.dispose());
	materials.forEach((material) => material.dispose());
}
//#endregion
//#region test/visual/cameos/CameoRatModel.ts
var v = (p) => new THREE.Vector3(...p);
var cloth = (color, roughness = .8) => new THREE.MeshStandardMaterial({
	color,
	roughness
});
function part(parent, name, geometry, material, position = [
	0,
	0,
	0
]) {
	const result = new THREE.Mesh(geometry, material);
	result.name = name;
	result.position.set(...position);
	result.castShadow = true;
	result.receiveShadow = true;
	parent.add(result);
	return result;
}
function oval(parent, name, material, position, scale) {
	const result = part(parent, name, new THREE.SphereGeometry(1, 20, 12), material, position);
	result.scale.set(...scale);
	return result;
}
function rod(parent, name, material, a, b, r, end = r) {
	const delta = v(b).sub(v(a));
	const result = part(parent, name, new THREE.CylinderGeometry(end, r, delta.length(), 12), material);
	result.position.copy(v(a).add(v(b)).multiplyScalar(.5));
	result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
	return result;
}
function curve(parent, name, material, points, radius) {
	return part(parent, name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v)), 32, radius, 6, false), material);
}
function plaque(parent, name, material, points, position, depth = .012) {
	const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
	return part(parent, name, new THREE.ExtrudeGeometry(shape, {
		depth,
		bevelEnabled: false
	}), material, position);
}
/** Add a joint without changing any mesh's authored world-space rest pose. */
function joint(parent, name, position, children) {
	const group = new THREE.Group();
	group.name = name;
	group.position.set(...position);
	parent.add(group);
	parent.updateWorldMatrix(true, true);
	for (const child of children) group.attach(child);
	return group;
}
/** Costumed art subjects only. No RatEntity, physics, combat, network or live-model changes. */
function createCameoRat(kind) {
	const root = new THREE.Group();
	root.name = `${kind}-rat`;
	const red = cloth(12130357), blue = cloth(1461137), black = cloth(1251879), gray = cloth(5857646);
	const skin = cloth(13011848), fur = cloth(10193272), gold = cloth(13477188, .48);
	const white = cloth(16774881, .42), ink = cloth(1316131);
	const spider = kind === "spider", suit = spider ? red : gray;
	const reference = createRatMesh();
	const muzzleGeometry = reference.getObjectByName("rat-head").children[0].geometry.clone();
	disposeMeshResources(reference);
	const torso = new THREE.Group();
	torso.name = "cameo-torso";
	root.add(torso);
	torso.position.set(0, spider ? .91 : 1.04, spider ? .06 : 0);
	torso.rotation.x = spider ? .18 : 0;
	oval(torso, "suit-body", suit, [
		0,
		0,
		0
	], [
		.43,
		.52,
		.32
	]);
	if (spider) {
		for (const side of [-1, 1]) oval(torso, "blue-side-panel", blue, [
			side * .35,
			-.06,
			-.005
		], [
			.11,
			.34,
			.25
		]);
		oval(torso, "blue-hips", blue, [
			0,
			-.34,
			-.015
		], [
			.35,
			.2,
			.27
		]);
	} else {
		oval(torso, "trunks", black, [
			0,
			-.34,
			0
		], [
			.36,
			.2,
			.28
		]);
		const belt = part(torso, "utility-belt", new THREE.CylinderGeometry(.4, .405, .13, 24), gold, [
			0,
			-.2,
			0
		]);
		belt.scale.z = .79;
		for (let i = -2; i <= 2; i++) {
			const angle = i * .53;
			const pouch = part(torso, "belt-pouch", new THREE.BoxGeometry(.11, .16, .075), gold, [
				Math.sin(angle) * .405,
				-.2,
				Math.cos(angle) * .32
			]);
			pouch.rotation.y = angle;
		}
		part(torso, "belt-buckle", new THREE.BoxGeometry(.13, .095, .035), black, [
			0,
			-.2,
			.38
		]);
		const bat = [
			[-.32, .11],
			[-.23, .08],
			[-.16, .05],
			[-.09, .11],
			[-.04, .07],
			[-.025, .14],
			[0, .1],
			[.025, .14],
			[.04, .07],
			[.09, .11],
			[.16, .05],
			[.23, .08],
			[.32, .11],
			[.26, -.01],
			[.19, .005],
			[.13, -.075],
			[.065, -.045],
			[0, -.15],
			[-.065, -.045],
			[-.13, -.075],
			[-.19, .005],
			[-.26, -.01]
		];
		oval(torso, "emblem-backing", gold, [
			0,
			.15,
			.295
		], [
			.34,
			.18,
			.035
		]);
		plaque(torso, "bat-emblem", black, bat, [
			0,
			.15,
			.331
		]);
	}
	if (spider) {
		oval(torso, "spider-abdomen", ink, [
			0,
			.11,
			.321
		], [
			.052,
			.085,
			.022
		]);
		oval(torso, "spider-head", ink, [
			0,
			.205,
			.302
		], [
			.039,
			.043,
			.026
		]);
		for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
			const y = .22 - i * .058, endY = [
				.35,
				.27,
				-.02,
				-.12
			][i];
			curve(torso, "spider-emblem-leg", ink, [
				[
					side * .027,
					y,
					.325
				],
				[
					side * .13,
					y + .035,
					.303
				],
				[
					side * .2,
					endY,
					.273
				]
			], .012);
		}
		for (const y of [
			-.12,
			.02,
			.3,
			.4
		]) {
			const points = [];
			for (let i = 0; i <= 16; i++) {
				const x = -.27 + i * .54 / 16;
				points.push([
					x,
					y,
					.32 * Math.sqrt(Math.max(.015, 1 - x * x / (.43 * .43) - y * y / (.52 * .52))) + .006
				]);
			}
			curve(torso, "chest-web", ink, points, .005);
		}
	}
	for (const side of [-1, 1]) {
		const hip = [
			side * .22,
			spider ? .68 : .79,
			-.015
		];
		const knee = spider ? [
			side * .56,
			.47,
			.2
		] : [
			side * .25,
			.45,
			.015
		];
		const ankle = spider ? [
			side * .48,
			.12,
			-.01
		] : [
			side * .28,
			.13,
			.015
		];
		rod(root, "thigh", spider ? blue : gray, hip, knee, .18, .17);
		oval(root, "knee", spider ? blue : gray, knee, [
			.17,
			.17,
			.17
		]);
		rod(root, "boot-shaft", spider ? red : black, knee, ankle, .15, .115);
		oval(root, "boot", spider ? red : black, [
			ankle[0],
			.095,
			.14
		], [
			.16,
			.095,
			.27
		]);
		const shoulder = [
			side * .36,
			spider ? 1.18 : 1.36,
			.045
		];
		const elbow = spider ? [
			side * .48,
			.72,
			.3
		] : [
			side * .49,
			.98,
			.025
		];
		const wrist = spider ? [
			side * .34,
			.22,
			.49
		] : [
			side * .49,
			.67,
			.07
		];
		const armStart = root.children.length;
		oval(root, "shoulder", suit, shoulder, [
			.18,
			.19,
			.18
		]);
		rod(root, "upper-arm", spider ? blue : gray, shoulder, elbow, .13, .115);
		oval(root, "elbow", spider ? red : black, elbow, [
			.115,
			.12,
			.115
		]);
		rod(root, "gauntlet", spider ? red : black, elbow, wrist, .12, .08);
		const handStart = root.children.length;
		oval(root, "gloved-paw", spider ? red : black, [
			wrist[0],
			wrist[1] - .04,
			wrist[2] + .015
		], [
			.11,
			.115,
			.08
		]);
		if (spider) for (let f = 0; f < 3; f++) rod(root, "glove-finger", red, [
			wrist[0] + (f - 1) * .062,
			.145,
			.52
		], [
			wrist[0] + (f - 1) * .074,
			.058,
			.61
		], .025);
		else for (let f = 0; f < 3; f++) {
			const fin = plaque(root, "gauntlet-fin", black, [
				[0, 0],
				[side * .14, .055],
				[0, .11]
			], [
				side * .585,
				.75 + f * .08,
				.015
			], .05);
			fin.castShadow = true;
		}
		const pieces = root.children.slice(armStart);
		const upper = joint(root, `cameo-arm-${side < 0 ? "left" : "right"}`, shoulder, pieces.slice(0, 2));
		const lower = joint(root, `cameo-forearm-${side < 0 ? "left" : "right"}`, elbow, pieces.slice(2));
		const handPieces = pieces.slice(handStart - armStart, spider ? void 0 : handStart - armStart + 1);
		const hand = joint(root, `cameo-hand-${side < 0 ? "left" : "right"}`, wrist, handPieces);
		lower.attach(hand);
		upper.attach(lower);
	}
	const head = new THREE.Group();
	head.name = "cameo-head";
	head.position.set(0, spider ? 1.46 : 1.72, spider ? .19 : .025);
	root.add(head);
	head.scale.setScalar(1.12);
	part(head, "game-rat-muzzle", muzzleGeometry, spider ? red : fur);
	oval(head, "mask-cranium", spider ? red : black, [
		0,
		.11,
		-.035
	], [
		.321,
		.29,
		.28
	]);
	oval(head, "nose", spider ? ink : black, [
		0,
		-.08,
		.545
	], [
		.067,
		.06,
		.062
	]);
	for (const side of [-1, 1]) {
		const ear = new THREE.Group();
		ear.name = `ear-${side < 0 ? "left" : "right"}`;
		ear.position.set(side * .345, .285, -.065);
		ear.rotation.z = -side * .2;
		head.add(ear);
		oval(ear, "costumed-ear", spider ? red : black, [
			0,
			0,
			0
		], [
			.155,
			.185,
			.065
		]);
		oval(ear, "pink-inner-ear", skin, [
			0,
			0,
			.052
		], [
			.104,
			.133,
			.023
		]);
		if (!spider) {
			const point = part(head, "cowl-point", new THREE.ConeGeometry(.073, .3, 4), black, [
				side * .22,
				.43,
				-.015
			]);
			point.rotation.z = -side * .1;
		}
		const eye = new THREE.Group();
		eye.name = `eye-${side}`;
		eye.position.set(side * .173, .095, .258);
		eye.rotation.y = side * .57;
		head.add(eye);
		const mirror = (spider ? [
			[-.135, .08],
			[-.07, .18],
			[.13, .21],
			[.095, .01],
			[.005, -.035],
			[-.09, .005]
		] : [
			[-.12, .075],
			[.13, .13],
			[.08, -.015],
			[-.045, -.025]
		]).map(([x, y]) => [x * side, y]);
		plaque(eye, "black-eye-rim", ink, mirror, [
			0,
			0,
			0
		]);
		const lens = plaque(eye, "white-eye-lens", white, mirror.map(([x, y]) => [x * .76, y * .76]), [
			0,
			.018,
			.016
		]);
		lens.castShadow = false;
	}
	if (spider) {
		for (const latitude of [
			-.1,
			.35,
			.75,
			1.13
		]) {
			const points = [];
			for (let i = 0; i <= 48; i++) {
				const a = i / 48 * Math.PI * 2;
				points.push([
					.324 * Math.cos(latitude) * Math.sin(a),
					.11 + .293 * Math.sin(latitude),
					-.035 + .283 * Math.cos(latitude) * Math.cos(a)
				]);
			}
			curve(head, "mask-web-ring", ink, points, .0045);
		}
		for (let i = 0; i < 10; i++) {
			const a = i / 10 * Math.PI * 2, points = [];
			for (let j = 0; j <= 20; j++) {
				const t = -.25 + j / 20 * 1.79;
				points.push([
					.325 * Math.cos(t) * Math.sin(a),
					.11 + .294 * Math.sin(t),
					-.035 + .284 * Math.cos(t) * Math.cos(a)
				]);
			}
			curve(head, "mask-web-spoke", ink, points, .0045);
		}
		for (const z of [
			.3,
			.4,
			.48
		]) {
			const width = z === .3 ? .204 : z === .4 ? .134 : .087;
			curve(head, "snout-web", ink, [
				[
					-width,
					-.065,
					z
				],
				[
					-width * .7,
					.005,
					z
				],
				[
					0,
					.055 - (z - .3) * .25,
					z
				],
				[
					width * .7,
					.005,
					z
				],
				[
					width,
					-.065,
					z
				]
			], .0045);
		}
	} else {
		curve(head, "deadpan-mouth", black, [
			[
				-.13,
				-.129,
				.377
			],
			[
				0,
				-.141,
				.45
			],
			[
				.13,
				-.129,
				.377
			]
		], .007);
		const cape = new THREE.Group();
		cape.name = "cameo-cape";
		root.add(cape);
		const positions = [], indices = [];
		const columns = 40, rows = 14;
		for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
			const t = j / rows, u = i / columns * 2 - 1, angle = u * 1.77;
			const radius = .34 + t * .52;
			const scallop = .14 * Math.pow(Math.sin((u + 1) * Math.PI * 3), 2) * Math.pow(t, 8);
			positions.push(Math.sin(angle) * radius, 1.46 * (1 - t) + .055 + scallop, -.07 - Math.cos(angle) * (radius * .7) + Math.sin(u * Math.PI * 6) * .025 * t);
			if (j < rows && i < columns) {
				const a = j * 41 + i;
				indices.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2);
			}
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
		geometry.setIndex(indices);
		geometry.computeVertexNormals();
		const capeMaterial = cloth(1383725);
		capeMaterial.side = THREE.DoubleSide;
		const capeMesh = part(cape, "scalloped-cape", geometry, capeMaterial);
		cape.position.set(0, 1.48, -.07);
		capeMesh.position.sub(cape.position);
		for (const side of [-1, 1]) oval(root, "cape-clasp", gold, [
			side * .22,
			1.48,
			.21
		], [
			.045,
			.045,
			.025
		]);
	}
	const tailPoints = spider ? [
		[
			0,
			.52,
			-.22
		],
		[
			.18,
			.4,
			-.65
		],
		[
			.64,
			.25,
			-.96
		],
		[
			.99,
			.33,
			-.85
		],
		[
			1.04,
			.48,
			-.62
		]
	] : [
		[
			0,
			.32,
			-.24
		],
		[
			.16,
			.16,
			-.73
		],
		[
			.61,
			.09,
			-.88
		],
		[
			.97,
			.11,
			-.62
		],
		[
			.94,
			.15,
			-.37
		]
	];
	const tail = curve(root, "tail-curve", skin, tailPoints, .038);
	oval(tail, "tail-tip", skin, tailPoints[tailPoints.length - 1], [
		.038,
		.038,
		.038
	]);
	joint(root, "cameo-tail", tailPoints[0], [tail]);
	const groups = [];
	root.traverse((object) => {
		if (object instanceof THREE.Group) groups.push(object);
	});
	groups.reverse().forEach(batchStatic);
	root.traverse((node) => {
		if (node instanceof THREE.Mesh) compactGeometry(node.geometry);
	});
	joint(root, "cameo-motion", [
		0,
		0,
		0
	], [...root.children]);
	root.userData = {
		kind,
		artPrototype: true,
		pose: spider ? "rooftop-crouch" : "sewer-sentinel"
	};
	return root;
}
function compactGeometry(geometry) {
	geometry.deleteAttribute("uv");
	const attributes = Object.entries(geometry.attributes);
	const count = geometry.index?.count ?? geometry.getAttribute("position").count;
	const vertices = /* @__PURE__ */ new Map(), indices = [];
	const unique = [];
	for (let i = 0; i < count; i++) {
		const vertex = geometry.index ? geometry.index.getX(i) : i;
		const key = attributes.map(([, attribute]) => {
			const values = [];
			for (let c = 0; c < attribute.itemSize; c++) values.push(attribute.array[vertex * attribute.itemSize + c]);
			return values.join(",");
		}).join("|");
		let index = vertices.get(key);
		if (index === void 0) {
			index = unique.length;
			vertices.set(key, index);
			unique.push(vertex);
		}
		indices.push(index);
	}
	for (const [name, attribute] of attributes) {
		const values = new Float32Array(unique.length * attribute.itemSize);
		unique.forEach((vertex, index) => {
			for (let c = 0; c < attribute.itemSize; c++) values[index * attribute.itemSize + c] = attribute.array[vertex * attribute.itemSize + c];
		});
		geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
	}
	geometry.setIndex(indices);
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
}
function batchStatic(group) {
	const batches = /* @__PURE__ */ new Map();
	for (const child of group.children) if (child instanceof THREE.Mesh && child.children.length === 0 && !Array.isArray(child.material)) {
		const items = batches.get(child.material) ?? [];
		items.push(child);
		batches.set(child.material, items);
	}
	for (const [material, meshes] of batches) {
		if (meshes.length < 2) continue;
		const geometries = meshes.map((mesh) => {
			mesh.updateMatrix();
			const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
			geometry.deleteAttribute("uv");
			return geometry.applyMatrix4(mesh.matrix);
		});
		const merged = mergeGeometries(geometries);
		geometries.forEach((g) => g.dispose());
		if (!merged) continue;
		for (const mesh of meshes) {
			group.remove(mesh);
			mesh.geometry.dispose();
		}
		part(group, `${group.name || "detail"}-batch`, merged, material);
	}
}
//#endregion
//#region test/visual/cameos/CameoAnimator.ts
var CAMEO_DURATIONS = {
	idle: 8,
	passerby: 4.8,
	shot: 5.4
};
var smooth = (a, b, t) => {
	const x = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
	return x * x * (3 - 2 * x);
};
var beat = (t, start, attack, hold, end) => smooth(start, attack, t) * (1 - smooth(hold, end, t));
var names = [
	"cameo-motion",
	"cameo-torso",
	"cameo-head",
	"cameo-tail",
	"cameo-cape",
	"cameo-arm-left",
	"cameo-arm-right",
	"cameo-forearm-left",
	"cameo-forearm-right",
	"cameo-hand-left",
	"cameo-hand-right",
	"ear-left",
	"ear-right",
	"eye--1",
	"eye-1"
];
/** Absolute-time poses: scrubbing, interruption and frame rate cannot accumulate transforms. */
var CameoAnimator = class {
	root;
	kind;
	parts = /* @__PURE__ */ new Map();
	constructor(root, kind) {
		this.root = root;
		this.kind = kind;
		for (const name of names) {
			const node = root.getObjectByName(name);
			if (node) this.parts.set(name, {
				node,
				position: node.position.clone(),
				rotation: node.rotation.clone(),
				quaternion: node.quaternion.clone(),
				scale: node.scale.clone()
			});
		}
	}
	reset() {
		for (const { node, position, quaternion, scale } of this.parts.values()) {
			node.position.copy(position);
			node.quaternion.copy(quaternion);
			node.scale.copy(scale);
		}
	}
	rotate(name, x = 0, y = 0, z = 0) {
		const part = this.parts.get(name);
		if (part) part.node.rotation.set(part.rotation.x + x, part.rotation.y + y, part.rotation.z + z);
	}
	move(name, x = 0, y = 0, z = 0) {
		const part = this.parts.get(name);
		if (part) part.node.position.set(part.position.x + x, part.position.y + y, part.position.z + z);
	}
	scale(name, x = 1, y = 1, z = 1) {
		const part = this.parts.get(name);
		if (part) part.node.scale.set(part.scale.x * x, part.scale.y * y, part.scale.z * z);
	}
	eyes(y) {
		this.scale("eye--1", 1, y, 1);
		this.scale("eye-1", 1, y, 1);
	}
	ears(fold, twitch = 0) {
		this.rotate("ear-left", fold, 0, -twitch);
		this.rotate("ear-right", fold, 0, twitch);
	}
	sample(reaction, seconds, direction = 1) {
		this.reset();
		if (!Number.isFinite(seconds) || seconds < 0) return;
		const length = CAMEO_DURATIONS[reaction];
		if (reaction !== "idle" && seconds >= length) return;
		const t = reaction === "idle" ? seconds % length : seconds;
		const side = Number.isFinite(direction) && direction < 0 ? -1 : 1;
		if (reaction === "idle") this.idle(t);
		else if (reaction === "passerby") this.passerby(t, side);
		else this.shot(t, side);
	}
	idle(t) {
		const phase = t / 8 * Math.PI * 2, breath = Math.sin(phase * 2);
		this.scale("cameo-torso", 1 + breath * .009, 1 + breath * .015, 1 + breath * .012);
		this.rotate("cameo-tail", 0, Math.sin(phase * 2) * .13, Math.sin(phase) * .025);
		const blink = beat(t, 2.1, 2.18, 2.23, 2.36) + beat(t, 6.15, 6.23, 6.26, 6.4);
		this.eyes(1 - blink * .82);
		if (this.kind === "spider") {
			const glance = beat(t, .6, 1.4, 2.4, 3.3) - beat(t, 4.1, 4.7, 5.6, 6.8);
			this.rotate("cameo-head", breath * .045, glance * .3, Math.sin(phase) * .04);
			this.ears(0, beat(t, 3.4, 3.48, 3.5, 3.7) * .22);
			this.rotate("cameo-hand-right", 0, 0, Math.sin(t * 14) * beat(t, 4.2, 4.4, 4.9, 5.2) * .1);
		} else {
			this.rotate("cameo-head", -.035 * Math.sin(phase), Math.sin(phase) * .16, 0);
			this.rotate("cameo-cape", Math.sin(phase) * .025, Math.sin(phase) * .035, Math.sin(phase * 2) * .012);
			this.ears(0, beat(t, 4.2, 4.3, 4.4, 4.8) * .14);
		}
	}
	passerby(t, side) {
		const notice = beat(t, .05, .45, 3.3, 4.6), track = (1 - 2 * smooth(.8, 3.2, t)) * side;
		this.rotate("cameo-head", 0, track * .68 * notice, 0);
		this.rotate("cameo-tail", 0, -track * .16 * notice, 0);
		if (this.kind === "spider") {
			const wave = beat(t, .5, 1.05, 2.65, 3.25), wobble = beat(t, 2.7, 2.85, 2.98, 3.55);
			const arm = side > 0 ? "right" : "left";
			this.rotate(`cameo-arm-${arm}`, -.25 * wave, 0, side * 1.95 * wave);
			this.rotate(`cameo-forearm-${arm}`, -.5 * wave, 0, side * (.25 + Math.sin(t * 13) * .22) * wave);
			this.rotate(`cameo-hand-${arm}`, 0, Math.sin(t * 13) * .3 * wave, 0);
			this.rotate("cameo-motion", 0, 0, -side * .055 * wave + side * .09 * wobble);
			this.scale("cameo-motion", 1, 1 - .075 * wobble, 1);
			this.rotate("cameo-head", -.08 * wave, track * .68 * notice, -side * .16 * wave);
			this.eyes(1 - .2 * wave + .22 * wobble);
			this.ears(0, wobble * .15);
		} else {
			const nod = beat(t, 1.1, 1.4, 1.52, 1.95), cloak = beat(t, 1.6, 2.1, 2.7, 3.7);
			this.rotate("cameo-head", nod * .23, track * .68 * notice, side * notice * .06);
			this.rotate("cameo-arm-left", -.18 * cloak, 0, -.12 * cloak);
			this.rotate("cameo-forearm-left", -.75 * cloak, 0, .3 * cloak);
			this.rotate("cameo-cape", 0, side * .17 * cloak, side * .025 * cloak);
			this.eyes(1 - .25 * notice);
		}
	}
	shot(t, side) {
		const flinch = beat(t, 0, .09, .18, .48);
		this.ears(-.65 * flinch, flinch * .2);
		this.rotate("cameo-tail", 0, Math.sin(t * 19) * .24 * beat(t, 0, .1, .9, 1.4), 0);
		if (this.kind === "spider") {
			const pop = beat(t, .18, .32, .39, .62), web = beat(t, .55, .82, 1.7, 2);
			const jam = beat(t, 1.82, 2.15, 3.1, 3.5), shrug = beat(t, 3.4, 3.8, 4.6, 5.35);
			const pulse = (Math.sin(t * 24) * .5 + .5) * web;
			this.scale("cameo-motion", 1 + flinch * .08, 1 - flinch * .2, 1 + flinch * .07);
			this.move("cameo-motion", 0, pop * .13, 0);
			this.rotate("cameo-head", -.2 * flinch + .17 * jam, .38 * jam, side * .19 * shrug);
			this.eyes(1 + .4 * flinch - .25 * jam - .2 * shrug);
			for (const armSide of [-1, 1]) {
				const arm = armSide < 0 ? "left" : "right";
				this.rotate(`cameo-arm-${arm}`, -.2 * web - .2 * pulse, 0, armSide * (.6 * flinch + .35 * web + .72 * shrug));
				this.rotate(`cameo-forearm-${arm}`, -1.42 * web - 1 * shrug, 0, 0);
				this.rotate(`cameo-hand-${arm}`, -.32 * pulse, .2 * shrug, armSide * .45 * shrug);
			}
			this.rotate("cameo-arm-right", -.1 * web, 0, .35 * web + .3 * jam + .72 * shrug + .6 * flinch);
			this.rotate("cameo-forearm-right", -1.42 * web - 1.65 * jam - 1 * shrug, 0, Math.sin(t * 27) * .19 * jam);
			this.rotate("cameo-hand-right", Math.sin(t * 30) * .35 * jam - .32 * pulse, 0, .45 * shrug);
		} else {
			const duck = beat(t, .12, .42, 1.35, 1.9), check = beat(t, .9, 1.13, 1.5, 1.9);
			const dust = beat(t, 2.1, 2.45, 3.5, 3.95), pride = beat(t, 3.55, 4, 4.65, 5.35);
			this.scale("cameo-motion", 1 + flinch * .08, 1 - .14 * duck - .06 * flinch, 1);
			this.move("cameo-head", side * .13 * check, -.3 * duck, 0);
			this.rotate("cameo-head", -.12 * duck - .16 * pride, side * .5 * check - side * .1 * dust, 0);
			this.eyes(1 + .3 * flinch - .45 * check - .28 * pride);
			this.rotate("cameo-arm-left", -.75 * duck, 0, -.4 * duck);
			this.rotate("cameo-forearm-left", -1.1 * duck, 0, .2 * duck);
			this.rotate("cameo-arm-right", -.75 * duck - .5 * dust, 0, .4 * duck - .72 * dust);
			this.rotate("cameo-forearm-right", -1.1 * duck - 1.45 * dust, 0, Math.sin(t * 13) * .17 * dust);
			this.rotate("cameo-hand-right", Math.sin(t * 13) * .2 * dust, 0, 0);
			this.scale("cameo-torso", 1 + .055 * pride, 1 + .045 * pride, 1 + .045 * pride);
		}
	}
	/** Bake exactly the preview poses to portable glTF node animation tracks. */
	clips() {
		const clips = [];
		for (const reaction of [
			"idle",
			"passerby",
			"shot"
		]) {
			const frames = Math.round(CAMEO_DURATIONS[reaction] * 30);
			const tracks = /* @__PURE__ */ new Map();
			for (const name of this.parts.keys()) tracks.set(name, {
				position: [],
				quaternion: [],
				scale: []
			});
			const times = [];
			for (let i = 0; i <= frames; i++) {
				const time = i / 30;
				times.push(time);
				this.sample(reaction, time);
				for (const [name, { node }] of this.parts) {
					const values = tracks.get(name);
					node.position.toArray(values.position, values.position.length);
					node.quaternion.toArray(values.quaternion, values.quaternion.length);
					node.scale.toArray(values.scale, values.scale.length);
				}
			}
			const keys = [];
			for (const [name, values] of tracks) for (const property of [
				"position",
				"quaternion",
				"scale"
			]) {
				const valuesForProperty = values[property], stride = property === "quaternion" ? 4 : 3;
				if (!valuesForProperty.some((n, i) => Math.abs(n - valuesForProperty[i % stride]) > 1e-7)) continue;
				const Track = property === "quaternion" ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
				keys.push(new Track(`${name}.${property}`, times, valuesForProperty));
			}
			clips.push(new THREE.AnimationClip(`${this.kind}-${reaction}`, CAMEO_DURATIONS[reaction], keys).optimize());
		}
		this.reset();
		return clips;
	}
};
//#endregion
export { CAMEO_DURATIONS, CameoAnimator, createCameoRat };
