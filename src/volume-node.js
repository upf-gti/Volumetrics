"use strict"

/***
 * VOLUME-NODE.js
 * VolumeNode definition and integration with scene and renderer
 ***/
 
/***
 * ==VolumeNode class==
 * Represents volume + tf + shader + uniforms
 ***/
var VolumeNode = function VolumeNode(){
	this._ctor();
}

VolumeNode.prototype._ctor = function(){
	RD.SceneNode.prototype._ctor.call(this);

	//this._volume = null;

	this.intensity = 1;
	this.levelOfDetail = 100;

	this.mesh = "proxy_box";
	this.tf = "tf_default";

	this.uniforms.u_local_camera_position = vec3.create();

	this.uniforms.u_min_value = 0;
	this.uniforms.u_max_value = Math.pow(2,8);

	this._inverse_matrix = mat4.create();

	this._shader_name = "volume_shader";
	this._shader_full_name = "";
	this._update_shader = true;
	this._shader_macros = {
		TEXTURE_TYPE: 1,
		NORMALIZE_VOXEL_VALUE: 1,
		ISOSURFACE_MODE: 0,
	}
}

VolumeNode.prototype.render = function(renderer, camera){
	//Update uniforms depending on Volumetrics
	renderer.setModelMatrix(this._global_matrix);
	mat4.invert(this._inverse_matrix, this._global_matrix);

	//Local camera pos
	var aux_vec4;
    aux_vec4 = vec4.fromValues(camera.position[0], camera.position[1], camera.position[2], 1);
    vec4.transformMat4(aux_vec4, aux_vec4, this._inverse_matrix);
    this.uniforms.u_local_camera_position = vec3.fromValues(aux_vec4[0]/aux_vec4[3], aux_vec4[1]/aux_vec4[3], aux_vec4[2]/aux_vec4[3]);

	//Shader
	if(this._update_shader){
		this._shader_full_name = Volumetrics._instance.getShader(this._shader_name, this._shader_macros);
		this._update_shader = false;
	}

	//Render node
	renderer.renderNode( this, camera );
}

VolumeNode.prototype.setVolumeUniforms = function(volume){
	this.scaling = [volume.width*volume.widthSpacing, volume.height*volume.heightSpacing, volume.depth*volume.depthSpacing];
	this.resolution = [volume.width, volume.height, volume.depth];

	volume.computeMinMax();
	this.uniforms.u_min_value = volume._min;
	this.uniforms.u_max_value = volume._max;

	switch(volume.voxelType){
		case "UI":
			this._shader_macros.TEXTURE_TYPE = 2;
			break;
		case "I":
			this._shader_macros.TEXTURE_TYPE = 1;
			break;
		case "F":
			this._shader_macros.TEXTURE_TYPE = 0;
			break;
	}
}

Object.defineProperty(VolumeNode.prototype, "shader", {
	get: function() {
		return this._shader_full_name;
	},
	set: function(v) {
		this._shader_name = v;
	},
});

Object.defineProperty(VolumeNode.prototype, "volume", {
	get: function() {
		return this.textures.volume;
	},
	set: function(v) {
		this.textures.volume = v;
	},
});

Object.defineProperty(VolumeNode.prototype, "tf", {
	get: function() {
		return this.textures.tf;
	},
	set: function(v) {
		this.textures.tf = v;
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

Object.defineProperty(VolumeNode.prototype, "intensity", {
	get: function() {
		return this.uniforms.u_intensity;
	},
	set: function(v) {
		this.uniforms.u_intensity = v;
	},
});

Object.defineProperty(VolumeNode.prototype, "levelOfDetail", {
	get: function() {
		return this.uniforms.u_levelOfDetail;
	},
	set: function(v) {
		this.uniforms.u_levelOfDetail = v;
	},
});

Object.defineProperty(VolumeNode.prototype, "isosurfaceLevel", {
	get: function() {
		return this.uniforms.u_isosurfaceLevel;
	},
	set: function(v) {
		this.uniforms.u_isosurfaceLevel = v;
	},
});

VolumeNode.prototype.hide = function(){
	this.flags.visible = false;
}

VolumeNode.prototype.show = function(){
	this.flags.visible = true;
}

extendClass( VolumeNode, RD.SceneNode );
