
var DL = {};

DL._loading = false;

DL._currentDicom = null;

DL.Tags = {};

//Study
DL.Tags.modality 				= "00080060";
DL.Tags.studyDescription 		= "00081030";
DL.Tags.MRAcquisitionType 		= "00180023"; //[1D, 2D, 3D]

//Image
DL.Tags.samplesPerPixel 			= "00280002"; //[ 1				, 1				, 3		, 3			, 3				, 3			, 3			, 3					]
DL.Tags.photometricInterpretation 	= "00280004"; //[MONOCHROME2	, PALETTE COLOR	, RGB	, YBR_FULL	, YBR_FULL_422	, YBR_RCT	, YBR_ICT	, YBR_PARTIAL_420	]
DL.Tags.photometricInterpretationOptions = ["MONOCHROME2", "PALETTE COLOR", "RGB", "YBR_FULL", "YBR_FULL_422", "YBR_RCT", "YBR_ICT", "YBR_PARTIAL_420"];

DL.Tags.rows 			= "00280010"; //# of rows
DL.Tags.columns 		= "00280011"; //# of columns
DL.Tags.slices			= "00201002"; //# of images AKA slices

DL.Tags.pixelSpacing 	= "00280030"; //mm between 2 centers of pixels. Value[0] is for pixels in 2 adjacent rows and value[1] is for pixels in 2 djacent columns
DL.Tags.sliceThickness 	= "00180050"; //mm between 2 centers of pixels in adjacent slices

DL.Dicom = function Dicom(files){
	this.files = files;
	this.series = new daikon.Series();
	this._currentFile = 0;
}

//STUDY INFO
//Type of scan
DL.Dicom.prototype.getModality = function(){
	if(this.series.images.length > 0 && this.series.images[0].tags[DL.Tags.modality])
		return this.series.images[0].tags[DL.Tags.modality].value[0];
	return null;
}

//Area of the body
DL.Dicom.prototype.getStudyDescription = function(){
	if(this.series.images.length > 0 && this.series.images[0].tags[DL.Tags.studyDescription])
		return this.series.images[0].tags[DL.Tags.studyDescription].value[0];
	return null;
}

DL.Dicom.prototype.getMRAcquisitionType = function(){
	if(this.series.images.length > 0 && this.series.images[0].tags[DL.Tags.MRAcquisitionType])
		return this.series.images[0].tags[DL.Tags.MRAcquisitionType].value[0];
	return null;
}

//IMAGE INFO
DL.Dicom.prototype.getSamplesPerPixel = function(){
	if(this.series.images.length > 0 && this.series.images[0].tags[DL.Tags.samplesPerPixel])
		return this.series.images[0].tags[DL.Tags.samplesPerPixel].value[0];
	return null;
}

DL.Dicom.prototype.getPhotometricInterpretation = function(){
	if(this.series.images.length > 0 && this.series.images[0].tags[DL.Tags.photometricInterpretation])
		return this.series.images[0].tags[DL.Tags.photometricInterpretation].value[0];
	return null;
}

//Same as .height
DL.Dicom.prototype.getRows = function(){
	if(this.series.images.length > 0 && this.series.images[0].tags[DL.Tags.rows])
		return this.series.images[0].tags[DL.Tags.rows].value[0];
	return null;
}

//Same as .width
DL.Dicom.prototype.getColumns = function(){
	if(this.series.images.length > 0 && this.series.images[0].tags[DL.Tags.columns])
		return this.series.images[0].tags[DL.Tags.columns].value[0];
	return null;
}

//Total numer of slices
DL.Dicom.prototype.getSlices = function(){
	if(this.series.images.length > 0 && this.series.images[0].tags[DL.Tags.slices])
		return this.series.images[0].tags[DL.Tags.imagesInAcquisition].value[0];
	return null;
}

//Return the real distance (in mm) between 2 adjacent pixels in different rows
DL.Dicom.prototype.getRowSpacing = function(){
	if(this.series.images.length > 0 && this.series.images[0].tags[DL.Tags.pixelSpacing])
		return this.series.images[0].tags[DL.Tags.pixelSpacing].value[0];
	return null;
}

//Return the real distance (in mm) between 2 adjacent pixels in different columns
DL.Dicom.prototype.getColumnSpacing = function(){
	if(this.series.images.length > 0 && this.series.images[0].tags[DL.Tags.pixelSpacing])
		return this.series.images[0].tags[DL.Tags.pixelSpacing].value[1];
	return null;
}

//Return the real distance (in mm) between 2 adjacent pixels in different slices
DL.Dicom.prototype.getSliceSpacing = function(){
	if(this.series.images.length > 0 && this.series.images[0].tags[DL.Tags.sliceThickness])
		return this.series.images[0].tags[DL.Tags.sliceThickness].value[0];
	return null;
}

DL.DicomImage = function DicomImage(dicom){
	this.width = null;
	this.height = null;
    this.depth = null;

    this.channels = null;
    this.photometricInterpretation = null;

    this.columnSpacing = null;
    this.rowSpacing = null;
    this.sliceSpacing = null;
    
    if(dicom){
    	this.width = dicom.series.images[0].getCols();
    	this.height = dicom.series.images[0].getRows();
    	this.depth = dicom.series.images.length;

    	this.channels = dicom.getSamplesPerPixel() || 1;
    	this.photometricInterpretation = dicom.getPhotometricInterpretation() || "MONOCHROME2";

    	this.columnSpacing = dicom.getColumnSpacing() || 1;
    	this.rowSpacing = dicom.getRowSpacing() || 1;
    	this.sliceSpacing = dicom.getSliceSpacing() || 1;
    }
    
    this.imageData = null;
    this._histogram = null;
    this._gradient = null;
}

DL.DicomImage.prototype.getHistogram = function(){
	if(this.imageData == null) return null;
	if(this._histogram) return this._histogram;

	var data = new Uint8Array(this.imageData);

	var h = new Float64Array(256);
	var hn = new Uint8Array(256);

	for(var i=0; i<data.length; i++){
		h[data[i]]++;
	}

	var m = 0;
	for(var i=0; i<256; i++){
		if(h[i]>m) m=h[i];
	}

	for(var i=0; i<256; i++){
		hn[i] = Math.round(255 * 0.9*Math.pow( 0.1+(h[i]/m), 0.8 ));
	}

	return this._histogram = hn;
}

DL.DicomImage.prototype.getGradient = function(){
	if(this.imageData == null) return null;
	if(this._gradient) return this._gradient;

	var data = new Uint8Array(this.imageData);
	var g = new Int8Array(this.width*this.height*this.depth*3);

	var l = this.width;
	var s = this.width*this.height;

	for(var i=0; i<this.width; i++){
		for(var j=0; j<this.height; j++){
			for(var k=0; k<this.depth; k++){
				var d_i = i + j*this.width + k*this.width*this.height;
				var g_i = d_i*3;
				g[g_i]   = Math.floor( 0.5*((i>0?data[d_i-1]:0) - (i<this.width-1 ?data[d_i+1]:0)) ); //x
				g[g_i+1] = Math.floor( 0.5*((j>0?data[d_i-l]:0) - (j<this.height-1?data[d_i+l]:0)) ); //y
				g[g_i+2] = Math.floor( 0.5*((k>0?data[d_i-s]:0) - (j<this.depth-1 ?data[d_i+s]:0)) ); //z
			}
		}
	}

	return this._gradient = g;
}


DL.load = function(files, callback){
	if(DL.loading){
		console.log("DL is already loading a dicom series.");
		return false;
	}
	DL._loading = true;
	DL._currentDicom = new DL.Dicom(files);
	var reader = new FileReader();

	console.log(DL._currentDicom)

	function readFile(){
		var i = DL._currentDicom._currentFile++;
		if(i < DL._currentDicom.files.length){
			console.log("Reading file " + DL._currentDicom._currentFile + " of " + DL._currentDicom.files.length + "...");
			reader.readAsArrayBuffer(DL._currentDicom.files[i]);
		}else{
			console.log("All files (" + DL._currentDicom.files.length + ") readed.");
			console.log("Ordering series...");
			DL._currentDicom.series.buildSeries();
			console.log("Ordering done.");
			DL._loading = false;
			callback(DL._currentDicom);
		}
		
	}

	reader.onloadend = function(event){
		if(event.target.readyState === FileReader.DONE){
	        //parse file
	        var image = daikon.Series.parseImage(new DataView(event.target.result));
	        if(image === null){
	            console.log(daikon.Series.parserError);
	        } else if(image.hasPixelData()){
	            // if it's part of the same series, add it
	            if ((DL._currentDicom.series.images.length === 0) || (image.getSeriesId() === DL._currentDicom.series.images[0].getSeriesId())) {
	                DL._currentDicom.series.addImage(image);
	            }
	        }

	        //read next file
	        readFile();
	    }
	}

	readFile();
	return true;
};

//TODO make function async
DL.texture3d = function(dicom, callback, options){
	//options
	options = options || {};
	var sourceCanals = options.sourceCanals ? options.sourceCanals : 1;

	//image
	var image = new DL.DicomImage(dicom);

	var textureChannels = image.channels;

	var sliceSizeSource = image.width*image.height*sourceCanals;
    var sliceSizeTexture = image.width*image.height*textureChannels;

    var buffer = new ArrayBuffer(sliceSizeTexture*image.depth);
    var view = new Uint8Array(buffer);

    //fill image
    for(var i=0; i<image.depth; i++){
        console.log("Creating 3D Texture with slice " + (i+1) + " of " + image.depth + "...")
        var imgData = dicom.series.images[i].getInterpretedData(true);

        for(var j=0; j<sliceSizeSource; j++){
        	var value = [];
        	for(var k=0; k<textureChannels; k++){
        		value.push((k != 0 && k == textureChannels-1)? 255 : imgData[j]);
        	}

            var index = i*sliceSizeTexture + j*textureChannels;
            view.set(value, index);
        }
    }

    image.imageData = buffer;
    callback(image);
};

DL.dlHeaderElements = 8;

DL.getDLAsUint8Array = function(image){
	var imageView = new Uint8Array(image.imageData);
	//append dimensions data at the end
	var headerSize = 4*DL.dlHeaderElements; //4 bytes per number in header
	var buffer = new ArrayBuffer(image.imageData.byteLength + headerSize);
    var view8 = new Uint8Array(buffer);
    view8.set(imageView, headerSize);

    var view32 = new Uint32Array(buffer);
    var view32F = new Float32Array(buffer);
    view32[0] = image.width;
    view32[1] = image.height;
    view32[2] = image.depth;
    view32[3] = image.channels;
    view32[4] = DL.Tags.photometricInterpretationOptions.indexOf(image.photometricInterpretation);
    if(view32[4] < 0) view32[4] = 0;
    
    view32F[5] = image.rowSpacing;
    view32F[6] = image.columnSpacing;
    view32F[7] = image.sliceSpacing;

    return view8;
}

DL.downloadTexture = function(image){
	console.log("Creating file...");
	var view8 = DL.getDLAsUint8Array(image);

	var blob = new Blob([view8]);
    var fakeUrl = URL.createObjectURL(blob);
	var element = document.createElement("a");
	element.setAttribute('href', fakeUrl);
	element.setAttribute('download', "texture3d.dl" );
	element.style.display = 'none';
	document.body.appendChild(element);
	element.click();
	document.body.removeChild(element);
	console.log("Downloading...");
};


DL.loadTextureFile = function(file, callback){
	console.log("Loading texture...");
	var reader = new FileReader();

	reader.onloadend = function(event){
		if(event.target.readyState === FileReader.DONE){
	        var buffer = event.target.result;
	        DL.loadTextureBuffer(buffer, callback);
	    }
	}

	reader.readAsArrayBuffer(file);
};

DL.loadTextureBuffer = function(buffer, callback){
	console.log("Loading texture...");
	var view32 = new Uint32Array(buffer);
	var view32F = new Float32Array(buffer);
	var image = new DL.DicomImage(null);
	image.width = view32[0];
	image.height = view32[1];
	image.depth = view32[2];
	image.channels = view32[3];
	image.photometricInterpretation = DL.Tags.photometricInterpretationOptions[view32[4]];
	image.rowSpacing = view32F[5];
	image.columnSpacing = view32F[6];
	image.sliceSpacing = view32F[7];
	image.imageData = buffer.slice(4*DL.dlHeaderElements);
	console.log("Loaded.");
	callback(image);
}
