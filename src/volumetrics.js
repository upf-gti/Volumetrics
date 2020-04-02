"use strict"

/***
 * VOLUMETRICS.js
 * 
 ***/

/***
 * ==Volumetrics class==
 * Controls scene and renderers
 *
 * Useful options: container, visible, background, levelOfDetail
 ***/
var Volumetrics = function Volumetrics(options){
	//WebGL Renderer and scene
	options = options || {};
	this.outerContainer = options.container || document.body;
	options.version = 2;
	if(!(options.visible === true || options.visible === false)){
		options.visible = true;
	}

	//Containers
	this.container = document.createElement("div");
	this.container.style.position = "relative";
	this.container.style.overflow = "hidden";
	this.container.style.width = "100%";
	this.container.style.height = "100%";
	this.container.style["z-index"] = 0;
	this.outerContainer.appendChild(this.container);

	options.container = this.container;
	this.context = GL.create(options);
	if( this.context.webgl_version != 2 || !this.context ){
	    alert("WebGL 2.0 not supported by your browser");
	}

	this.canvas = this.context.canvas;
	this.canvas.style.position = "absolute";
	this.canvas.style.width = "100%";
	this.canvas.style.height = "100%";
	this.canvas.style["z-index"] = 1;
	gl.captureMouse(true);
	this.context.onmousedown = this.onmousedown.bind(this);
	this.context.onmousemove = this.onmousemove.bind(this);
	this.context.onmouseup = this.onmouseup.bind(this);
	this.context.onmousewheel = this.onmousewheel.bind(this);
	gl.captureKeys();
	this.context.onkey = this.onkey.bind(this);

	window.addEventListener("resize", this.onResize.bind(this));

	//Camera
	this.camera = new RD.Camera();
	this.initCamera();

	//Renderers
	this.layers = 0xFF;
	this.renderer = new RD.Renderer(this.context);
	this.volumes = {};
	this.tfs = {};
	this.initProxyBox();
	this.addTransferFunction(new TransferFunction(), "tf_default");

	this.scene = new RD.Scene();
	this.volumeNodes = {};
	this.sceneNodes = {};

	//Shaders
	this.volumeShaders = {};
	this.volumeShadersUrl = options.volumeShadersUrl || "http://127.0.0.1:5500/../src/volume_shader.glsl";
	this.volumeShaderMacrosMap = {};
	this.volumeShaderFiles = {};
	this.volumeShaderToLoad = [];
	this.loading_shaders = false;
	this.initShaders();


	//Global uniforms
	this.visible = options.visible;
	this.background = options.background || [0.7,0.7,0.9,1];
	this.cuttingPlane = options.cuttingPlane || [1,0,0,0];
	this.cuttingPlaneActive = options.cuttingPlaneActive || false;
	this.levelOfDetail = options.levelOfDetail = options.levelOfDetail || 100;



	//State
	this.activeMode = Volumetrics.MODES.CAMERAORBIT;
	this.mouse = {
		left: false,
		middle: false,
		right: false,
		downx: 0,
		downy: 0,
		downcameraposition: null,
		downglobalposition: null,
		upglobalpoint: null,
		x: 0,
		y: 0,
		dx: 0,
		dy: 0,
		dwheel: 0,
		pressed: false,
		dragging: false,
		wheel: false,
	};
	this.keyboard = {};

	this.fps = 0;
	this._fps = 0;
	setInterval(this.computeFPS.bind(this), 1000);



	if(this.visible){
		this.show();
	}else{
		this.hide();
	}

	Volumetrics._instance = this;
}

Volumetrics.MODES = {};
Volumetrics.MODES.NONE = 0;
Volumetrics.MODES.PICKPOSITION = 1;
Volumetrics.MODES.MEASURE = 2;
Volumetrics.MODES.CAMERAPAN = 10;
Volumetrics.MODES.CAMERAZOOM  = 11;
Volumetrics.MODES.CAMERAORBIT = 12;
Volumetrics.MODES.CAMERAROTATE = 13;

Volumetrics._instance = null;

///////////////////////////////////////////////////////////////////////////////////////////////
// Main
///////////////////////////////////////////////////////////////////////////////////////////////

Volumetrics.prototype.update = function(dt){
	var dx = this.mouse.dx;
	var dy = this.mouse.dy;
	var dw = this.mouse.dwheel;

	//Update tfs textures
	for(var k of Object.keys(this.tfs)){
		this.tfs[k].update();
	}

	this.updateCamera(dt);
	this.scene.update(dt);

	this.mouse.dx = this.mouse.dy = this.mouse.dwheel = 0;
}


Volumetrics.prototype.render = function(){
	//clear
	this.renderer.clear(this.background);

	//render Scene
	gl.enable(gl.DEPTH_TEST);
	this.renderer.render(this.scene, this.camera, null, this.layers);
	gl.disable(gl.DEPTH_TEST);
}

Volumetrics.prototype.animate = function(){
	if(this.visible){
		requestAnimationFrame( this.animate.bind(this) );

		this._last = this._now || 0;
		this._now = getTime();
		var dt = (this._now - this._last) * 0.001;
		this.update(dt);
		this.render();

		this._fps++;
	}
}

Volumetrics.prototype.show = function(){
	this.visible = true;
	this.canvas.style.display = "block";
	this._last = getTime();
	this.animate();
}

Volumetrics.prototype.hide = function(){
	this.visible = false;
	this.canvas.style.display = "none";
}

Volumetrics.prototype.onResize = function(){
	var rect = this.canvas.getBoundingClientRect();
	gl.viewport(0, 0, rect.width, rect.height);
}

///////////////////////////////////////////////////////////////////////////////////////////////
// State
///////////////////////////////////////////////////////////////////////////////////////////////

Volumetrics.prototype.computeFPS = function(){
	this.fps = this._fps;
	this._fps = 0;
}

Volumetrics.prototype.computeCameraProjection = function(x, y, point){
	return this.camera.getRayPlaneCollision(x, y, point, this.camera.getFront());
}

Volumetrics.prototype.computeProjections = function(){
	var x = this.mouse.x;
	var y = this.mouse.y;

	var mouseScreenPosition = vec2.fromValues(x, y);
	//var mouseGlobalPosition = this.pickPosition(x, y);
	var mouseCameraPosition = this.camera.getRayPlaneCollision(x, y, this.camera.target, this.camera.getFront());

	return {mouseScreenPosition: mouseScreenPosition, /*mouseGlobalPosition: mouseGlobalPosition,*/ mouseCameraPosition: mouseCameraPosition};
}

Volumetrics.prototype.onmousedown = function(e){
	this.mouse.left = e.which == 1;
	this.mouse.middle = e.which == 2;
	this.mouse.right = e.which == 3;
	this.mouse.downx = e.canvasx;
	this.mouse.downy = e.canvasy;
	this.mouse.pressed = true;

	var projections = this.computeProjections();
	this.mouse.downcameraposition = this.mouse.cameraposition = projections.mouseCameraPosition;
	this.mouse.downglobalposition = this.mouse.globalposition = projections.mouseGlobalPosition;

	if(this.activeMode == Volumetrics.MODES.PICKPOSITION && this.pickingCallback){
		var info = projections;
		info.down = true;
		info.dragging = false;
		info.up = false;
		info.left = this.mouse.left;
		info.middle = this.mouse.middle;
		info.right = this.mouse.right;
		this.pickingCallback(info);
	}
}

Volumetrics.prototype.onmousemove = function(e){
	this.mouse.x = e.canvasx;
	this.mouse.y = e.canvasy;
	this.mouse.dragging = e.dragging;
	if(this.mouse.dragging){
		this.mouse.dx += e.deltax;
		this.mouse.dy += e.deltay;

		var projections = this.computeProjections();
		this.mouse.cameraposition = projections.mouseCameraPosition;
		this.mouse.globalposition = projections.mouseGlobalPosition;

		if(this.activeMode == Volumetrics.MODES.PICKPOSITION && this.pickingCallback){
			var info = projections;
			info.down = false;
			info.dragging = true;
			info.up = false;
			info.left = this.mouse.left;
			info.middle = this.mouse.middle;
			info.right = this.mouse.right;
			this.pickingCallback(info);
		}
	}
}

Volumetrics.prototype.onmouseup = function(e){
	if(this.activeMode == Volumetrics.MODES.PICKPOSITION && this.pickingCallback){
		var info = {};
		info.mouseScreenPosition = vec2.fromValues(this.mouse.x, this.mouse.y);
		info.mouseCameraPosition = this.mouse.cameraposition;
		info.mouseGlobalPosition = this.mouse.globalposition;
		info.down = false;
		info.dragging = false;
		info.up = true;
		info.left = this.mouse.left;
		info.middle = this.mouse.middle;
		info.right = this.mouse.right;
		this.pickingCallback(info);
	}

	this.mouse.left = this.mouse.middle = this.mouse.right = false;
	this.mouse.dx = 0;
	this.mouse.dy = 0;
	this.mouse.pressed = false;
}

Volumetrics.prototype.onmousewheel = function(e){
	this.mouse.dwheel += e.wheel;
	this.mouse.wheel = true;

}

Volumetrics.prototype.onkey = function(e){
	if(e.eventType == "keydown"){
		this.keyboard[e.key] = true;
	}else if(e.eventType == "keyup"){
		this.keyboard[e.key] = false;
	}
}

///////////////////////////////////////////////////////////////////////////////////////////////
// Camera
///////////////////////////////////////////////////////////////////////////////////////////////

Volumetrics.prototype.initCamera = function(fov, pos, target){
	if(this.camera == null) this.camera = new RD.Camera();
	fov = fov || 45;
	pos = pos || [0,0,1000];
	target = target || [0,0,0];
	this.camera.perspective( fov, gl.canvas.width / gl.canvas.height, 1, 10000 );
	this.camera.lookAt( pos, target, [0,1,0] );
}

Volumetrics.prototype.panCamera = function(targetPoint, currentPoint){
	if(currentPoint == undefined) return;
	var delta = vec3.subtract(vec3.create(), targetPoint, currentPoint);
	this.camera.move(delta, 1);
}

Volumetrics.prototype.zoomCamera = function(d){
	this.camera.fov += d;
}

Volumetrics.prototype.orbitCamera = function(dtop, dright){
	this.camera.orbit(dtop, this.camera._top);
	var front = this.camera.getFront();
	var up = vec3.clone(this.camera.up);
	vec3.normalize(front, front);
	vec3.normalize(up, up);
	var d = vec3.dot(front, up);
	if(!((d > 0.99 && dright > 0) || (d < -0.99 && dright < 0)))
		this.camera.orbit(dright, this.camera._right);
}

Volumetrics.prototype.rotateCamera = function(dtop, dright){
	this.camera.rotate(dtop, this.camera._top);
	this.camera.rotate(dright, this.camera._right);
}

Volumetrics.prototype.updateCamera = function(dt){
	var dx = this.mouse.dx;
	var dy = this.mouse.dy;
	var dw = this.mouse.dwheel;

	if(this.mouse.left){
		switch(this.activeMode){
			//Update camera
			case Volumetrics.MODES.CAMERAPAN:
				if(this.mouse.dragging)
					var campos = this.camera.getRayPlaneCollision(this.mouse.x, this.mouse.y, this.camera.getFront());
					this.panCamera(this.mouse.downcameraposition, campos);
				break;
			case Volumetrics.MODES.CAMERAZOOM:
				if(this.mouse.dragging)
					this.zoomCamera(-10 * dt * dy);
				break;
			case Volumetrics.MODES.CAMERAORBIT:
				if(this.mouse.dragging)
					this.orbitCamera(-0.3 * dt * dx, -0.3 * dt * dy);
				break;
			case Volumetrics.MODES.CAMERAROTATE:
				if(this.mouse.dragging)
					this.rotateCamera(-0.3 * dt * dx, -0.3 * dt * dy);
				break;
		}
	}else if(this.mouse.middle){
		switch(this.activeMode){
			//Update camera
			case Volumetrics.MODES.NONE:
			case Volumetrics.MODES.CAMERAPAN:
			case Volumetrics.MODES.CAMERAZOOM:
			case Volumetrics.MODES.CAMERAORBIT:
			case Volumetrics.MODES.CAMERAROTATE:
				if(this.mouse.dragging)
					var campos = this.camera.getRayPlaneCollision(this.mouse.x, this.mouse.y, this.camera.target, this.camera.getFront());
					this.panCamera(this.mouse.downcameraposition, campos);
				break;
		}
	}else if(this.mouse.right){
		switch(this.activeMode){
			//Update camera
			case Volumetrics.MODES.NONE:
			case Volumetrics.MODES.CAMERAPAN:
			case Volumetrics.MODES.CAMERAZOOM:
			case Volumetrics.MODES.CAMERAORBIT:
			case Volumetrics.MODES.CAMERAROTATE:
				if(this.mouse.dragging)
					this.orbitCamera(-0.3 * dt * dx, -0.3 * dt * dy);
				break;
		}
	}else if(this.mouse.wheel){
		switch(this.activeMode){
			//Update camera
			case Volumetrics.MODES.NONE:
			case Volumetrics.MODES.CAMERAPAN:
			case Volumetrics.MODES.CAMERAZOOM:
			case Volumetrics.MODES.CAMERAORBIT:
			case Volumetrics.MODES.CAMERAROTATE:
				this.zoomCamera(-10 * dt * dw);
				break;
		}

		this.mouse.wheel = 0;
	}

	if(this.camera.fov < 10) this.camera.fov = 10;
	else if(this.camera.fov > 100) this.camera.fov = 100;
}

///////////////////////////////////////////////////////////////////////////////////////////////
// Shaders
///////////////////////////////////////////////////////////////////////////////////////////////

Volumetrics.prototype.addMacrosMapOptions = function(macros_map_str){
	var macros_map = JSON.parse(macros_map_str);

	for(var k of Object.keys(macros_map)){
		this.volumeShaderMacrosMap[k] = macros_map[k];
	}
}

Volumetrics.prototype.addShaders = function(shaders){
	for(var k of Object.keys(shaders)){
		this.volumeShaderFiles[k] = shaders[k];
	}
}

Volumetrics.prototype.loadShaders = function(url, callback){
	if(this.loading_shaders){
		this.volumeShaderToLoad.push({url: url, callback, callback});
		return;
	}

	var that = this;
	this.loading_shaders = true;
	
	//load shaders code from a files atlas
	GL.loadFileAtlas( url, function(files){
		if(files.macros_map){
			that.addMacrosMapOptions(files.macros_map);
			delete files.macros_map;
		}
		
		that.addShaders(files);
		that.loading_shaders = false;
		
		if(callback) callback();
		if(that.volumeShaderToLoad.length > 0){
			var next = that.volumeShaderToLoad.pop();
			that.loadShaders(next.url, next.callback);
		}
	});
}

Volumetrics.prototype.initShaders = function(){
	this.loadShaders(this.volumeShadersUrl);
}

Volumetrics.prototype.getShader = function(shader_name, macros){
	var full_shader_name = "vol_" + shader_name;

	var k = Object.keys(macros);
	k.sort();

	var map = this.volumeShaderMacrosMap;

	for(var macro of k){
		var value = macros[macro];
		var string_segment = " -" + macro + "=" + (map[macro] && map[macro][value] ? map[macro][value] : value);
		full_shader_name += string_segment;
	}

	if(!this.renderer.shaders[full_shader_name]){
		var vertex = this.volumeShaderFiles[shader_name + ".vs"] || this.volumeShaderFiles["volume_shader.vs"];
		var fragment = this.volumeShaderFiles[shader_name + ".fs"] || this.volumeShaderFiles["volume_shader.fs"];

		this.renderer.shaders[full_shader_name] = new GL.Shader(vertex, fragment, macros);
	}

	return full_shader_name;
}

///////////////////////////////////////////////////////////////////////////////////////////////
// Volumes
///////////////////////////////////////////////////////////////////////////////////////////////

Volumetrics.prototype.initProxyBox = function(){
	var options = {};
	var buffers = {};
	//switch orientation of faces so the front is inside
	buffers.vertices = new Float32Array([-1,1,-1,-1,1,1,-1,-1,1,-1,1,-1,-1,-1,1,-1,-1,-1,1,1,-1,1,-1,1,1,1,1,1,1,-1,1,-1,-1,1,-1,1,-1,1,1,1,1,1,1,-1,1,-1,1,1,1,-1,1,-1,-1,1,-1,1,-1,1,-1,-1,1,1,-1,-1,1,-1,-1,-1,-1,1,-1,-1,-1,1,-1,1,1,-1,1,1,1,-1,1,-1,1,1,1,-1,1,1,-1,-1,-1,1,-1,1,1,-1,-1,-1,-1,-1,-1,-1,1,1,-1,1]);
	buffers.normals = new Float32Array([-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0]);
	buffers.coords = new Float32Array([0,1,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0,0,1,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0,0,1,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0]);
	buffers.wireframe = new Uint16Array([0,2, 2,5, 5,4, 4,0, 6,7, 7,10, 10,11, 11,6, 0,6, 2,7, 5,10, 4,11]);
	options.bounding = BBox.fromCenterHalfsize( [0,0,0], [1,1,1] );


	this.renderer.meshes["proxy_box"] = GL.Mesh.load(buffers, options);
}

Volumetrics.prototype.addVolume = function(volume, name){
	name = name || ("volume_" + Object.keys(this.volumes).length);

	if(this.volumes[name] !== undefined){
		for(var v in this.volumeNodes){
			var volNode = this.volumeNodes[v];

			if(volNode.volume == name){
				volNode.setVolumeUniforms(volume);
			}
		}
	}

	this.volumes[name] = volume;
	this.renderer.textures[name] = volume.createTexture();
	return name;
}

Volumetrics.prototype.getVolume = function(name){
	return this.volumes[name];
}

Volumetrics.prototype.getVolumes = function(){
	return this.volumes;
}

Volumetrics.prototype.removeVolume = function(name){
	delete this.volumes[name];
	delete this.renderer.textures[name];
}

Volumetrics.prototype.renameVolume = function(name, newname){
	newname = this.addVolume(this.getVolume(name), newname);

	for(var node of Object.values(this.volumeNodes)){
		if(node.volume == name){
			node.volume = newname;
		}
	}
	this.removeVolume(name);

	return newname;
}

///////////////////////////////////////////////////////////////////////////////////////////////
// TransferFunctions
///////////////////////////////////////////////////////////////////////////////////////////////

Volumetrics.prototype.addTransferFunction = function(tf, name){
	name = name || ("tf_" + Object.keys(this.tfs).length);
	this.tfs[name] = tf;
	this.renderer.textures[name] = tf.getTexture();
	return name;
}

Volumetrics.prototype.getTransferFunction = function(name){
	return this.tfs[name];
}

Volumetrics.prototype.getTransferFunctions = function(){
	return this.tfs;
}

Volumetrics.prototype.removeTransferFunction = function(name){
	delete this.tfs[name];
	delete this.renderer.textures[name];
}

Volumetrics.prototype.renameTransferFunction = function(name, newname){
	newname = this.addTransferFunction(this.getTransferFunction(name), newname);

	for(var node of Object.values(this.volumeNodes)){
		if(node.tf == name){
			node.tf = newname;
		}
	}
	this.removeTransferFunction(name);

	return newname;
}

///////////////////////////////////////////////////////////////////////////////////////////////
// SceneNodes
///////////////////////////////////////////////////////////////////////////////////////////////

Volumetrics.prototype.addSceneNode = function(node){
	if(node instanceof VolumeNode) this.addVolumeNode(node);
	//if(node instanceof LabelNode) this.addLabelNode(node);

	this.sceneNodes[node._uid] = node;
	this.scene._root.addChild(node);
	return node._uid;
}

Volumetrics.prototype.getSceneNode = function(uid){
	return this.sceneNodes[uid];
}

Volumetrics.prototype.removeSceneNode = function(uid){
	if(this.sceneNodes[uid]){
		this.scene._to_destroy.push(this.sceneNodes[uid]);
		delete this.sceneNodes[uid];
	}
}

///////////////////////////////////////////////////////////////////////////////////////////////
// VolumeNodes
///////////////////////////////////////////////////////////////////////////////////////////////

Volumetrics.prototype.addVolumeNode = function(node){
	if(node._parent) return node._uid;	//TODO check if node is already used instead of this

	node.levelOfDetail = this.levelOfDetail;

	var volume = this.volumes[node.volume];
	node.setVolumeUniforms(volume);

	this.volumeNodes[node._uid] = node;
	this.scene._root.addChild(node);
	return node._uid;
}

Volumetrics.prototype.getVolumeNode = function(uid){
	return this.volumeNodes[uid];
}

Volumetrics.prototype.removeVolumeNode = function(uid){
	if(this.volumeNodes[uid]){
		this.scene._to_destroy.push(this.volumeNodes[uid]);
		delete this.volumeNodes[uid];
	}
}

//Setters apply to all volumeNodes

//background = [0,0,0,0];
//cuttingPlane = [A,B,C,D];
//cuttingPlaneActive bool

Object.defineProperty(Volumetrics.prototype, "background", {
	get: function() {
		return this._background;
	},
	set: function(v) {
		this._background = v;
		this.renderer.setGlobalUniforms({u_background: v});
	},
});

Object.defineProperty(Volumetrics.prototype, "cuttingPlane", {
	get: function() {
		return this._cuttingPlane;
	},
	set: function(v) {
		this._cuttingPlane = v;
		this.renderer.setGlobalUniforms({u_cutting_plane: v});
	},
});

Object.defineProperty(Volumetrics.prototype, "cuttingPlaneActive", {
	get: function() {
		return this._cuttingPlaneActive;
	},
	set: function(v) {
		this._cuttingPlaneActive = v;
		this.renderer.setGlobalUniforms({u_cutting_plane_active: v});
	},
});

Volumetrics.prototype.setGlobalUniform = function(name, value){
	var uniform = {};
	uniform[name] = value;
	this.renderer.setGlobalUniforms(uniform);
}

Object.defineProperty(Volumetrics.prototype, "levelOfDetail", {
	get: function() {
		return this._levelOfDetail;
	},
	set: function(v) {
		this._levelOfDetail = v;
		for(var node of Object.values(this.volumeNodes)){
		node.levelOfDetail = this.levelOfDetail;
		}
	},
});

Object.defineProperty(Volumetrics.prototype, "shader", {
	get: function() {
		return this._shader;
	},
	set: function(v) {
		this._shader = v;
		for(var node of Object.values(this.volumeNodes)){
		node.shader = this.shader;
		}
	},
});
