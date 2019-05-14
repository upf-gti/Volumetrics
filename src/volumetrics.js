
/***
 * ==Volume class==
 * Describes a 3D dataset
 ***/
Volume = function Volume(){
	//Length of dimensions
	this.width = 0;
	this.height = 0;
	this.depth = 0;

	//Distance between voxels in each dimension
	this.widthSpacing = 1;
	this.heightSpacing = 1;
	this.depthSpacing = 1;

	//Number of bits per voxel (only multiples of 8)
	this.voxelDepth = 8;
	this._voxelDepthBytes = this.voxelDepth/8;

	//Number of channels per voxel (e.g. 1 for grayscale, 3 for RGB)
	this.channels = 1;

	//Arraybuffer with all voxels. Dimensions increase in this order: width, height, depth
	this._dataBuffer = null;
	this._dataView = null;

	//Values that need to be precomputed. They only make sense in the case of 1 channel
	this._histogramBuffer = null;
	this._gradientBuffer = null;

	//GLTextures
	this._dataTexture = null;
	this._gradientTexture = null;
}

Volume.create = function(width, height, depth, options, dataBuffer){
	var vol = new Volume();
	vol.setVolume(width, height, depth, options, dataBuffer);
	return vol;
}

Volume.prototype.setVolume = function(width, height, depth, options, dataBuffer){
	if(width < 1 || height < 1 || depth < 1 || dataBuffer == null){
		console.error("Volume dimensions must be positive integers and dataBuffer must exist");
		return;
	}

	this.width = width;
	this.height = height;
	this.depth = depth;

	options = options || {};
	this.widthSpacing	= options.widthSpacing	|| this.widthSpacing;
	this.heightSpacing	= options.heightSpacing || this.heightSpacing;
	this.depthSpacing	= options.depthSpacing	|| this.depthSpacing;
	this.voxelDepth		= options.voxelDepth	|| this.voxelDepth;
	this._voxelDepthBytes = this.voxelDepth/8;
	this.channels		= options.channels		|| this.channels;
	if((this.voxelDepth / this.channels) % 8 != 0){
		console.warn("Only works with multiples of 8!")
	}

	this._dataBuffer = dataBuffer;
	this._dataView = new Uint8Array(this._dataBuffer);

	//Erase previous values if it's updated
	this._histogram = null;
	this._gradient = null;
}

Volume.prototype.isValid = function(){
	if(this.width > 0 && this.height > 0 && this.depth > 0 && this._dataBuffer != null){
		return (Math.ceil(this.getNumberOfVoxels() * this.voxelDepth / 8) == this._dataBuffer.byteLength);
	}
	return false;
}

Volume.prototype.getNumberOfVoxels = function(){
	return this.width * this.height * this.depth;
}

//Can accept both absolute i and (i, j, k)
Volume.prototype.getVoxel = function(i, j, k){
	if(j != undefined && k != undefined){
		i = i + this.width*j + this.width*this.height*k;
	}

	i = i * this._voxelDepthBytes;
	voxel = [];

	var voxelDepthBytesPerChannel = this._voxelDepthBytes / this.channels;
	for(var c=0; c<this.channels; c++){
		voxel.push(this._dataView[i+c]);
	}

	return voxel;
}

Volume.prototype.getDataTexture = function(){
	if(!this.isValid()) return false;

	if(this._dataTexture == null){
		var format = gl.LUMINANCE;	//TODO compute format depending on channels
		this._dataTexture = new GL.Texture(this.width, this.height, {depth: this.depth, texture_type: GL.TEXTURE_3D, format: format, magFilter: gl.NEAREST, wrap:gl.CLAMP_TO_EDGE, pixel_data: this._dataView});
	}

	return this._dataTexture;
}

Volume.prototype.computeHistogram = function(c){
	if(!this.isValid()) return;
	if(this.channels == 0){
		c = 0;
	}else if(this.channels > 1){
		if(c == undefined){
			console.warn("This function only computes 1 channel histogram. Using channel 0.");
			c = 0;
		}else if(c >= this.channels){
			console.error("Provided channel is larger than number of channels. Using channel 0.");
			c = 0;
		}
	}
	var voxelDepthPerChannel = this.voxelDepth / this.channels;
	var possibleValues = Math.pow(2, voxelDepthPerChannel);

	//todo check to know best typed array size
	var h = new Uint32Array(possibleValues);

	for(var i=0; i<this.width; i++){
		var v = this.getVoxel(i)[c];

		h[v]++;
	}

	this._histogram = h;
}

Volume.prototype.getHistogram = function(){
	if(this._histogram == null){
		this.computeHistogram(0);
	}

	return this._histogram;
}

/***
 * ==TransferFunction class==
 * Represents a TransferFunction composed by segments
 ***/
TransferFunction = function TransferFunction(){
	this.width = 256;

	//4 segmented lines, 1 for each channel
	this.R = [{x:0,y:0},{x:0.33,y:1},{x:0.66,y:0},{x:1,y:1}];
	this.G = [{x:0,y:0},{x:1,y:1}];
	this.B = [{x:0,y:0},{x:1,y:1}];
	this.A = [{x:0,y:0},{x:1,y:1}];

	this._buffer = null;
	this._view = null;
	this._needUpdate = false;

	this._texture = null;
	this._needUpload = false;
}

TransferFunction.prototype.sortChannel = function(channel){
	var c = this[channel];
	c.sort(function(a,b){
		if(a.x < b.x) return -1;
		if(a.x > b.x) return 1;
		return 0;
	});
}

TransferFunction.prototype.cleanChannel = function(channel){
	this.sortChannel(channel);

	var count = 0;
	for(var p of this[channel]){
		if(p.x < 0) count++;
	}
	this[channel].splice(0,count);
}

TransferFunction.prototype.initTransferFunction = function(){
	//Delete if they existed:
	this._buffer = null;
	this._view = null;

	//Create arraybuffer with addecuate size (delete previous one)
	this._buffer = new ArrayBuffer(this.width * 4);
	this._view = new Uint8Array(this._buffer);
}

TransferFunction.prototype.updateTransferFunction = function(){
	//Fill buffer data
	var i_r = i_g = i_b = i_a = 0;
	var r = g = b = a = 0;
	var t = 0;

	for(var i=0; i<this.width; i++){
		var pos = i*4;
		var i_01 = i / (this.width-1);

		if(i_r < this.R.length && i_01 > this.R[i_r].x) i_r++;
		if(i_g < this.G.length && i_01 > this.G[i_g].x) i_g++;
		if(i_b < this.B.length && i_01 > this.B[i_b].x) i_b++;
		if(i_a < this.A.length && i_01 > this.A[i_a].x) i_a++;

		//interpolate between points for each channel RGBA
		if(this.R.length == 0){
			r = 0;
		}else if(i_r == 0){
			r = this.R[i_r].y;
		}else if(i_r == this.R.length){
			r = this.R[i_r-1].y;
		}else{
			//avoid a hole in the universe fabric :)
			if(this.R[i_r-1].x == this.R[i_r].x){
				r = this.R[i_r].y;
			}else{
				t = (i_01-this.R[i_r-1].x)/(this.R[i_r].x-this.R[i_r-1].x);
				r = (1-t)*this.R[i_r-1].y + t*this.R[i_r].y;
			}
		}

		if(this.G.length == 0){
			g = 0;
		}else if(i_g == 0){
			g = this.G[i_g].y;
		}else if(i_g == this.G.length){
			g = this.G[i_g-1].y;
		}else{
			if(this.G[i_g-1].x == this.G[i_g].x){
				g = this.G[i_g].y;
			}else{
				t = (i_01-this.G[i_g-1].x)/(this.G[i_g].x-this.G[i_g-1].x);
				g = (1-t)*this.G[i_g-1].y + t*this.G[i_g].y;
			}
		}

		if(this.B.length == 0){
			b = 0;
		}else if(i_b == 0){
			b = this.B[i_b].y;
		}else if(i_b == this.B.length){
			b = this.B[i_b-1].y;
		}else{
			if(this.B[i_b-1].x == this.B[i_b].x){
				b = this.B[i_b].y;
			}else{
				t = (i_01-this.B[i_b-1].x)/(this.B[i_b].x-this.B[i_b-1].x);
				b = (1-t)*this.B[i_b-1].y + t*this.B[i_b].y;
			}
		}

		if(this.A.length == 0){
			a = 0;
		}else if(i_a == 0){
			a = this.A[i_a].y;
		}else if(i_a == this.A.length){
			a = this.A[i_a-1].y;
		}else{
			if(this.A[i_a-1].x == this.A[i_a].x){
				a = this.A[i_a].y;
			}else{
				t = (i_01-this.A[i_a-1].x)/(this.A[i_a].x-this.A[i_a-1].x);
				a = (1-t)*this.A[i_a-1].y + t*this.A[i_a].y;
			}
		}

		this._view[pos  ] = Math.round(r * (this.width-1));
		this._view[pos+1] = Math.round(g * (this.width-1));
		this._view[pos+2] = Math.round(b * (this.width-1));
		this._view[pos+3] = Math.round(a * (this.width-1));
	}

	this._needUpdate = false;
	this._needUpload = true;
}

TransferFunction.prototype.update = function(){
	if(this._needUpdate){
		this.updateTransferFunction();
	}

	if(this._needUpload){
		this.updateTexture();
	}
}

TransferFunction.prototype.getTransferFunction = function(){
	if(this._buffer == null){
		this.initTransferFunction();
		this.updateTransferFunction();
	}

	if(this._needUpdate){
		this.updateTransferFunction();
	}

	return this._view;
}

TransferFunction.prototype.getTexture = function(){
	if(this._texture == null){
		this.getTransferFunction();

		//Create GLTexture using that arraybuffer
		this._texture = new GL.Texture(this.width, 1, {texture_type: GL.TEXTURE_2D, format: gl.RGBA, magFilter: gl.NEAREST, pixel_data: this._view});
		this._needUpload = false;
	}

	if(this._needUpload){
		this.updateTexture();
	}

	return this._texture;
}

TransferFunction.prototype.updateTexture = function(){
	//Update texture data in GPU
	this._texture.uploadData(this._view, {}, false);
	this._needUpload = false;
}

/***
 * ==TransferFunction Editor Widget==
 ***/
TFEditor = function TFEditor(options){
	options = options || {};
	options.container = options.container || document.body;
	if(!(options.visible === true || options.visible === false)){
		options.visible = true;
	}

	this._top = 10;
	this._left = 20;
	this._bottom = 20;

	var rect = options.container.getBoundingClientRect();
	this._width = rect.width - this._left;
	if(this._width < 0) this._width = 0;
	this._r = 6 / 256;

	//Divs
	this.TFEdiv = document.createElement("div");
	this.TFEdivTop = document.createElement("div");
	this.TFEdivTools = document.createElement("div");
	this.TFEdivCanvas = document.createElement("div");

	this.TFEdiv.appendChild(this.TFEdivTop);
	this.TFEdiv.appendChild(this.TFEdivTools);
	this.TFEdiv.appendChild(this.TFEdivCanvas);
	this.TFEdiv.style.display = this.visible ? "block" : "none";

	//TODO provide a way to change style
	this.TFEdivTop.style["background-color"] = "#99ccff";
	this.TFEdivTools.style["background-color"] = "#e6f2ff";

	options.container.appendChild(this.TFEdiv);

	//Canvas
	this.canvas = document.createElement("canvas");
	this.ctx = this.canvas.getContext("2d");
	this.ctx.translate(0.5,0.5);
	this.setSize(this._width);
	this.TFEdivCanvas.appendChild(this.canvas);

	//Listeners
	this.canvas.addEventListener("mousedown", this._onMouseDown.bind(this));
	this.canvas.addEventListener("mouseup", this._onMouseUp.bind(this));
	this.canvas.addEventListener("mousemove", this._onMouseMove.bind(this));

	//State
	this.state = {
		mouse: {
			x: 0,
			y: 0,
			downx: 0,
			downy: 0,
			drag: false,
		},
		channel: null,
		selected: [],
	};

	//TF to edit and histogram to show
	this.tf = null;
	this.histogramBuffer = null;

	//Visible at start
	this.visible = options.visible;
	if(this.visible){
		this.show();
	}else{
		this.hide();
	}
}

TFEditor.prototype.show = function(){
	this.visible = true;
	this.TFEdiv.style.display = "block";
	this.render();
}

TFEditor.prototype.hide = function(){
	this.visible = false;
	this.TFEdiv.style.display = "none";
}

TFEditor.prototype.setSize = function(w){
	this._width = w;

	this.TFEdiv.style.width = (this._left + this._width) + "px";
	this.TFEdiv.style.height = (this._top + this._width + this._bottom) + "px";

	this.TFEdivTop.style.width = (this._left + this._width) + "px";
	this.TFEdivTop.style.height = this._top + "px";

	this.TFEdivTools.style.float = "left";
	this.TFEdivTools.style.width = this._left + "px";
	this.TFEdivTools.style.height = (this._width + this._bottom) + "px";

	this.canvas.width = this._width;
	this.canvas.height = this._width + this._bottom;

	//Change style
}

TFEditor.prototype.setTF = function(tf){
	this.tf = tf;
}

TFEditor.prototype.select = function(x, y){
	var r = this._r;
	this.state.selected = [];
	for(var channel of ["R", "G", "B", "A"]){
		if(this.state.channel == channel || this.state.channel == null){
			for(var p of this.tf[channel]){
				if(p.x >= x-r && p.x <= x+r && p.y >= y-r && p.y <= y+r){
					this.state.selected.push(p);
					break;
				}
			}
		}
	}
}

TFEditor.prototype.moveTo = function(x, y){
	if(this.state.selected.length > 0){
		for(var p of this.state.selected){
			p.x = x;
			p.y = y;
		}

		this.tf.sortChannel("R");
		this.tf.sortChannel("G");
		this.tf.sortChannel("B");
		this.tf.sortChannel("A");
		this.tf._needUpdate = true;
	}
}

TFEditor.prototype.create = function(x, y){
	for(var channel of ["R", "G", "B", "A"]){
		if(this.state.channel == channel || this.state.channel == null){
			var p = {x: x, y: y};
			this.tf[channel].push(p);
			this.tf.sortChannel(channel);
		}
		this.tf._needUpdate = true;
	}
}

TFEditor.prototype.remove = function(){
	if(this.state.selected.length > 0){
		for(var p of this.state.selected){
			p.x = -1;
		}

		this.tf.cleanChannel("R");
		this.tf.cleanChannel("G");
		this.tf.cleanChannel("B");
		this.tf.cleanChannel("A");
		this.tf._needUpdate = true;
	}
}

TFEditor.prototype._onMouseDown = function(event){
	this.state.mouse.drag = true;
	var x = this.state.mouse.downx = Math.min(Math.max(event.layerX, 0), this._width) / this._width;
	var y = this.state.mouse.downy = 1 - Math.min(Math.max(event.layerY, 0), this._width) / this._width;

	this.select(x, y);
}

TFEditor.prototype._onMouseUp = function(event){
	var x = this.state.mouse.x;
	var y = this.state.mouse.y;
	var dx = x - this.state.mouse.downx;
	var dy = y - this.state.mouse.downy;

	if(dx == 0 && dy == 0){
		if(this.state.selected.length > 0){
			this.remove();
		}else{
			this.create(x, y);
		}
	}

	this.state.mouse.selected = [];
	this.state.mouse.drag = false;
}

TFEditor.prototype._onMouseMove = function(event){
	var x = this.state.mouse.x = Math.min(Math.max(event.layerX, 0), this._width) / this._width;
	var y = this.state.mouse.y = 1 - Math.min(Math.max(event.layerY, 0), this._width) / this._width;

	if(this.state.mouse.drag){
		this.moveTo(x, y);
	}

}

TFEditor.prototype.drawGraph = function(){
	var w0 = 0;
	var h0 = 0;

	var w = this._width;
	var h = this._width;

	//Clear canvas
	var ctx = this.ctx;
	ctx.fillStyle = "rgb(200,200,200)";
	ctx.fillRect(w0,h0,w,h);

	//If histogram draw it in the back
	if(this.histogramBuffer){
		var l = this.histogramBuffer.length;
		var s = (l-1)/(w-1);

		ctx.fillStyle = "rgb(160,160,160)";
		for(var i=0; i<w; i++){
			var j = Math.round(i * s);

			ctx.fillRect(w0+i, h0+h-this.histogramBuffer[j], 1, this.histogramBuffer[j]);
		}
	}

	var pi2 = Math.PI*2;
	var radius = this._r * w;

	var channels = ["R", "G", "B", "A"];
	var fillStyles = ["rgb(255,0,0)", "rgb(0,255,0)", "rgb(0,0,255)", "rgb(255,255,255)"];
	var strokeStyles = ["rgb(255,0,0)", "rgb(0,255,0)", "rgb(0,0,255)", "rgb(255,255,255)"];
	for(var i = 0; i < 4; i++){
		var C = this.tf[channels[i]];
		ctx.fillStyle = fillStyles[i];
		ctx.strokeStyle = strokeStyles[i];

		ctx.lineWidth = 2*w / 256;
		ctx.beginPath();
		y = C.length > 0 ? h0+h - (h*C[0].y) : 0;
		ctx.moveTo(w0, y);
		for(var j=0; j<C.length; j++){
			x = w0 	 + w*C[j].x;
			y = h0+h - h*C[j].y;
			ctx.lineTo(x, y);
		}
		ctx.lineTo(w0+w, y);
		ctx.stroke();

		ctx.lineWidth = 1;
		for(var j=0; j<C.length; j++){
			x = w0 	 + w*C[j].x;
			y = h0+h - h*C[j].y;
			ctx.beginPath();
			ctx.ellipse(x,y,radius,radius,0,0,pi2);
			ctx.fill();
		}
	}
}

TFEditor.prototype.drawTF = function(){
	var w0 = 0;
	var h0 = this._width;

	var w = this._width;
	var h = this._bottom;

	//Clear canvas
	var ctx = this.ctx;
	ctx.fillStyle = "rgb(255,255,255)";
	ctx.fillRect(w0,h0,w,h);


	var hh = h/2;

	//Transparency squares
	ctx.fillStyle = "rgb(200,200,200)";
	var sqs = h / 4;
	for(var i=0; i<w/sqs+2; i++){
		ctx.fillRect(i*sqs, h0+hh+(i%2)*sqs, sqs, sqs);
	}

	//TF
	var transferFunction = this.tf.getTransferFunction();
	
	var l = 256 - 1;
	var s = l/(w-1);
	

	for(var i=0; i<w; i++){
		var pos = Math.round(i*s)*4;

		var r = transferFunction[pos];
		var g = transferFunction[pos+1];
		var b = transferFunction[pos+2];
		var a = transferFunction[pos+3]/l;

		ctx.fillStyle = "rgb("+r+","+g+","+b+")";
		ctx.fillRect(w0+i,h0,1,hh);
		ctx.fillStyle = "rgba("+r+","+g+","+b+","+a+")";
		ctx.fillRect(w0+i,h0+hh,1,hh);
	}
}

TFEditor.prototype.render = function(){
	if(this.visible){
		requestAnimationFrame( this.render.bind(this) );
		if(this.tf){
			this.drawGraph();
			this.drawTF();
		}
	}
}

/***
 * ==VolumeNode class==
 * Represents volume + tf + shader
 ***/
VolumeNode = function VolumeNode(){
	this._ctor();
}

VolumeNode.prototype._ctor = function(){
	RD.SceneNode.prototype._ctor.call(this);

	this._volume = null;
	this._tf = null;

	this.background = [0,0,0,0];
	this.intensity = 1;
	this.stepSize = 1;
	this.steps = 8;

	this.mesh = "proxy_box";
}

VolumeNode.prototype.render = function(renderer, camera){
	//Update uniforms depending on Volumetrics

	//Render node
	renderer.renderNode( this, camera );
}

Object.defineProperty(VolumeNode.prototype, "volume", {
	get: function() {
		return this._volume;
	},
	set: function(v) {
		this._volume = v;
		this.textures.volume = v;
	},
});

Object.defineProperty(VolumeNode.prototype, "tf", {
	get: function() {
		return this._tf;
	},
	set: function(v) {
		this._tf = v;
		this.textures.tf = v;
	},
});

Object.defineProperty(VolumeNode.prototype, "dimensions", {
	get: function() {
		return this.uniforms.u_dimensions;
	},
	set: function(v) {
		this.uniforms.u_dimensions = v;
	},
});
Object.defineProperty(VolumeNode.prototype, "resolution", {
	get: function() {
		return this.uniforms.u_resolution;
	},
	set: function(v) {
		this.uniforms.u_resolution = v;
	},
});
Object.defineProperty(VolumeNode.prototype, "background", {
	get: function() {
		return this.uniforms.u_background;
	},
	set: function(v) {
		this.uniforms.u_background = v;
	},
});

Object.defineProperty(VolumeNode.prototype, "intensity", {
	get: function() {
		return this.uniforms.u_intensity;
	},
	set: function(v) {
		this.uniforms.u_intensity = v;
	},
});

Object.defineProperty(VolumeNode.prototype, "stepSize", {
	get: function() {
		return this.uniforms.u_stepSize;
	},
	set: function(v) {
		this.uniforms.u_stepSize = v;
	},
});

Object.defineProperty(VolumeNode.prototype, "steps", {
	get: function() {
		return this.uniforms.u_steps;
	},
	set: function(v) {
		this.uniforms.u_steps = v;
	},
});

VolumeNode.prototype.hide = function(){
	this.flags.visible = false;
}

VolumeNode.prototype.show = function(){
	this.flags.visible = true;
}

extendClass( VolumeNode, RD.SceneNode );


/***
 * ==Volumetrics class==
 * Controls scene and renderers
 *
 * Useful options: canvas, container, visible, background
 ***/
Volumetrics = function Volumetrics(options){
	//WebGL Renderer and scene
	options = options || {};
	options.canvas = options.canvas || null;
	options.container = options.container || document.body;
	options.version = 2;
	this.context = GL.create(options);
	if( this.context.webgl_version != 2 || !this.context ){
	    alert("WebGL 2.0 not supported by your browser");
	}

	if(!(options.visible === true || options.visible === false)){
		options.visible = true;
	}
	options.background = options.background || [0.7,0.7,0.9,1];

	this.renderer = new RD.Renderer(this.context);
	this.scene = new RD.Scene();

	//Label renderer and storage
	this.labelRenderer = null; //new LabelRenderer();
	this.labels = {};

	//Volumes and TransferFunctions Storage
	this.volumes = {};
	this.tfs = {};

	//VolumeNode: controller storage. This is reflexed on scene nodes.
	this.volumeNodes = {};

	//Camera
	this.camera = new RD.Camera();

	//State (for inputs)
	this.state = {
		focusCamera: true,	//only when true keys and mouse will affect camera
		mouse:{
			dx: 0,
			dy: 0,
		},
		keyboard:{

		},
		
	};

	this.background = options.background;
	this.visible = options.visible;

	this.init();
}

Volumetrics.prototype.setSize = function(w, h){
	this.context.canvas.style.width = w;
	this.context.canvas.style.height = h;

	this.context.canvas.width = w;
	this.context.canvas.height = h;
}

Volumetrics.prototype.initProxyBox = function(){
	var mesh = GL.Mesh.box({sizex: 1, sizey: 1, sizez: 1, wireframe: true});

	var options = {};
	var buffers = {};
	//buffers.vertices = new Float32Array([-1,1,-1,-1,-1,+1,-1,1,1,-1,1,-1,-1,-1,-1,-1,-1,+1,1,1,-1,1,1,1,1,-1,+1,1,1,-1,1,-1,+1,1,-1,-1,-1,1,1,1,-1,1,1,1,1,-1,1,1,-1,-1,1,1,-1,1,-1,1,-1,1,1,-1,1,-1,-1,-1,1,-1,1,-1,-1,-1,-1,-1,-1,1,-1,1,1,1,1,1,-1,-1,1,-1,-1,1,1,1,1,1,-1,-1,-1,1,-1,-1,1,-1,1,-1,-1,-1,1,-1,1,-1,-1,1]);
	//switch orientation of faces so the front is inside
	buffers.vertices = new Float32Array([-1,1,-1,-1,1,1,-1,-1,1,-1,1,-1,-1,-1,1,-1,-1,-1,1,1,-1,1,-1,1,1,1,1,1,1,-1,1,-1,-1,1,-1,1,-1,1,1,1,1,1,1,-1,1,-1,1,1,1,-1,1,-1,-1,1,-1,1,-1,1,-1,-1,1,1,-1,-1,1,-1,-1,-1,-1,1,-1,-1,-1,1,-1,1,1,-1,1,1,1,-1,1,-1,1,1,1,-1,1,1,-1,-1,-1,1,-1,1,1,-1,-1,-1,-1,-1,-1,-1,1,1,-1,1]);
	buffers.normals = new Float32Array([-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0]);
	buffers.coords = new Float32Array([0,1,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0,0,1,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0,0,1,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0]);
	buffers.wireframe = new Uint16Array([0,2, 2,5, 5,4, 4,0,   6,7, 7,10, 10,11, 11,6, 0,6, 2,7, 5,10, 4,11  ]);
	options.bounding = BBox.fromCenterHalfsize( [0,0,0], [1,1,1] );


	this.renderer.meshes["proxy_box"] = GL.Mesh.load(buffers, options);
	
}

Volumetrics.prototype.init = function(){
	this.camera.perspective( 45, gl.canvas.width / gl.canvas.height, 1, 10000 );
	this.camera.lookAt( [100,100,100], [0,0,0], [0,1,0] );
	this.initProxyBox();

	//Add default tf
	var defaultTF = new TransferFunction();
	this.addTransferFunction(defaultTF, "tf_default");

	//Load shaders
	var volumetricShaderStrings = {
    "sh_default": {
    	v: '\
    	#version 300 es\n\
        precision highp float;\n\
        in vec3 a_vertex;\n\
        in vec3 a_normal;\n\
        in vec2 a_coord;\n\
        out vec3 v_pos;\n\
        out vec3 v_normal;\n\
        out vec2 v_coord;\n\
        uniform vec3 u_dimensions;\n\
        uniform mat4 u_mvp;\n\
        void main() {\n\
            v_pos = u_dimensions * a_vertex.xyz;\n\
            v_coord = a_coord;\n\
            v_normal = a_normal;\n\
            gl_Position = u_mvp * vec4(v_pos,1.0);\n\
        }\n\
    	',
    	f: '\
    	#version 300 es\n\
        precision highp float;\n\
        precision highp sampler3D;\n\
        in vec3 v_pos;\n\
        in vec3 v_normal;\n\
        in vec2 v_coord;\n\
        out vec4 color;\n\
        uniform vec3 u_eye;\n\
        uniform vec3 u_dimensions;\n\
        uniform vec3 u_resolution;\n\
        uniform vec4 u_background;\n\
        uniform sampler2D u_tf_texture;\n\
        uniform sampler3D u_volume_texture;\n\
        uniform float u_intensity;\n\
        uniform float u_stepSize;\n\
        uniform int u_steps;\n\
        uniform mat4 u_mvp;\n\
        uniform mat4 u_imvp;\n\
        \n\
        /* Return point where the ray enters the box. If the ray originates inside the box it returns the origin. */\n\
        vec3 rayOrigin(in vec3 ro, in vec3 rd){\n\
        	if(abs(ro.x) <= 1.0 && abs(ro.y) <= 1.0 && abs(ro.z) <= 1.0) return ro;\n\
            vec3 ip;\n\
            vec3 sides;\n\
            /* Only one these sides can hold the ray origin. The other faces will never hold it */\n\
            sides = vec3(-sign(rd.x),-sign(rd.y),-sign(rd.z));\n\
            for(int i=0; i<3; i++){\n\
                float c = (sides[i] - ro[i]) / rd[i];\n\
                ip[i] = sides[i];\n\
                ip[(i+1)%3] = c*rd[(i+1)%3]+ro[(i+1)%3];\n\
                ip[(i+2)%3] = c*rd[(i+2)%3]+ro[(i+2)%3];\n\
                if(abs(ip[(i+1)%3]) <= 1.0 && abs(ip[(i+2)%3]) <= 1.0) break;\n\
            }\n\
            return ip;\n\
        }\n\
        \n\
        /* Better voxel interpolation from www.iquilezles.org/www/articles/texture/texture.htm */\n\
        vec4 getVoxel( vec3 p ){\n\
		    p = p*u_resolution + 0.5;\n\
		    \n\
		    vec3 i = floor(p);\n\
		    vec3 f = p - i;\n\
		    f = f*f*f*(f*(f*6.0-15.0)+10.0);\n\
		    p = i + f;\n\
		    \n\
		    p = (p - 0.5)/u_resolution;\n\
		    return texture( u_volume_texture, p );\n\
		}\n\
        \n\
        void main() {\n\
            /* Compute ray origin and direction */\n\
                vec3 ro = u_eye;\n\
                vec3 rd = v_pos - ro;\n\
                vec3 re = v_pos;\n\
                \n\
            /* Transform ray to volume space [-1,1] */\n\
                ro = ( vec4(ro, 1.0) ).xyz / u_dimensions;\n\
                rd = ( vec4(rd, 1.0) ).xyz / u_dimensions;\n\
                re = ( vec4(re, 1.0) ).xyz / u_dimensions;\n\
                \n\
            /* Compute ray origin as a point on the volume space */\n\
                ro = rayOrigin(ro, rd);\n\
                \n\
            /* Use raymarching algorithm */\n\
            	vec4 cdest = vec4(0.0,0.0,0.0,0.0);\n\
            	vec3 rs = ro;	//Ray sample\n\
            	rd = (re-ro)/float(u_steps);	//Ray increment\n\
                for(int i=0; i<10000; i++){\n\
                	if(i > u_steps) break;\n\
                	vec3 absrs = abs(rs);\n\
                    if(i > 1 && absrs.x > 1.0 && absrs.y > 1.0 && absrs.z > 1.0) break;\n\
					\n\
					/* Interpolation */\n\
                    vec3 voxs = (rs + vec3(1.0))/2.0;\n\
                    float f = getVoxel(voxs).x;\n\
                    \n\
                    /* Classification */\n\
                    vec4 csrc = texture( u_tf_texture, vec2(f,0.0) );\n\
                    \n\
                    /* Shading and Illumination */\n\
                    csrc = vec4(csrc.xyz * csrc.w, csrc.w);\n\
                    \n\
                    /* Compositing */\n\
                    cdest = csrc * (1.0 - cdest.w) + cdest;\n\
                    \n\
                    if(cdest.w >= 1.0) break;\n\
                    rs = rs + rd;\n\
                    \n\
                }\n\
                \n\
            /* Final color */\n\
	            cdest = cdest * u_intensity;\n\
	            cdest = u_background * (1.0 - cdest.w) + cdest;\n\
	            color = cdest;\n\
                \n\
//            /* Debug */\n\
//                color = vec4(abs(re.x) == 1.0 ? 1.0 : 0.0, abs(re.y) == 1.0 ? 1.0 : 0.0, abs(re.z) == 1.0 ? 1.0 : 0.0, 1.0);\n\
//                color = vec4(abs(ro.x) == 1.0 ? 1.0 : 0.0, abs(ro.y) == 1.0 ? 1.0 : 0.0, abs(ro.z) == 1.0 ? 1.0 : 0.0, 1.0);\n\
//                color = vec4(abs(ro.x), abs(ro.y), abs(ro.z), 1.0);\n\
//                color = 0.1*vec4(distance(ro,re), distance(ro,re), distance(ro,re), 1.0);\n\
//                \n\
            }\n\
    	',
    }};

	for(var s of Object.keys(volumetricShaderStrings)){
		var shader = new GL.Shader(volumetricShaderStrings[s].v, volumetricShaderStrings[s].f);
		this.renderer.shaders[s] = shader;
	}

	//Mouse actions
	gl.captureMouse();
	this.renderer.context.onmousedown = this.onmousedown.bind(this);
	this.renderer.context.onmousemove = this.onmousemove.bind(this);

	//Key actions
	gl.captureKeys();
	this.renderer.context.onkey = this.onkey.bind(this);

	this.renderer._imvp_matrix = mat4.create();

	//Global shader uniforms
	this.renderer.setGlobalUniforms({
		"u_eye": this.camera.position,
		"u_imvp": this.renderer._imvp_matrix,
	});

	//Init visibility
	if(this.visible){
		this.show();
	}else{
		this.hide();
	}
}

Volumetrics.prototype.onmousedown = function(e){

}

Volumetrics.prototype.onmousemove = function(e){
	if(e.dragging){
		this.state.mouse.dx += e.deltax;
		this.state.mouse.dy += e.deltay;
	}
}

Volumetrics.prototype.onkey = function(e){
	if(e.eventType == "keydown"){
		this.state.keyboard[e.key] = true;
	}else if(e.eventType == "keyup"){
		this.state.keyboard[e.key] = false;
	}
}

Volumetrics.prototype.update = function(dt){
	//Update tfs textures
	for(var k of Object.keys(this.tfs)){
		this.tfs[k].update();
	}	

	//Update camera
	if(this.state.focusCamera){
		var front = vec3.clone(this.camera.getFront());
		var up = vec3.clone(this.camera.up);
		var right = vec3.clone(this.camera._right);

		vec3.normalize( front, front );
		vec3.normalize( up, up );
		vec3.normalize( right, right );

		var pos = vec3.clone(this.camera.position);
		var target = vec3.clone(this.camera.target);

		var v = dt*(this.state.keyboard.Shift ? 1000 : 100);

		if(this.state.keyboard.w){
			vec3.add(pos, pos, vec3.scale(front, front, v));
		}

		if(this.state.keyboard.s){
			vec3.add(pos, pos, vec3.scale(front, front, -v));
		}

		if(this.state.keyboard.d){
			vec3.add(pos, pos, vec3.scale(right, right, v));
		}

		if(this.state.keyboard.a){
			vec3.add(pos, pos, vec3.scale(right, right, -v));
		}

		if(this.state.keyboard.e){
			vec3.add(pos, pos, vec3.scale(up, up, v));
		}

		if(this.state.keyboard.q){
			vec3.add(pos, pos, vec3.scale(up, up, -v));
		}

		this.camera.position = pos;
	}

	//Update volume nodes uniforms
	for(var v of Object.keys(this.volumeNodes)){
		this.volumeNodes[v].eye = this.camera.position;

	}

	this.scene.update(dt);

	mat4.invert(this.renderer._imvp_matrix, this.renderer._mvp_matrix);
}

Volumetrics.prototype.render = function(){
	//clear
	this.renderer.clear(this.background);

	//render Scene
	this.renderer.render(this.scene, this.camera);

	//render Labels

}

Volumetrics.prototype.animate = function(){
	if(this.visible){
		requestAnimationFrame( this.animate.bind(this) );

		this._last = this._now || 0;
		this._now = getTime();
		var dt = (this._now - this._last) * 0.001;
		this.update(dt);
		this.render();
	}
}

Volumetrics.prototype.show = function(){
	this.visible = true;
	this.context.canvas.style.display = "block";
	this._last = getTime();
	this.animate();
}

Volumetrics.prototype.hide = function(){
	this.visible = false;
	this.context.canvas.style.display = "none";
}

Volumetrics.prototype.addVolume = function(volume, name){
	name = name || ("volume_" + Object.keys(this.volumes).length);
	this.volumes[name] = volume;
	this.renderer.textures[name] = volume.getDataTexture();
}

Volumetrics.prototype.getVolume = function(name){
	return this.volumes[name];
}

Volumetrics.prototype.getVolumes = function(){
	return this.volumes;
}

Volumetrics.prototype.addTransferFunction = function(tf, name){
	name = name || ("tf_" + Object.keys(this.tfs).length);
	this.tfs[name] = tf;
	this.renderer.textures[name] = tf.getTexture();
}

Volumetrics.prototype.getTransferFunction = function(name){
	return this.tfs[name];
}

Volumetrics.prototype.getTransferFunctions = function(){
	return this.tfs;
}

//Useful for showing possible "modes"
Volumetrics.prototype.getShaders = function(){
	return this.renderer.shaders;
}

//Volumenode components are referenced by name. They must be added sepparately before.
//Only data in volumenodes will be loaded into GPU to avoid overload.
//If some data is no longer used it will be unloaded from GPU
Volumetrics.prototype.addVolumeNode = function(volNode, name){
	name = name || ("vn_" + Object.keys(this.volumeNodes).length);

	if(volNode.tf == null){
		volNode.tf = "tf_default";
	}
	if(volNode.shader == null){
		volNode.shader = "sh_default";
	}

	volNode.mesh = "proxy_box";

	//TODO set dimensions uniform of volume node

	volNode.eye = this.camera.position;
	volNode.background = this.background;

	var v = this.volumes[volNode.volume];
	volNode.dimensions = [v.width*v.widthSpacing, v.height*v.heightSpacing, v.depth*v.depthSpacing];
	volNode.resolution = [v.width, v.height, v.depth];

	this.volumeNodes[name] = volNode;
	this.scene._root.addChild(volNode);
}

Object.defineProperty(Volumetrics.prototype, "background", {
	get: function() {
		return this._background;
	},
	set: function(b) {
		this._background = b;
		for(var v of Object.keys(this.volumeNodes)){
		this.volumeNodes[v].background = this.background;
		}
	},
});
