"use strict"

/***
 * === VOLUMETRICS.js ===
 * v1.1
 ***/

/***
 * ==Volume class==
 * Describes a 3D dataset
 ***/
var Volume = function Volume(o){
	//Dimensions size
	this.width = 0;
	this.height = 0;
	this.depth = 0;

	//Distance between voxels (some scans use different distances in each dimension)
	this.widthSpacing = 1;
	this.heightSpacing = 1;
	this.depthSpacing = 1;

	//Voxel info
	this.voxelBytes = 1;	//Bytes per channel (1, 2 or 4)
	this.voxelChannels = 1;	//Channels (1, 2, 3 or 4)
	this.voxelType = "UI"	//Options: Unsigned integer: "UI", Integer: "I", Float: "F", Other: "O"

	//Arraybuffer with all voxels. Dimensions increase in this order: width, height, depth
	this._size = 0;
	this._data = null;

	//Auxiliar
	this._min = null;
	this._max = null;

	if(o) this.configure(o);
}

Volume.prototype.configure = function(o){
	this.width = o.width || this.width;
	this.height = o.height || this.height;
	this.depth = o.depth || this.depth;

	this.widthSpacing	= o.widthSpacing	|| this.widthSpacing;
	this.heightSpacing	= o.heightSpacing	|| this.heightSpacing;
	this.depthSpacing	= o.depthSpacing	|| this.depthSpacing;
	this.voxelBytes		= o.voxelBytes		|| this.voxelBytes;
	this.voxelChannels	= o.voxelChannels	|| this.voxelChannels;

	if(this.voxelChannels < 1 || this.voxelChannels > 4){
		console.warn("There should be at least 1 channel and at most 4.");
	}
	this._computeSize();
	this._data = o.data || this._data;

	if(!this._data){
		this._createArrayView(o.buffer);
	}	
}

//Computes theoretical size of data in bytes
Volume.prototype._computeSize = function(){
	this._size = this.width * this.height * this.depth * this.voxelBytes * this.voxelChannels;
	if(this._size == 0 || this._size % (this.voxelBytes*this.voxelChannels) != 0){
		console.warn("Size does not seem correct.");
		return false;
	}
	return true;
}

//Creates an unsigned int arrayview based on the attribute values
//Other types must be created manually
Volume.prototype._createArrayView = function(aBuffer){
	if(!this._computeSize()){
		return;
	}
	aBuffer = aBuffer || new ArrayBuffer(this._size);
	var aView = null;
	if(this.voxelBytes == 1){
		aView = new Uint8Array(aBuffer);
	}else if(this.voxelBytes == 2){
		aView = new Uint16Array(aBuffer);
	}else if(this.voxelBytes == 4){
		aView = new Uint32Array(aBuffer);
	}
	this._data = aView;
}

Volume.prototype.isValid = function(){
	return this._computeSize();
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
	view32[7] = this.voxelChannels;
	view32[8] = this.voxelBytes * 8;

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

//Returns a 3D Texture from a Volume data
Volume.createTexture = function(volume, options){
	options = options || {};

	var width = parseInt(volume.width);
	var height = parseInt(volume.height);
	var depth = parseInt(volume.depth);
	var channels = parseInt(volume.voxelChannels);
	var data = volume._data;

	//Check dimensions and data
	if(width < 1 || height < 1 || depth < 1){
		console.warn("Volume dimensions must be positive");
		return null;
	}

	if(data == null){
		console.warn("Creating texture without data");
	}else if(data.length != width*height*depth*channels){
		console.warn("Volume size does not match with data size");
		return null;
	}

	//Cannot be overrided from outside volume info
	options.depth = depth;
	options.pixel_data = data;
	options.texture_type = gl.TEXTURE_3D;
	
	//Check https://www.khronos.org/registry/webgl/specs/latest/2.0/#3.7.6 texImage2D to see possible combinations for format, type and internalFormat
	//For example for pre-computed gradients {format: gl.RGB, type: gl.UNSIGNED_BYTE, internalFormat: gl.RGB8}
	var guessParams = Volume.guessTextureParams(volume);

	options.format = options.format || guessParams.format;
	options.type = options.type || guessParams.type;
	options.internalFormat = options.internalFormat || guessParams.internalFormat;
	options.minFilter = options.minFilter || gl.NEAREST;
	options.magFilter = options.magFilter || gl.NEAREST;
	options.wrap = options.wrap || gl.CLAMP_TO_EDGE;

	return new GL.Texture(width, height, options);
}

//Uploads data to an already created 3D texture
Volume.updateTexture = function(volume, texture){
	var width = parseInt(volume.width);
	var height = parseInt(volume.height);
	var depth = parseInt(volume.depth);
	var data = volume._data;

	if(texture.texture_type != gl.TEXTURE_3D){
		console.warn("Texture type is not TEXTURE_3D");
		return false;
	}

	if(data == null){
		console.warn("There must be data to upload");
		return false;
	}
	if(width != texture.width || height != texture.height || depth != texture.depth || data.length != texture.data.length){
		console.warn("Texture and volume dimensions do not match");
		return false;
	}

	texture.uploadData(data, {}, false);
	return true;
}

Volume.guessTextureParams = function(volume){
	var bytes = volume.voxelBytes;
	var channels = volume.voxelChannels;
	var type = volume.voxelType;

	var guess = {
		typeString: "",
		formatString: "",
		internalFormatString: "",
		type: null,
		format: null,
		internalFormat: null
	};

	guess.formatString = (channels == 1 ? "RED" : channels == 2 ? "RG" : channels == 3 ? "RGB" : "RGBA");
	guess.internalFormatString = (channels == 1 ? "R" : channels == 2 ? "RG" : channels == 3 ? "RGB" : "RGBA") + (bytes == 1 ? "8" : bytes == 2 ? "16" : "32");

	switch(type){
		case "UI":
			guess.typeString = "UNSIGNED_";
			guess.internalFormatString += "U";
		case "I":
			guess.typeString += (bytes == 1 ? "BYTE" : bytes == 2 ? "SHORT" : "INT");
			guess.formatString += "_INTEGER";
			guess.internalFormatString += "I";
			break;
		case "F":
			guess.typeString = "FLOAT";	//1byte can't be float, 2 and 4 bytes can pass a FloatArray (there aren't HalfFloatArrays in JS)
			break;
		default:
			guess.typeString = "UNSIGNED_BYTE";
			break;
	}

	guess.type = gl[guess.typeString];
	guess.format = gl[guess.formatString];
	guess.internalFormat = gl[guess.internalFormatString];

	return guess;
}

/***
 * ==VolumeLoader class==
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
VolumeLoader.DicomUtils = {
	TAGS: {
		modality 			: "00080060",
		studyDescription 	: "00081030",
		MRAcquisitionType	: "00180023", //[1D, 2D, 3D]
		rows 				: "00280010", //# of rows
		columns 			: "00280011", //# of columns
		slices				: "00201002", //# of images AKA slices, not allways defined!
		pixelSpacing 		: "00280030", //mm between 2 centers of pixels. Value[0] is for pixels in 2 adjacent rows and value[1] is for pixels in 2 djacent columns
		sliceThickness		: "00180050", //mm between 2 centers of pixels in adjacent slices
		samplesPerPixel 	: "00280002", //[ 1				, 1				, 3		, 3			, 3				, 3			, 3			, 3					]
		photometricInterpretation : "00280004", //[MONOCHROME2	, PALETTE COLOR	, RGB	, YBR_FULL	, YBR_FULL_422	, YBR_RCT	, YBR_ICT	, YBR_PARTIAL_420	]
		photometricInterpretationOptions : ["MONOCHROME2", "PALETTE COLOR", "RGB", "YBR_FULL", "YBR_FULL_422", "YBR_RCT", "YBR_ICT", "YBR_PARTIAL_420"],
	}
};

//Nifti utils
VolumeLoader.NiftiUtils = {
	DataTypes: {
		0: "unknown",
		1: "bool",
		2: "unsigned char",
		4: "signed short",
		8: "signed int",
		16: "float",
		32: "complex",
		64: "double",
		128: "RGB",
		255: "all",
		256: "signed char",
		512: "unsigned short",
		768: "unsigned int",
		1024: "long long",
		1280: "unsigned long long",
		1536: "long double",
		1792: "double pair",
		2048: "long double pair",
		2304: "RGBA"
	}
};

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
			if(oninfo) oninfo(response);
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
		var volume = new Volume({width: vl.width, height: vl.height, depth: vl.depth, widthSpacing: vl.widthSpacing, heightSpacing: vl.heightSpacing, depthSpacing: vl.depthSpacing, voxelChannels: vl.voxelChannels, voxelBytes: vl.voxelBytes, buffer: vl.data});
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
	vl.voxelChannels = view32[7];
	vl.voxelBytes = view32[8] / 8;
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

		var voxelChannels = 1;	//TODO infer from dicom metadata
		var voxelBytes = 1;		//TODO infer from dicom metadata

		var totalVoxels = width * height * depth;
		var totalBytes = totalVoxels * voxelBytes * voxelChannels;
		var sliceValues = width * height * voxelChannels;

		var voxelData = new ArrayBuffer(totalBytes);
		var view = new Uint8Array(voxelData);	//TODO depending of voxelDepth and data type

		for(var i=0; i<depth; i++){
			var image = serie.images[i];
			var imageData = image.getInterpretedData(true);
			view.set(imageData, i * sliceValues);
		}

		var volume = new Volume({width: width, height: height, depth: depth, widthSpacing: widthSpacing, heightSpacing: heightSpacing, depthSpacing: depthSpacing, voxelChannels: voxelChannels, voxelBytes: voxelBytes, data: view});
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
		    console.log("Nifti data has more dimensions than 3, using only 3 first dimensions.");
		}

		var width 	= niftiHeader.dims[1];
		var height 	= niftiHeader.dims[2];
		var depth 	= niftiHeader.dims[3];

		var widthSpacing 	= niftiHeader.pixDims[1];
		var heightSpacing 	= niftiHeader.pixDims[2];
		var depthSpacing 	= niftiHeader.pixDims[3];

		var voxelBytes = niftiHeader.numBitsPerVoxel / 8;
		var voxelBuffer = nifti.readImage(niftiHeader, niftiData);
		var voxelView = null;
		switch(niftiHeader.datatypeCode){
			case 2:		//unsigned char (byte)
			case 128:	//RGB bytes
			case 2304:	//RGBA bytes
				voxelView = new Uint8Array(voxelBuffer);
				break;
			case 512:	//unsigned short
				voxelView = new Uint16Array(voxelBuffer);
				break;
			case 768:
				voxelView = new Uint32Array(voxelBuffer);
				break;
			default:
				console.warn("Data type not covered, returning empty volume. Check dataTypeName for more info to manually create adequate view of voxelBuffer.");
		}

		var volume = new Volume({width: width, height: height, depth: depth, widthSpacing: widthSpacing, heightSpacing: heightSpacing, depthSpacing: depthSpacing, voxelBytes: voxelBytes, data: voxelView});
		nii.dataTypeName = VolumeLoader.NiftiUtils.DataTypes[niftiHeader.datatypeCode];
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
 * Represents a RGBA TransferFunction (1 byte per value)
 ***/
var TransferFunction = function TransferFunction(){
	this.width = 256;

	this._buffer = null;
	this._view = null;
	this._texture = null;
	this._needUpload = false;

	this.init();
}

TransferFunction.prototype.init = function(values){
	//Create arraybuffer with addecuate size (deletes previous data)
	this._buffer = new ArrayBuffer(this.width * 4);
	this._view = new Uint8Array(this._buffer);
	if(values)
		this._view.set(values, 0);

}

TransferFunction.prototype.fromPoints = function(points){
	//Fill buffer data
	var i, t, r, g, b, a;
	i = t = r = g = b = a = 0;

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
				r = (1-t)*points[i-1].r + t*points[i].r;
				g = (1-t)*points[i-1].g + t*points[i].g;
				b = (1-t)*points[i-1].b + t*points[i].b;
				a = (1-t)*points[i-1].a + t*points[i].a;
			}
		}

		this._view[pos  ] = Math.round(r * (this.width-1));
		this._view[pos+1] = Math.round(g * (this.width-1));
		this._view[pos+2] = Math.round(b * (this.width-1));
		this._view[pos+3] = Math.round(a * (this.width-1));
	}

	this._needUpload = true;
}

TransferFunction.prototype.update = function(){
	if(this._needUpload){
		this.updateTexture();
	}
}

TransferFunction.prototype.updateTexture = function(){
	if(this._texture != null){
		//Update texture data in GPU
		this._texture.uploadData(this._view, {}, false);
		this._needUpload = false;
	}
}

TransferFunction.prototype.getTransferFunction = function(){
	return this._view;
}

TransferFunction.prototype.getTexture = function(){
	if(this._texture == null){
		//Create GLTexture using that arraybuffer
		this._texture = new GL.Texture(this.width, 1, {texture_type: GL.TEXTURE_2D, format: gl.RGBA, magFilter: gl.NEAREST, pixel_data: this._view});
		this._needUpload = false;
	}

	if(this._needUpload){
		this.updateTexture();
	}

	return this._texture;
}

TransferFunction.create = function(width, values){
	var tf = new TransferFunction();

	tf.width = width || tf.width;
	tf.init();

	return tf;
}

TransferFunction.clone = function(tf){
	return TransferFunction.create(tf.width, tf._view);
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
	this._height = rect.width*0.7;
	this._middle = 0.2;
	this._r = 5;

	this._canvas_res = 256;
	this._canvas_margin = 5;

	this.ctx = null;
	this.canvas = null;

	//Inputs and canvas
	this.domElements = {};
	this.initDivs();

	//State
	this.state = {
		x: 0,
		y: 0,
		prevx: 0,
		prevy: 0,
		draging: false,
		channel: null,
	};

	this._needRender = true;

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

	this.ctx.canvas.width = this._canvas_res + 2*this._canvas_margin;
	this.ctx.canvas.height = this.ctx.canvas.width;

	var textWidth = "50px";
	var sliderWidth = "calc(100% - 60px)";

	this.domElements.canvas.style.height = this._height + "px";
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
	this.removeDivs();
	this.container = newcontainer || this.container;

	var canvas = document.createElement("canvas");
	canvas.style.width = "100%";
	canvas.style.display = "table";
	canvas.style.margin = "0 auto";
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

	var div = document.createElement("div");
	div.style.width = "90%";
	div.style.height = "20px";
	div.style.margin = "0 auto";
	div.style.padding = "0";
	div.style.display = "table";
	this.domElements["buttons_div"] = div;

	for(var c of ["r", "g", "b", "a"]){
		var button = document.createElement("button");
		button.id = "TFEditor_button_"+c;
		button.innerText = c;
		button.style.margin = "0 auto";
		this.domElements["button_"+c] = button;

		div.appendChild(button);

		//Set listeners
		button.addEventListener("click", this._onButtonClick.bind(this));
	}
	this.container.appendChild(div);

	this.setSize();
}

TFEditor.prototype._onResize = function(event){
	this.setSize();
}

TFEditor.prototype._onButtonClick = function(event){
	this.state.channel = event.target.innerText;
}

TFEditor.prototype._onMouseDown = function(event){
	this.state.dragging = true;
}

TFEditor.prototype._onMouseUp = function(event){
	this.state.dragging = false;
}

TFEditor.prototype._onMouseMove = function(event){
	//Coordinates in [0-255] int range
	var total_canvas_size = this._canvas_res + 2*this._canvas_margin;
	this.state.x = Math.clamp(Math.round((total_canvas_size-1) * event.layerX / this._width) - this._canvas_margin, 0, this._canvas_res-1);
	this.state.y = Math.clamp(Math.round((total_canvas_size-1) * (1 - event.layerY / this._height)) - this._canvas_margin, 0, this._canvas_res-1);
}

TFEditor.prototype._onMouseLeave = function(event){
	this.state.dragging = false;
}

TFEditor.prototype.show = function(){
	this.visible = true;
	this.container.style.display = "block";
	this.loop();
}

TFEditor.prototype.hide = function(){
	this.visible = false;
	this.container.style.display = "none";
}

TFEditor.prototype.setTF = function(tf){
	this.tf = tf;
}

TFEditor.prototype.loop = function(){
	if(this.visible){
		requestAnimationFrame( this.loop.bind(this) );
		this.setSize();
		this.update();
		this.render();
	}
}

TFEditor.prototype.update = function(){
	if(this.state.dragging && this.state.channel){
		//change values
		var c = (this.state.channel == "r" ? 0 : this.state.channel == "g" ? 1 : this.state.channel == "b" ? 2 : 3);
		var lx = this.state.prevx;
		var ly = this.state.prevy;
		var rx = this.state.x+1;
		var ry = this.state.y+1;
		if(rx < lx){
			lx = this.state.x;
			ly = this.state.y;
			rx = this.state.prevx+1;
			ry = this.state.prevy+1;
		}
		//+1 on r values to prevent dividing by 0
		var transfer_function = this.tf.getTransferFunction();
		for(var i=lx; i<rx; i++){
			var f = (i-lx)/(rx-lx);
			f /= 255;
			transfer_function[i*4+c] = Math.round(ly + f*(ry-ly));
		}
		this.tf._needUpload = true;
		this._needRender = true;
	}

	this.state.prevx = this.state.x;
	this.state.prevy = this.state.y;
}

TFEditor.prototype.render = function(){
	if(this.tf == null) return null;
	this._needRender = false;

	var ctx = this.ctx;

	var w = this._width;
	var h = this._height;

	var real_to_canvas_width = this._canvas_res/w;
	var real_to_canvas_height = this._canvas_res/h;

	//Clear canvas
	ctx.fillStyle = "rgb(255,255,255)";
	ctx.fillRect(this._canvas_margin,this._canvas_margin,this._canvas_res,this._canvas_res);

	//TF
	var transfer_function = this.tf.getTransferFunction();
	for(var i=0; i<this.tf.width; i++){
		var r = transfer_function[4*i];
		var g = transfer_function[4*i+1];
		var b = transfer_function[4*i+2];
		var a = transfer_function[4*i+3]/256;
		ctx.fillStyle = "rgba("+r+","+g+","+b+","+a*0.5+")";
		//ctx.fillStyle = "rgba("+r+","+g+","+b+",0.1)";
		ctx.fillRect(this._canvas_margin+i,this._canvas_margin,1,this._canvas_res);
	}
	
	var v;
	ctx.lineWidth = 3;
	var positionOffsets = {
		r: 0,
		g: 1,
		b: 2,
		a: 3
	};
	var strokeStyles = {
		r: "rgba(255,0,0,0.3)",
		g: "rgba(0,255,0,0.3)",
		b: "rgba(0,0,255,0.3)",
		a: "rgba(128,128,128,0.3)"
	};
	
	for(var c of ["r", "g", "b", "a"]){
		ctx.strokeStyle = strokeStyles[c];
		ctx.beginPath();
		v = transfer_function[positionOffsets[c]];
		ctx.moveTo(this._canvas_margin, this._canvas_margin+255-v);
		for(var i=1; i<transfer_function.length; i++){
			var v = transfer_function[4*i+positionOffsets[c]];
			ctx.lineTo(this._canvas_margin+i, this._canvas_margin+256-v);
		}
		ctx.stroke();
	}

	return;
}

/***
 * ==VolumeNode class==
 * Represents volume + tf + shader + uniforms
 ***/
var VolumeNode = function VolumeNode(){
	this._ctor();
}

VolumeNode.prototype._ctor = function(){
	RD.SceneNode.prototype._ctor.call(this);

	//background = [0,0,0,0];	//Global
	//cuttingPlane = [A,B,C,D];	//Global

	this.intensity = 1;
	this.levelOfDetail = 100;
	this.isosurfaceLevel = 0.5;
	this.voxelScaling = 1;			//?

	this.shader = "volumetric_default";
	this.mesh = "proxy_box";
	this.tf = "tf_default";

	this.uniforms.u_local_camera_position = vec3.create();

	this.uniforms.u_min_value = 0;
	this.uniforms.u_max_value = Math.pow(2,8);

	this._inverse_matrix = mat4.create();
}

VolumeNode.prototype.render = function(renderer, camera){
	//Update uniforms depending on Volumetrics
	renderer.setModelMatrix(this._global_matrix);
	mat4.invert(this._inverse_matrix, this._global_matrix);

	var aux_vec4;

	//vec4 homogeneous_ro = u_im * vec4(u_camera_position, 1.0);
    //vec3 ro = homogeneous_ro.xyz / homogeneous_ro.w;
    aux_vec4 = vec4.fromValues(camera.position[0], camera.position[1], camera.position[2], 1);
    vec4.transformMat4(aux_vec4, aux_vec4, this._inverse_matrix);
    this.uniforms.u_local_camera_position = vec3.fromValues(aux_vec4[0]/aux_vec4[3], aux_vec4[1]/aux_vec4[3], aux_vec4[2]/aux_vec4[3]);

	//Render node
	renderer.renderNode( this, camera );
}

VolumeNode.prototype.setVolumeUniforms = function(volume){
	this.scaling = [volume.width*volume.widthSpacing, volume.height*volume.heightSpacing, volume.depth*volume.depthSpacing];
	this.resolution = [volume.width, volume.height, volume.depth];
}

//TODO
Object.defineProperty(VolumeNode.prototype, "shader", {
	get: function() {
		return this._shader;
	},
	set: function(v) {
		this._shader = v;
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

/***
 * ==LabelNode class==
 * Represents a text
 ***/
var LabelNode = function LabelNode(){
	this._ctor();
}

LabelNode.prototype._ctor = function(){
	RD.SceneNode.prototype._ctor.call(this);

	this._pointerPosition = vec3.create();

	this.text = "";
	this.textColor = [0,0,0,1];
	this.textFontFamily = "Arial";
	this.textFontStyle = "normal";
	this.textFontSize = "16px";
	this.textAlign = "center";
	this.margin = "0px";
	this.padding = "2px";
	this.border = "none";
	this.backgroundColor = [255,255,255,0.5];
}

Object.defineProperty(LabelNode.prototype, "pointerPosition", {
	get: function() {
		return this._pointerPosition;
	},
	set: function(v) {
		this._pointerPosition.set(v);
	},
});

LabelNode.prototype.hide = function(){
	this.flags.visible = false;
}

LabelNode.prototype.show = function(){
	this.flags.visible = true;
}

//If !mesh this method is called without continuing the render pipeline
LabelNode.prototype.onRender = function(renderer, camera){

}

extendClass( LabelNode, RD.SceneNode );

/***
 * ==LabelRenderer class==
 * Controls rendering of LabelNodes
 ***/
var LabelRenderer = function LabelRenderer(container){
	this.container = container;

	this._elements = {};
	this._onclickcallback = null;
	this._oninputcallback = null;
	this._mustupdatelisteners = false;

	this._testDiv = document.createElement("div");
	this._testDiv.style.position = "absolute";
	this._testDiv.style.visibility = "hidden";
	this._testDiv.style.height = "auto";
	this._testDiv.style.width = "auto";
	this._testDiv.style["z-index"] = -1;
	this._testDiv.style["white-space"] = "nowrap";
	this.container.appendChild(this._testDiv);
}

LabelRenderer.prototype.render = function(nodes, camera, layers){
	if(layers === undefined)
		layers = 0xFF;

	if(!camera)
		throw("Renderer.render: camera not provided");

	for(var i=0; i<nodes.length; i++){
		var node = nodes[i];

		var e = this._elements[node._uid];

		if(!e){
			e = document.createElement("input");
			e.style.position = "absolute";
			e.style.visibility = "hidden";
			e.style["z-index"] = 2;
			e.uid = node._uid;
			e.onclick = this.onclick;
			e.oninput = this.oninput;
			this._elements[node._uid] = e;
			this.container.appendChild(e);
		}

		if(this._mustupdatelisteners){
			e.onclick = this.onclick;
			e.oninput = this.oninput;
			this._mustupdatelisteners = false;
		}
		
		if(node.flags.visible === false || !(node.layers & layers)){
			e.style.visibility = "hidden";
		}else{
			e.value = node.text;
			
			var pos2d = camera.project(node.position);
			var pos2dpointer = camera.project(node.pointerPosition);

			this._testDiv.innerText = e.value;
			this._testDiv.style["margin"] = node.margin;
			this._testDiv.style["padding"] = node.padding;
			this._testDiv.style["border"] = node.border;
			this._testDiv.style["font-family"] = node.textFontFamily;
			this._testDiv.style["font-style"] = node.textFontStyle;
			this._testDiv.style["font-size"] = node.textFontSize;

			e.style.width = (this._testDiv.clientWidth > 0 ? this._testDiv.clientWidth + 2 : 10) + "px";
			e.style.height = (this._testDiv.clientHeight > 0 ? (this._testDiv.clientHeight + 2) + "px" : node.textFontSize);

			var rect = e.getBoundingClientRect();

			e.style.left = pos2d[0]-(rect.width/2) + "px";
			e.style.bottom = pos2d[1]-(pos2dpointer[1]>pos2d[1]?rect.height:0) + "px";

			e.style["margin"] = node.margin;
			e.style["padding"] = node.padding;
			e.style["border"] = node.border;
			e.style["color"] = "rgba("+node.textColor[0]+","+node.textColor[1]+","+node.textColor[2]+","+node.textColor[3]+")";
			e.style["background-color"] = "rgba("+node.backgroundColor[0]+","+node.backgroundColor[1]+","+node.backgroundColor[2]+","+node.backgroundColor[3]+")";
			e.style["font-family"] = node.textFontFamily;
			e.style["font-style"] = node.textFontStyle;
			e.style["font-size"] = node.textFontSize;
			e.style["text-align"] = node.textAlign;

			e.style.visibility = "visible";
		}
		e.represented = true;
	}

	for(var k of Object.keys(this._elements)){
		if(this._elements[k].represented){
			this._elements[k].represented = false;
		}else{
			this.container.removeChild(this._elements[k]);
			delete this._elements[k];
		}
	}
}

Object.defineProperty(LabelRenderer.prototype, "onclick", {
	get: function() {
		return this._onclickcallback;
	},
	set: function(v) {
		this._onclickcallback = v;
		this._mustupdatelisteners = true;
	},
});

Object.defineProperty(LabelRenderer.prototype, "oninput", {
	get: function() {
		return this._oninputcallback;
	},
	set: function(v) {
		this._oninputcallback = v;
		this._mustupdatelisteners = true;
	},
});

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
	this.initShaders();

	this.scene = new RD.Scene();
	this.volumeNodes = {};
	this.sceneNodes = {};

	this.labelRenderer = new LabelRenderer(this.container);;
	this.labelNodes = null;
	this.labelLinesMesh = null;
	this.labelLinesSceneNode = null;
	this.labelCallback = null;
	this.initLabels();



	//Global uniforms
	this.visible = options.visible;
	this.background = options.background || [0.7,0.7,0.9,1];
	this.cuttingPlane = options.cuttingPlane || [1,0,0,0];
	this.cuttingPlaneActive = options.cuttingPlaneActive || false;
	this.levelOfDetail = options.levelOfDetail = options.levelOfDetail || 100;



	//State
	this.activeMode = Volumetrics.MODES.NONE;
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
	this.measure = {
		first: null,
		second: null,
		mesh: null,
		node: null,
	};
	this.initMeasure();

	this.pickingTexture = null;
	this.pickingFBO = null;
	this.pickingCallback = null;
	this.initPicking();

	this.fps = 0;
	this._fps = 0;
	setInterval(this.computeFPS.bind(this), 1000);



	if(this.visible){
		this.show();
	}else{
		this.hide();
	}
}

Volumetrics.MODES = {};
Volumetrics.MODES.NONE = 0;
Volumetrics.MODES.PICKPOSITION = 1;
Volumetrics.MODES.MEASURE = 2;
Volumetrics.MODES.CAMERAPAN = 10;
Volumetrics.MODES.CAMERAZOOM  = 11;
Volumetrics.MODES.CAMERAORBIT = 12;
Volumetrics.MODES.CAMERAROTATE = 13;

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
	this.updateLabels(dt);
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

	//render Labels
	this.labelRenderer.render(Object.values(this.labelNodes), this.camera, this.layers);
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
	var mouseGlobalPosition = this.pickPosition(x, y);
	var mouseCameraPosition = this.camera.getRayPlaneCollision(x, y, this.camera.target, this.camera.getFront());

	return {mouseScreenPosition: mouseScreenPosition, mouseGlobalPosition: mouseGlobalPosition, mouseCameraPosition: mouseCameraPosition};
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
	pos = pos || [1000,1000,1000];
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

Volumetrics.prototype.initShaders = function(){
	this.renderer.loadShaders("http://127.0.0.1:5500/../src/shaders.txt");
	//this.renderer.loadShaders("https://webglstudio.org/users/mfloriach/volumetricsDev/src/shaders.txt");
}

//Useful for showing possible "modes"
Volumetrics.prototype.getShaders = function(){
	return this.renderer.shaders;
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
	this.renderer.textures[name] = Volume.createTexture(volume);
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
	if(node instanceof LabelNode) this.addLabelNode(node);

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

///////////////////////////////////////////////////////////////////////////////////////////////
// LabelNodes
///////////////////////////////////////////////////////////////////////////////////////////////

Volumetrics.prototype.initLabels = function(){
	this.labelRenderer.oninput = this.onLabelNodeInput.bind(this);
	this.labelRenderer.onclick = this.onLabelNodeClick.bind(this);

	this.labelNodes = {};

	this.labelLinesMesh = null;
	this.labelLinesSceneNode = new RD.SceneNode();
	this.labelLinesSceneNode.mesh = "_label_lines_mesh";
	this.labelLinesSceneNode.flags.visible = false;
	this.labelLinesSceneNode.primitive = GL.LINES;
	this.addSceneNode(this.labelLinesSceneNode, "_label_lines_scene_node");

	this.labelCallback = null;
}

Volumetrics.prototype.addLabelNode = function(node){
	this.labelNodes[node._uid] = node;
	return node._uid;
}

Volumetrics.prototype.getLabelNode = function(uid){
	return this.labelNodes[uid];
}

Volumetrics.prototype.removeLabelNode = function(uid){
	if(this.labelNodes[uid]){
		delete this.labelNodes[uid];
	}
}

Volumetrics.prototype.onLabelNodeInput = function(event){
	var uid = event.target.uid;
	var node = this.getLabelNode(uid);
	node.text = event.target.value;
	if(this.labelCallback){
		var info = {};
		info.click = false;
		info.input = true;
		info.uid = uid;
		info.labelNode = node;
		this.labelCallback(info);
	}
}

Volumetrics.prototype.onLabelNodeClick = function(event){
	var uid = event.target.uid;
	var node = this.getLabelNode(uid);
	if(this.labelCallback){
		var info = {};
		info.click = true;
		info.input = false;
		info.uid = uid;
		info.labelNode = node;
		this.labelCallback(info);
	}
}

Volumetrics.prototype.updateLabels = function(dt){
	var visibleNodes = [];
	for(var k of Object.keys(this.labelNodes)){
		var node = this.labelNodes[k];
		if(node.flags.visible === false || !(node.layers & this.layers)){
			continue;
		}
		visibleNodes.push(node);
	}

	if(visibleNodes.length){
		var vertices = new Float32Array(visibleNodes.length * 6);

		for(var i=0; i<visibleNodes.length; i++){
			vertices.set(visibleNodes[i].position, i*6);
			vertices.set(visibleNodes[i].pointerPosition, i*6 + 3);
		}

		if(this.labelLinesMesh == null){
			var buffer = new GL.Buffer(gl.ARRAY_BUFFER, vertices, 3, gl.STREAM_DRAW);
			this.labelLinesMesh = new GL.Mesh();
			this.labelLinesMesh.addBuffer("vertices", buffer);
			this.renderer.meshes["_label_lines_mesh"] = this.labelLinesMesh;

		}else{
			this.labelLinesMesh.updateVertexBuffer("vertices", "a_vertex", 3, vertices);
		}

		this.labelLinesSceneNode.flags.visible = true;
	}else{
		this.labelLinesSceneNode.flags.visible = false;
	}
}

Volumetrics.prototype.initMeasure = function(){
	var vertexBuffer = new Float32Array([0,0,0,0,0,0]);
	this.measure.mesh = new Mesh(vertexBuffer);
	this.renderer.meshes["measure_line"] = this.measure.mesh;

	this.measure.node = new RD.SceneNode();
	this.measure.node.flags.visible = false;
	this.measure.node.primitive = GL.LINES;
	this.measure.node.color = [1,1,0,1];

	this.addSceneNode(this.measure.node);
}

///////////////////////////////////////////////////////////////////////////////////////////////
// Picking
///////////////////////////////////////////////////////////////////////////////////////////////

Volumetrics.prototype.initPicking = function(){
	this.getFBO();
}

//Creates an FBO if there is none or if canvas size has changed. Returns the fbo
Volumetrics.prototype.getFBO = function(){
	var needFBO = false;

	//Texture does not exist or does not have correct size, must be done/redone
	if(this.pickingTexture == null || this.pickingTexture.width != this.canvas.width || this.pickingTexture.height != this.canvas.height){
		this.pickingTexture = new GL.Texture(this.canvas.width, this.canvas.height, { format: gl.RGBA, type: gl.FLOAT, magFilter: gl.LINEAR,  });
		needFBO = true;
	}

	if(this.pickingFBO == null || needFBO){
		this.pickingFBO = new GL.FBO([this.pickingTexture]);
	}

	return this.pickingFBO;
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

	for(var node of Object.values(this.volumeNodes)){
		//Change shader temporaly
		var usedShader = node.shader;
		node.shader = "volumetric_picking";

		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
		this.renderer.render(this.scene, this.camera, [node]);

		//Set original shader
		node.shader = usedShader;

		//Get RGBA
		gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, pixels);
		if(pixels[3] != 1.0) continue; //1.0 => there is a hit, 0.0 => there is no hit with volume

		//Pos in local coordinates [-1,1] to global coordinates [R]
		var localPos = vec4.fromValues(pixels[0], pixels[1], pixels[2], 1.0);
		var globalPos = vec4.create();
		vec4.transformMat4(globalPos, localPos, node._global_matrix);
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

Volumetrics.prototype.setPickPositionCallback = function(f){
	this.pickingCallback = f;
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
