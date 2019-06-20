"use strict"

/***
 * === VOLUMETRICS.js ===
 * v1.0
 ***/

/***
 * ==Utils class==
 ***/
 var Utils = {};

 Utils.toHalf = (function() {
 	//https://esdiscuss.org/topic/float16array
	
	var floatView = new Float32Array(1);
	var int32View = new Int32Array(floatView.buffer);

	/* This method is faster than the OpenEXR implementation (very often
	 * used, eg. in Ogre), with the additional benefit of rounding, inspired
	 * by James Tursa?s half-precision code. */
	return function toHalf(val) {

		floatView[0] = val;
		var x = int32View[0];

		var bits = (x >> 16) & 0x8000; /* Get the sign */
		var m = (x >> 12) & 0x07ff; /* Keep one extra bit for rounding */
		var e = (x >> 23) & 0xff; /* Using int is faster here */

		/* If zero, or denormal, or exponent underflows too much for a denormal
		 * half, return signed zero. */
		if (e < 103) {
			return bits;
		}

		/* If NaN, return NaN. If Inf or exponent overflow, return Inf. */
		if (e > 142) {
			bits |= 0x7c00;
			/* If exponent was 0xff and one mantissa bit was set, it means NaN,
			 * not Inf, so make sure we set one mantissa bit too. */
			bits |= ((e == 255) ? 0 : 1) && (x & 0x007fffff);
			return bits;
		}

		/* If exponent underflows but not too much, return a denormal */
		if (e < 113) {
			m |= 0x0800;
			/* Extra rounding may overflow and set mantissa to 0 and exponent
			 * to 1, which is OK. */
			bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
			return bits;
		}

		bits |= ((e - 112) << 10) | (m >> 1);
		/* Extra rounding. An overflow will set mantissa to 0 and increment
		 * the exponent, which is OK. */
		bits += m & 1;
		return bits;
	};
}());

Utils.uint16ArrayToHalf = function(view){
	var view16 = new Uint16Array(view.length);
	for(var i = 0; i<view.length; i++){
		view16[i] = Utils.toHalf(view[i]);
	}
	return view16;
}

/***
 * ==Volume class==
 * Describes a 3D dataset
 ***/
var Volume = function Volume(){
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

	//Auxiliar
	this._voxelSize = null;
	this._byteSize = null;
	this._min = null;
	this._max = null;
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

	this._voxelSize = this.width * this.height * this.depth;
	this._byteSize = this._voxelSize * this._voxelDepthBytes;

	this._dataBuffer = dataBuffer;
	this._dataView = null;
	if(this.voxelDepth == 8){
		this._dataView = new Uint8Array(this._dataBuffer);
	}else if(this.voxelDepth == 16){
		this._dataView = new Uint16Array(this._dataBuffer);
	}else if(this.voxelDepth == 32){
		this._dataView = new Float32Array(this._dataBuffer);
	}
	

	//Erase previous values if it's updated
	this._histogram = null;
	this._gradient = null;
}

Volume.prototype.isValid = function(){
	if(this.width > 0 && this.height > 0 && this.depth > 0 && this._dataBuffer != null){
		return this._byteSize == this._dataBuffer.byteLength;
	}
	return false;
}

Volume.prototype.getDataTexture = function(){
	if(!this.isValid()) return false;

	var internalFormat = gl.R8;
	var format = gl.RED;
	var type = gl.UNSIGNED_BYTE;

	if(this.voxelDepth == 16){
		internalFormat = gl.R16F;
		format = gl.RED;
		type = gl.HALF_FLOAT;
	}else if(this.voxelDepth == 32){
		internalFormat = gl.R32F;
		format = gl.RED;
		type = gl.FLOAT;
	}

	if(this._dataTexture == null){
		this._dataTexture = new GL.Texture(this.width, this.height, {depth: this.depth, pixel_data: this._dataView, texture_type: GL.TEXTURE_3D, format: format, internalFormat: internalFormat, type: type, minFilter: gl.NEAREST, magFilter: gl.NEAREST, wrap:gl.CLAMP_TO_EDGE});
	}

	return this._dataTexture;
}

Volume.prototype.uploadDataTexture = function(){
	if(this._dataTexture == null){
		this.getDataTexture();
	}else{
		this._dataTexture.uploadData(this._dataView, {}, false);
	}
}

Volume.prototype.computeMinMax = function(){
	if(this._max != null && this._min != null) return;

	var min = Math.pow(2,this.voxelDepth);
	var max = -min;

	for(var i=0; i<this._voxelSize; i++){
		var v = this._dataView[i];
		if(v < min) min = v;
		if(v > max) max = v;
	}

	this._max = max;
	this._min = min;
}

Volume.prototype.normalize = function(){
	this.computeMinMax();

	var min = this._min;
	var max = this._max;
	var mmm = max - min;
	var lim = Math.pow(2,this.voxelDepth);

	for(var i=0; i<this._voxelSize; i++){
		var v = this._dataView[i];
		
		this._dataView[i] = lim * (v - min)/mmm;
	}
}

Volume.prototype.computeHistogram = function(c){
	if(!this.isValid()) return;
	
	var possibleValues = Math.pow(2, this.voxelDepth);

	//todo check to know best typed array size
	var h = new Uint32Array(possibleValues);

	for(var i=0; i<this._voxelSize; i++){
		var v = this._dataView[i];

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

Volume.prototype.getVolumeAsVLBuffer = function(){
	var vl1HeaderElements = 9;
	var headerSize = 4*vl1HeaderElements; //4 bytes per number in header

	var buffer = new ArrayBuffer(this._dataBuffer.byteLength + headerSize);

	var view32 = new Uint32Array(buffer);
	var view32F = new Float32Array(buffer);
	view32[0] = 1;
	view32[1] = this.width;
	view32[2] = this.height;
	view32[3] = this.depth;
	view32F[4] = this.widthSpacing;
	view32F[5] = this.heightSpacing;
	view32F[6] = this.depthSpacing;
	view32[7] = this.channels;
	view32[8] = this.voxelDepth;

	var view8 = new Uint8Array(buffer);
    view8.set(this._dataView, headerSize);

    return view8;
}

Volume.prototype.downloadVL = function(){
	var view8 = this.getVolumeAsVLBuffer();
	var blob = new Blob([view8]);
    var fakeUrl = URL.createObjectURL(blob);
	var element = document.createElement("a");
	element.setAttribute('href', fakeUrl);
	element.setAttribute('download', "texture3d.vl" );
	element.style.display = 'none';
	document.body.appendChild(element);
	element.click();
	document.body.removeChild(element);
};

/***
 * ==Volume class==
 * Loads Volume objects from VL, Dicom or Nifti
 ***/
var VolumeLoader = {};

VolumeLoader.STARTING = 0;
VolumeLoader.LOADINGFILES = 1;
VolumeLoader.PARSINGFILES = 2;
VolumeLoader.CREATINGVOLUMES = 3;
VolumeLoader.DONE = 4;
VolumeLoader.ERROR = 5;

//Dicom utils
VolumeLoader.DicomUtils = {};
VolumeLoader.DicomUtils.TAGS = {};
VolumeLoader.DicomUtils.TAGS.modality 			= "00080060";
VolumeLoader.DicomUtils.TAGS.studyDescription 	= "00081030";
VolumeLoader.DicomUtils.TAGS.MRAcquisitionType = "00180023"; //[1D, 2D, 3D]
VolumeLoader.DicomUtils.TAGS.rows 				= "00280010"; //# of rows
VolumeLoader.DicomUtils.TAGS.columns 			= "00280011"; //# of columns
VolumeLoader.DicomUtils.TAGS.slices			= "00201002"; //# of images AKA slices, not allways defined!
VolumeLoader.DicomUtils.TAGS.pixelSpacing 		= "00280030"; //mm between 2 centers of pixels. Value[0] is for pixels in 2 adjacent rows and value[1] is for pixels in 2 djacent columns
VolumeLoader.DicomUtils.TAGS.sliceThickness	= "00180050"; //mm between 2 centers of pixels in adjacent slices
VolumeLoader.DicomUtils.TAGS.samplesPerPixel 			= "00280002"; //[ 1				, 1				, 3		, 3			, 3				, 3			, 3			, 3					]
VolumeLoader.DicomUtils.TAGS.photometricInterpretation = "00280004"; //[MONOCHROME2	, PALETTE COLOR	, RGB	, YBR_FULL	, YBR_FULL_422	, YBR_RCT	, YBR_ICT	, YBR_PARTIAL_420	]
VolumeLoader.DicomUtils.TAGS.photometricInterpretationOptions = ["MONOCHROME2", "PALETTE COLOR", "RGB", "YBR_FULL", "YBR_FULL_422", "YBR_RCT", "YBR_ICT", "YBR_PARTIAL_420"];

//Returns an array of values. Usually only contains 1 value inside the array. => Check Dicom Standard
VolumeLoader.DicomUtils.getValue = function(image, tag){
	if(image.tags[tag])
		return image.tags[tag].value;
	return null;
}

VolumeLoader.loadFile = function(file, callback){
	var reader = new FileReader();
	reader.onloadend = function(event){
		if(event.target.readyState === FileReader.DONE){
	        var buffer = event.target.result;
	        callback(buffer);
	    }
	}
	reader.readAsArrayBuffer(file);
}

VolumeLoader.loadVLFiles = async function(files, onend, oninfo){
	var response = {};	//Info like progress to provide to callback while is parsing and creating Volumes
	
	response.status = VolumeLoader.STARTING;
	if(oninfo) oninfo(response);	//Informative callback, it does not contain volumes yet

	var currentFile = 0;
	var totalFiles = files.length;

	var buffers = [];

	function readFile(){
		if(currentFile < totalFiles){
			VolumeLoader.loadFile(files[currentFile++], onFileLoaded);
		}else{
			VolumeLoader.parseVLBuffers(buffers, onend, oninfo);
		}
	}

	function onFileLoaded(buffer){
		buffers.push(buffer);
		readFile();
	}

	response.status = VolumeLoader.LOADINGFILES;
	if(oninfo) oninfo(response);	//Informative callback, it does not contain volumes yet
	readFile();
}

VolumeLoader.parseVLBuffers = async function(buffers, onend, oninfo){
	var response = {};	//Info like progress to provide to callback while is parsing and creating Volumes

	response.status = VolumeLoader.PARSINGFILES;
	if(oninfo) oninfo(response);	//Informative callback, it does not contain volumes yet

	var vls = [];
	var volumes = [];

	for(var buffer of buffers){
		var vl = VolumeLoader.parseVL(buffer);

		if(vl.data){
			vl.buffer = buffer;
			vls.push(vl);
		}else{
			response.status = VolumeLoader.ERROR;
			response.explanation = "Could not parse VL file with version " + vl.version;
	    	oninfo(response);
		}
	}

	if(vls.length == 0){
		response.status = VolumeLoader.ERROR;
		response.explanation = "There are no valid VLs.";
	    onend(response);
	    return;
	}

	//Create a volume for each volume
	response.status = VolumeLoader.CREATINGVOLUMES;
	if(oninfo) oninfo(response);	//Informative callback, it does not contain volumes yet

	for(var vl of vls){
		var volume = Volume.create(vl.width, vl.height, vl.depth, {widthSpacing: vl.widthSpacing, heightSpacing: vl.heightSpacing, depthSpacing: vl.depthSpacing, channels: vl.channels, voxelDepth: vl.voxelDepth}, vl.data);
		vl.volume = volume;
		volumes.push(volume);
	}

	response.status = VolumeLoader.DONE;
	response.vls = vls;
	response.volume = volumes[0];
	response.volumes = volumes;

	onend(response);	//Final callback, it does contain volumes (and also raw images and series from daikon)
}

VolumeLoader.parseVL = function(buffer){
	var view32 = new Uint32Array(buffer);
	var view32F = new Float32Array(buffer);
	var vl = {
		version: view32[0],
	};

	if(vl.version == 1){
		vl = VolumeLoader._parseVL1(buffer, view32, view32F);
	}

	return vl;
}

VolumeLoader._parseVL1 = function(buffer, view32, view32F){
	var headerElements = 9;
	var vl = {};
	vl.version = view32[0];
	vl.width = view32[1];
	vl.height = view32[2];
	vl.depth = view32[3];
	vl.widthSpacing = view32F[4];
	vl.heightSpacing = view32F[5];
	vl.depthSpacing = view32F[6];
	vl.channels = view32[7];
	vl.voxelDepth = view32[8];
	vl.data = buffer.slice(4*headerElements);
	return vl;
}

VolumeLoader.loadDicomFiles = async function(files, onend, oninfo){
	var response = {};	//Info like progress to provide to callback while is parsing and creating Volumes
	
	if(daikon === undefined){
		console.warn("Library daikon.js is needed to perfom this action.");
		response.status = VolumeLoader.ERROR;
		response.explanation = "Library daikon.js is needed to perfom this action."
	    onend(response);
	    return;
	}

	response.status = VolumeLoader.STARTING;
	if(oninfo) oninfo(response);	//Informative callback, it does not contain volumes yet

	var currentFile = 0;
	var totalFiles = files.length;

	var buffers = [];

	function readFile(){
		if(currentFile < totalFiles){
			VolumeLoader.loadFile(files[currentFile++], onFileLoaded);
		}else{
			VolumeLoader.parseDicomBuffers(buffers, onend, oninfo);
		}
	}

	function onFileLoaded(buffer){
		buffers.push(buffer);
		readFile();
	}

	response.status = VolumeLoader.LOADINGFILES;
	if(oninfo) oninfo(response);	//Informative callback, it does not contain volumes yet
	readFile();
}

VolumeLoader.parseDicomBuffers = async function(buffers, onend, oninfo){
	var response = {};	//Info like progress to provide to callback while is parsing and creating Volumes

	if(daikon === undefined){
		console.warn("Library daikon.js is needed to perfom this action.");
		response.status = VolumeLoader.ERROR;
		response.explanation = "Library daikon.js is needed to perfom this action."
	    onend(response);
	    return;
	}

	response.status = VolumeLoader.PARSINGFILES;
	if(oninfo) oninfo(response);	//Informative callback, it does not contain volumes yet

	var series = {};	//Map seriesId of image with a serie
	var volumes = [];	//Contains a volume for each serie

	//Extract images from dicoms and assign each to a serie
	for(var buffer of buffers){
		var image = daikon.Series.parseImage(new DataView(buffer))

		if(image !== null && image.hasPixelData()){
			var seriesId = image.getSeriesId();
			if(!series[seriesId]){
				series[seriesId] = new daikon.Series();
				series[seriesId].buffers = [];
				series[seriesId].volume = null;
			}

			series[seriesId].addImage(image);
			series[seriesId].buffers.push(buffer);
		}
	}

	if(Object.keys(series).length == 0){
		response.status = VolumeLoader.ERROR;
		response.explanation = "There are no valid Dicoms.";
	    onend(response);
	    return;
	}

	//Create a volume for each serie
	response.status = VolumeLoader.CREATINGVOLUMES;
	if(oninfo) oninfo(response);	//Informative callback, it does not contain volumes yet
	for(var seriesId in series){
		var serie = series[seriesId];

		serie.buildSeries();

		var width  = VolumeLoader.DicomUtils.getValue(serie.images[0], VolumeLoader.DicomUtils.TAGS.rows)[0];
		var height = VolumeLoader.DicomUtils.getValue(serie.images[0], VolumeLoader.DicomUtils.TAGS.columns)[0];
		var depth  = serie.images.length;

		var widthSpacing  = VolumeLoader.DicomUtils.getValue(serie.images[0], VolumeLoader.DicomUtils.TAGS.pixelSpacing)[0] || 1;
		var heightSpacing = VolumeLoader.DicomUtils.getValue(serie.images[0], VolumeLoader.DicomUtils.TAGS.pixelSpacing)[1] || 1;
		var depthSpacing  = VolumeLoader.DicomUtils.getValue(serie.images[0], VolumeLoader.DicomUtils.TAGS.sliceThickness)[0] || 1;

		var channels = 1;	//TODO
		var voxelDepth = 8; //TODO
		var voxelBytes = voxelDepth/8;

		var totalVoxels = width * height * depth;
		var totalBytes = totalVoxels * voxelBytes;
		var sliceValues = width * height * channels;

		var voxelData = new ArrayBuffer(totalBytes);
		var view = new Uint8Array(voxelData);	//TODO depending of voxelDepth and data type

		for(var i=0; i<depth; i++){
			var image = serie.images[i];
			var imageData = image.getInterpretedData(true);
			view.set(imageData, i * sliceValues);
		}

		var volume = Volume.create(width, height, depth, {widthSpacing: widthSpacing, heightSpacing: heightSpacing, depthSpacing: depthSpacing, voxelDepth: voxelDepth, channels: channels}, voxelData);
		serie.volume = volume;
		volumes.push(volume);
	}

	response.status = VolumeLoader.DONE;
	response.series = series;
	response.volume = volumes[0];
	response.volumes = volumes;

	onend(response);	//Final callback, it does contain volumes (and also raw images and series from daikon)
}

VolumeLoader.loadNiftiFiles = function(files, onend, oninfo){
	var response = {};	//Info like progress to provide to callback while is parsing and creating Volumes
	
	if(nifti === undefined){
		console.warn("Library nifti-reader.js is needed to perfom this action.");
		response.status = VolumeLoader.ERROR;
		response.explanation = "Library nifti-reader.js is needed to perfom this action."
	    onend(response);
	    return;
	}

	response.status = VolumeLoader.STARTING;
	if(oninfo) oninfo(response);	//Informative callback, it does not contain volumes yet

	var currentFile = 0;
	var totalFiles = files.length;

	var buffers = [];

	function readFile(){
		if(currentFile < totalFiles){
			VolumeLoader.loadFile(files[currentFile++], onFileLoaded);
		}else{
			VolumeLoader.parseNiftiBuffers(buffers, onend, oninfo);
		}
	}

	function onFileLoaded(buffer){
		buffers.push(buffer);
		readFile();
	}

	response.status = VolumeLoader.LOADINGFILES;
	if(oninfo) oninfo(response);	//Informative callback, it does not contain volumes yet
	readFile();
}

VolumeLoader.parseNiftiBuffers = function(buffers, onend, oninfo){
	var response = {};	//Info like progress to provide to callback while is parsing and creating Volumes
	
	if(nifti === undefined){
		console.warn("Library nifti-reader.js is needed to perfom this action.");
		response.status = VolumeLoader.ERROR;
		response.explanation = "Library nifti-reader.js is needed to perfom this action."
	    onend(response);
	    return;
	}

	response.status = VolumeLoader.PARSINGFILES;
	if(oninfo) oninfo(response);	//Informative callback, it does not contain volumes yet

	var niftis = [];	//Contains all nifti objects
	var volumes = [];	//Contains a volume for each serie

	for(var buffer of buffers){
		var niftiData = buffer;
		var niftiHeader = null;

    	if (nifti.isCompressed(niftiData)) {
    		niftiData = nifti.decompress(niftiData);
		}

		if (nifti.isNIFTI(niftiData)) {
		    niftiHeader = nifti.readHeader(niftiData);

		    niftis.push({
		    	niftiHeader: niftiHeader,
		    	buffer: buffer,
		    	volume: null,
		    });
		}else{
			response.status = VolumeLoader.ERROR;
			response.explanation = "Nifti file does not contain data."
	    	onend(response);
		}
	}

	if(niftis.length == 0){
		response.status = VolumeLoader.ERROR;
		response.explanation = "There are no valid Niftis.";
	    onend(response);
	    return;
	}

	response.status = VolumeLoader.CREATINGVOLUMES;
	if(oninfo) oninfo(response);	//Informative callback, it does not contain volumes yet

	for(var nii of niftis){
		var niftiHeader = nii.niftiHeader;
		var niftiData = nii.buffer;

		if(niftiHeader.dims[0] > 3){
		    console.warn("Nifti data has more dimensions than 3, using only 3 first dimensions.");
		}

		var width 	= niftiHeader.dims[1];
		var height 	= niftiHeader.dims[2];
		var depth 	= niftiHeader.dims[3];

		var widthSpacing 	= niftiHeader.pixDims[1];
		var heightSpacing 	= niftiHeader.pixDims[2];
		var depthSpacing 	= niftiHeader.pixDims[3];

		var voxelDepth 	= niftiHeader.numBitsPerVoxel;
		var voxelData 	= nifti.readImage(niftiHeader, niftiData);

		var volume = Volume.create(width, height, depth, {widthSpacing: widthSpacing, heightSpacing: heightSpacing, depthSpacing: depthSpacing, voxelDepth: voxelDepth}, voxelData);
		nii.volume = volume;
		volumes.push(volume);
	}

	response.status = VolumeLoader.DONE;
	response.niftis = niftis;
	response.volume = volumes[0];
	response.volumes = volumes;

	onend(response);	//Final callback, it does contain volumes (and also raw nifti)
}

/***
 * ==TransferFunction class==
 * Represents a TransferFunction composed by segments
 ***/
var TransferFunction = function TransferFunction(){
	this.width = 256;

	//RGBA points
	this.points = [{x:0,r:0,g:0,b:0,a:0}, {x:1,r:1,g:1,b:1,a:1}];


	this._buffer = null;
	this._view = null;
	this._needUpdate = false;

	this._texture = null;
	this._needUpload = false;
}

TransferFunction.prototype.sort = function(){
	this.points.sort(function(a,b){
		if(a.x < b.x) return -1;
		if(a.x > b.x) return 1;
		return 0;
	});
	this._needUpdate = true;
}

TransferFunction.prototype.clean = function(){
	this.sort();

	var count = 0;
	for(var p of this.points){
		if(p.x < 0) count++;
	}
	this.points.splice(0,count);
	this._needUpdate = true;
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
	var i, t, r, g, b, a;
	i = t = r = g = b = a = 0;
	var points = this.points;

	for(var pos=0; pos<4*this.width; pos+=4){
		var pos_01 = pos / (this.width-1) / 4;

		if(i < points.length && pos_01 > points[i].x) i++;
		if(points.length == 0){
			r = g = b = a = 0;
		}else if(i == 0){
			r = points[i].r;
			g = points[i].g;
			b = points[i].b;
			a = points[i].a;
		}else if(i == points.length){
			r = points[i-1].r;
			g = points[i-1].g;
			b = points[i-1].b;
			a = points[i-1].a;
		}else{
			if(points[i-1].x == points[i].x){
				r = points[i].r;
				g = points[i].g;
				b = points[i].b;
				a = points[i].a;
			}else{
				t = (pos_01-points[i-1].x)/(points[i].x-points[i-1].x);
				//Pow and sqrt because real color is value^2
				r = Math.sqrt( (1-t) * Math.pow(points[i-1].r, 2) + t * Math.pow(points[i].r, 2) );
				g = Math.sqrt( (1-t) * Math.pow(points[i-1].g, 2) + t * Math.pow(points[i].g, 2) );
				b = Math.sqrt( (1-t) * Math.pow(points[i-1].b, 2) + t * Math.pow(points[i].b, 2) );
				a = (1-t)*points[i-1].a + t*points[i].a;
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
	if(this._texture != null){
		//Update texture data in GPU
		this._texture.uploadData(this._view, {}, false);
		this._needUpload = false;
	}
}

/***
 * ==TransferFunction Editor Widget==
 ***/
var TFEditor = function TFEditor(options){
	options = options || {};

	if(!options.container){
		options.container = document.createElement("div");
		document.body.appendChild(options.container);
	}
	this.container = options.container;

	if(!(options.visible === true || options.visible === false)){
		options.visible = true;
	}
	this.visible = options.visible;

	var rect = options.container.getBoundingClientRect();
	this._width = rect.width;
	this._height = 20;
	this._middle = 0.2;
	this._r = 5;

	this.ctx = null;

	//Inputs and canvas
	this.domElements = {};
	this.initDivs();

	

	//State
	this.state = {
		mouse: {
			x: 0,
			y: 0,
			downx: 0,
			downy: 0,
			draging: false,
			dragged: false,
		},
		previousSelectedUp: null,
		selected: null,
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

TFEditor.prototype.setSize = function(w, h){
	if(!w){
		this._width = this.container.getBoundingClientRect().width;
	}
	this._width = w || this._width;
	this._height = h || this._height;

	var textWidth = "50px";
	var sliderWidth = "calc(100% - 60px)";

	this.domElements.canvas.width = this._width;
	this.domElements.canvas.height = this._height;
	this.domElements.canvas.style.height = this._height + "px";

	for(var c of ["r", "g", "b", "a"]){
		this.domElements["text_"+c].style.width = textWidth;
		this.domElements["slider_"+c].style.width = sliderWidth;
	}
}

TFEditor.prototype.removeDivs = function(){
	this.domElements = {};
	if(this.container){
		while(this.container.lastChild){
			this.container.removeChild(this.container.lastChild);
		}
	}
}

TFEditor.prototype.initDivs = function(newcontainer){
	this.domElements = {};
	this.container = newcontainer || this.container;

	var canvas = document.createElement("canvas");
	canvas.style.width = "100%";
	this.domElements.canvas = canvas;
	this.container.appendChild(canvas);

	//Set resize listener
	window.addEventListener("resize", this._onResize.bind(this));

	//Set canvas listeners
	canvas.addEventListener("mousedown", this._onMouseDown.bind(this));
	canvas.addEventListener("mouseup", this._onMouseUp.bind(this));
	canvas.addEventListener("mousemove", this._onMouseMove.bind(this));
	canvas.addEventListener("mouseleave", this._onMouseLeave.bind(this));
	this.ctx = this.domElements.canvas.getContext("2d");

	for(var c of ["r", "g", "b", "a"]){
		var div = document.createElement("div");
		div.style.width = "100%";
		div.style.height = "20px";
		div.style.margin = "0";
		div.style.padding = "0";
		this.domElements["div_"+c] = div;

		var text = document.createElement("a");
		text.style.width = "50px";
		text.style["font-family"] = "Courier New";
		text.style["font-size"] = "12px";
		text.style.float = "left";
		text.style.margin = "0";
		text.style["margin-right"] = "3px";
		text.style.padding = "0";
		text.id = "TFEditor_text_"+c;
		this.domElements["text_"+c] = text;

		var slider = document.createElement("input");
		slider.type = "range";
		slider.min = 0;
		slider.max = 1;
		slider.step = 0.001;
		slider.value = 0.5;
		slider.style.float = "right";
		slider.style.margin = "0";
		slider.style["margin-left"] = "3px";
		slider.style["margin-right"] = "3px";
		slider.style.padding = "0";
		slider.id = "TFEditor_slider_"+c;
		slider.disabled = true;
		this.domElements["slider_"+c] = slider;

		//Append to div and to container
		div.appendChild(text);
		div.appendChild(slider);
		this.container.appendChild(div);

		//Set listeners
		slider.addEventListener("input", this._onSliderChange.bind(this));
	}

	this.disableInputs(true);
	this.setSize();
}

TFEditor.prototype._onResize = function(event){
	this.setSize();
}

TFEditor.prototype._onSliderChange = function(event){
	var id = event.target.id;
	var val = event.target.value;
	var c = id[id.length-1];
	var v = Math.max(Math.min(parseFloat(val), 1), 0);

	this.modify(c, v);
	this.setInputs(this.state.selected);
}

TFEditor.prototype._onMouseDown = function(event){
	this.state.mouse.dragging = true;
	var x = this.state.mouse.downx = Math.min(Math.max(event.layerX, 0), this._width) / this._width;
	var y = this.state.mouse.downy = 1 - Math.min(Math.max(event.layerY, 0), this._height) / this._height;

	this.select(x);

	if(this.state.selected == null){
		if(Math.abs( this.state.mouse.y - 0.5 ) < this._middle/2 )
			this.create(x);
	}
}

TFEditor.prototype._onMouseUp = function(event){
	var x = this.state.mouse.x;
	var y = this.state.mouse.y;

	var s = this.state.selected;
	this.select(x);
	var selectedUp = this.state.selected;

	if(!this.state.mouse.dragged && this.state.previousSelectedUp == selectedUp){
		this.remove();
	}

	this.state.mouse.dragging = false;
	this.state.mouse.dragged = false;
	this.state.selected = s;
	this.state.previousSelectedUp = selectedUp;

	return false;
}

TFEditor.prototype._onMouseMove = function(event){
	var x = this.state.mouse.x = Math.min(Math.max(event.layerX, 0), this._width) / this._width;
	var y = this.state.mouse.y = 1 - Math.min(Math.max(event.layerY, 0), this._height) / this._height;

	if(this.state.mouse.dragging && this.state.selected){
		this.state.mouse.dragged = true;
		this.moveTo(x);
	}
}

TFEditor.prototype._onMouseLeave = function(event){
	this.state.mouse.dragging = false;
	this.state.mouse.dragged = false;
}

TFEditor.prototype.show = function(){
	this.visible = true;
	this.container.style.display = "block";
	this.render();
}

TFEditor.prototype.hide = function(){
	this.visible = false;
	this.container.style.display = "none";
}

TFEditor.prototype.setTF = function(tf){
	this.tf = tf;
}

TFEditor.prototype.disableInputs = function(b){
	for(var c of ["r", "g", "b", "a"]){
		this.domElements["text_"+c].innerText = c + ": -";
		this.domElements["slider_"+c].disabled = b;
	}
}

TFEditor.prototype.setInputs = function(p){
	this.disableInputs(false);
	for(var c of ["r", "g", "b", "a"]){
		this.domElements["text_"+c].innerText = c + ":" + Math.floor( p[c] * 1000 ) / 1000;
		this.domElements["slider_"+c].value = p[c];
	}
}

TFEditor.prototype.select = function(x){
	var r = this._r / this._width;
	this.unselect();

	for(var p of this.tf.points){
		if(p.x >= x-r && p.x <= x+r){
			this.state.selected = p;
			this.setInputs(p);
			break;
		}
	}
}

TFEditor.prototype.unselect = function(){
	this.state.selected = null;
	this.disableInputs(true);
}

TFEditor.prototype.moveTo = function(x){
	if(this.state.selected != null){
		this.state.selected.x = x;
		this.tf.sort();
	}

	if(this.state.selected.length > 0){
		for(var p of this.state.selected){
			p.x = x;
			p.y = y;
		}

		this.tf.sort();
	}
}

TFEditor.prototype.create = function(x){
	var transferFunction = this.tf.getTransferFunction();

	var l = this.tf.width - 1;
	var i = 4*Math.round( x*l );
	var r = transferFunction[i]   / l;
	var g = transferFunction[i+1] / l;
	var b = transferFunction[i+2] / l;
	var a = transferFunction[i+3] / l;

	var p = {x:x, r:r, g:g, b:b, a:a };

	this.tf.points.push(p);
	this.tf.sort();

	this.state.selected = p;
	this.setInputs(p);
}

TFEditor.prototype.remove = function(){
	if(this.state.selected != null){
		this.state.selected.x = -1;
		this.tf.clean();
		this.unselect();
	}
}

TFEditor.prototype.modify = function(c, v){
	if(this.state.selected){
		this.state.selected[c] = v;
		this.tf._needUpdate = true;
	}
}

TFEditor.prototype.drawTF = function(){
	var w = this._width;
	var h = this._height;

	var hh = h/2;

	var hline = h*this._middle;
	var hdraw = hh-hline/2;


	//Clear canvas
	var ctx = this.ctx;
	ctx.fillStyle = "rgb(255,255,255)";
	ctx.fillRect(0,0,w,h);

	//Transparency squares
	ctx.fillStyle = "rgb(200,200,200)";
	var sqs = (hdraw) / 2;
	for(var i=0; i<w/sqs+2; i++){
		ctx.fillRect(i*sqs, hline+hdraw+(i%2)*sqs, sqs, sqs);
	}

	//TF
	var transferFunction = this.tf.getTransferFunction();
	
	var l = this.tf.width - 1;
	var s = l/(w-1);
	
	for(var i=0; i<w; i++){
		var pos = Math.round(i*s)*4;

		var r = transferFunction[pos];
		var g = transferFunction[pos+1];
		var b = transferFunction[pos+2];
		var a = transferFunction[pos+3]/l;

		ctx.fillStyle = "rgb("+r+","+g+","+b+")";
		ctx.fillRect(i,0,1,hdraw);
		ctx.fillStyle = "rgba("+r+","+g+","+b+","+a+")";
		ctx.fillRect(i,hdraw+hline,1,hdraw);
		ctx.fillStyle = "rgb(0,0,0)";
		ctx.fillRect(i,hdraw,1,hline);
	}

	//Draw TF points
	var pi2 = Math.PI*2;
	var radius = this._r;
	var points = this.tf.points;
	for(var p of points){
		var r = 255*p.r;
		var g = 255*p.g;
		var b = 255*p.b;
		ctx.fillStyle = "rgb("+r+","+g+","+b+")";
		if(p == this.state.selected) ctx.strokeStyle = "rgb(255,255,255)";
		else ctx.strokeStyle = "rgb(0,0,0)";

		var x = p.x * w;
		ctx.beginPath();
		ctx.ellipse(x,hh,radius,radius,0,0,pi2);
		ctx.fill();
		ctx.beginPath();
		ctx.ellipse(x,hh,radius,radius,0,0,pi2);
		ctx.stroke();
	}
}

TFEditor.prototype.render = function(){
	if(this.visible){
		requestAnimationFrame( this.render.bind(this) );
		if(this.tf){
			this.drawTF();
		}
	}
}

/***
 * ==VolumeNode class==
 * Represents volume + tf + shader
 ***/
var VolumeNode = function VolumeNode(){
	this._ctor();
}

VolumeNode.prototype._ctor = function(){
	RD.SceneNode.prototype._ctor.call(this);

	this.background = [0,0,0,0];
	this.intensity = 1;
	this.levelOfDetail = 100;
	this.isosurfaceLevel = 0.5;
	this.voxelScaling = 1;

	this.mesh = "proxy_box";
	this.textures.jittering = "_jittering";

	this.uniforms.u_im = mat4.create();
}

VolumeNode.prototype.render = function(renderer, camera){
	//Update uniforms depending on Volumetrics
	renderer.setModelMatrix(this._global_matrix);
	mat4.invert(this.uniforms.u_im, this._global_matrix);

	//Render node
	renderer.renderNode( this, camera );
}

VolumeNode.prototype.setVolumeUniforms = function(volume){
	this.scaling = [volume.width*volume.widthSpacing, volume.height*volume.heightSpacing, volume.depth*volume.depthSpacing];
	this.resolution = [volume.width, volume.height, volume.depth];
	if(volume.voxelDepth == 16 || volume.voxelDepth == 32){
		this.voxelScaling = Math.pow(2,volume.voxelDepth);
	}else{
		this.voxelScaling = 1;
	}
}

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

Object.defineProperty(VolumeNode.prototype, "voxelScaling", {
	get: function() {
		return this.uniforms.u_voxelScaling;
	},
	set: function(v) {
		this.uniforms.u_voxelScaling = v;
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
 * Useful options: canvas, container, visible, background, levelOfDetail
 ***/
var Volumetrics = function Volumetrics(options){
	//WebGL Renderer and scene
	options = options || {};
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
	options.levelOfDetail = options.levelOfDetail || 100;

	this.container = options.container;
	this.context.canvas.style.width = "100%";
	this.context.canvas.style.height = "100%";
	window.addEventListener("resize", this.onResize.bind(this));

	this.renderer = new RD.Renderer(this.context);
	this.scene = new RD.Scene();

	//Label renderer and storage
	this.labelRenderer = null; //new LabelRenderer();
	this.labels = {};

	//Volumes and TransferFunctions storage
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

	this.picking = {
		texture: null,
		fbo: null,
	};

	this.fps = 0;

	this.background = options.background;
	this.levelOfDetail = options.levelOfDetail;

	this.visible = options.visible;

	this.init();

}

//It may not work if the window size does not change, so call it manually if you change the container size
Volumetrics.prototype.onResize = function(){
	var rect = this.context.canvas.getBoundingClientRect();
	this.context.canvas.width = rect.width;
	this.context.canvas.height = rect.height;
	gl.viewport(0, 0, rect.width, rect.height);
}

Volumetrics.prototype.initProxyBox = function(){
	var mesh = GL.Mesh.box({sizex: 1, sizey: 1, sizez: 1, wireframe: true});

	var options = {};
	var buffers = {};
	//switch orientation of faces so the front is inside
	buffers.vertices = new Float32Array([-1,1,-1,-1,1,1,-1,-1,1,-1,1,-1,-1,-1,1,-1,-1,-1,1,1,-1,1,-1,1,1,1,1,1,1,-1,1,-1,-1,1,-1,1,-1,1,1,1,1,1,1,-1,1,-1,1,1,1,-1,1,-1,-1,1,-1,1,-1,1,-1,-1,1,1,-1,-1,1,-1,-1,-1,-1,1,-1,-1,-1,1,-1,1,1,-1,1,1,1,-1,1,-1,1,1,1,-1,1,1,-1,-1,-1,1,-1,1,1,-1,-1,-1,-1,-1,-1,-1,1,1,-1,1]);
	buffers.normals = new Float32Array([-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0]);
	buffers.coords = new Float32Array([0,1,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0,0,1,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0,0,1,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,1,0,0,1,0]);
	buffers.wireframe = new Uint16Array([0,2, 2,5, 5,4, 4,0,   6,7, 7,10, 10,11, 11,6, 0,6, 2,7, 5,10, 4,11  ]);
	options.bounding = BBox.fromCenterHalfsize( [0,0,0], [1,1,1] );


	this.renderer.meshes["proxy_box"] = GL.Mesh.load(buffers, options);
	
}

Volumetrics.prototype.reloadShaders = function(){
	this.renderer.loadShaders("https://webglstudio.org/users/mfloriach/volumetricsDev/src/shaders.txt");
}

Volumetrics.prototype.createJitteringTexture = function(x, y, strength){
	var view = new Uint8Array(x*y);

	for(var i=0; i<x*y; i++){
		view[i] = Math.floor( strength*255*Math.random() );
	}

	var texture = new GL.Texture(x, y, {texture_type: GL.TEXTURE_2D, format: gl.LUMINANCE, magFilter: gl.NEAREST, wrap: gl.REPEAT, pixel_data: view});
	this.renderer.textures._jittering = texture;
}

Volumetrics.prototype.init = function(){
	this.camera.perspective( 45, gl.canvas.width / gl.canvas.height, 1, 10000 );
	this.camera.lookAt( [100,100,100], [0,0,0], [0,1,0] );
	this.initProxyBox();

	//Add default tf
	var defaultTF = new TransferFunction();
	this.addTransferFunction(defaultTF, "tf_default");

	//Load shaders
	this.reloadShaders();
	this.createJitteringTexture(1024,1024,0.5);

	//Mouse actions
	gl.captureMouse();
	this.renderer.context.onmousedown = this.onmousedown.bind(this);
	this.renderer.context.onmousemove = this.onmousemove.bind(this);

	//Key actions
	gl.captureKeys();
	this.renderer.context.onkey = this.onkey.bind(this);

	//Init visibility
	if(this.visible){
		this.show();
	}else{
		this.hide();
	}

	//setInterval(this.showFPS.bind(this), 1000);
}

Volumetrics.prototype.showFPS = function(){
	console.log(this.fps);
	this.fps = 0;
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
	this.fps++;

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

	this.scene.update(dt);
}

Volumetrics.prototype.render = function(){
	//clear
	this.renderer.clear(this.background);

	//render Scene
	gl.enable(gl.DEPTH_TEST);
	this.renderer.render(this.scene, this.camera);
	gl.disable(gl.DEPTH_TEST);

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

	if(this.volumes[name] !== undefined){
		for(var v in this.volumeNodes){
			var volNode = this.volumeNodes[v];

			if(volNode.volume == name){
				volNode.setVolumeUniforms(volume);
			}
		}
	}

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
		volNode.shader = "volumetric_default";
	}

	volNode.background = this.background;
	volNode.levelOfDetail = this.levelOfDetail;

	var volume = this.volumes[volNode.volume];
	volNode.setVolumeUniforms(volume);

	if( this.volumeNodes[name] === undefined ){
		this.volumeNodes[name] = volNode;
		this.scene._root.addChild(volNode);
	}else{
		var oldVolumeNode = this.volumeNodes[name];
		for(var i=0; i<this.scene._root.children.length; i++){
			if(this.scene._root.children[i] == oldVolumeNode){
				this.scene._root.children[i] = volNode;
			}
		}
	}
}

Volumetrics.prototype.getVolumeNode = function(name){
	return this.volumeNodes[name];
}

//Creates an FBO if there is none or if canvas size has changed. Returns the fbo
Volumetrics.prototype.getFBO = function(){
	var needFBO = false;

	//Texture does not exist or does not have correct size, must be done/redone
	if(this.picking.texture == null || this.picking.texture.width != this.context.canvas.width || this.picking.texture.height != this.context.canvas.height){
		this.picking.texture = new GL.Texture(this.context.canvas.width, this.context.canvas.height, { format: gl.RGBA, type: gl.FLOAT, magFilter: gl.LINEAR,  });
		needFBO = true;
	}

	if(this.picking.fbo == null || needFBO){
		this.picking.fbo = new GL.FBO([this.picking.texture]);
	}

	return this.picking.fbo;
}

//Get the {x, y, z} world position that the mouse {x, y} is pointing
Volumetrics.prototype.pickPosition = function(x, y){

	var pick = null;
	var dist = 0;
	var fbo = this.getFBO(); //To render into a texture instead of canvas

	//ArrayBufferView for accessing pixel data
	var pixels = new Float32Array(4);

	//activate fbo
	fbo.bind();
	//enable scisor test and set area
	//gl.disable(gl.DEPTH_TEST);
	gl.enable(gl.SCISSOR_TEST);
	gl.scissor(x, y, 1, 1);
	gl.clearColor(0,0,0,0);	//If later alpha channel equals 0 it's a discard or outside volume, no point in volume is picked

	for(var v of Object.keys(this.volumeNodes)){
		var volNode = this.volumeNodes[v];

		//Change shader temporaly
		var usedShader = volNode.shader;
		volNode.shader = "volumetric_picking";

		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
		this.renderer.render(this.scene, this.camera, [volNode]);

		//Set original shader
		volNode.shader = usedShader;

		//Get RGBA
		gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, pixels);
		if(pixels[3] != 1.0) continue; //1.0 => there is a hit, 0.0 => there is no hit with volume

		//Pos in local coordinates [-1,1] to global coordinates [R]
		var localPos = vec4.fromValues(pixels[0], pixels[1], pixels[2], 1.0);
		var globalPos = vec4.create();
		vec4.transformMat4(globalPos, localPos, volNode._global_matrix);
		globalPos = vec3.fromValues(globalPos[0]/globalPos[3], globalPos[1]/globalPos[3], globalPos[2]/globalPos[3])

		var testDist = vec3.distance(this.camera.position, globalPos);
		if(pick == null || testDist < dist){
			pick = globalPos;
			dist = testDist;
		}
	}
	//Deactivate fbo
	gl.disable(gl.SCISSOR_TEST);
	gl.enable(gl.DEPTH_TEST);
	fbo.unbind();

	return pick;
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

Object.defineProperty(Volumetrics.prototype, "levelOfDetail", {
	get: function() {
		return this._levelOfDetail;
	},
	set: function(l) {
		this._levelOfDetail = l;
		for(var v of Object.keys(this.volumeNodes)){
		this.volumeNodes[v].levelOfDetail = this.levelOfDetail;
		}
	},
});
