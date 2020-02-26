///////////////////////////////////////////////////////////////////////////////////////////////
// MAIN
///////////////////////////////////////////////////////////////////////////////////////////////

//Global variables
var volumetrics = null;
var tfeditor = null;
var volumes = [];       //There can be multiple volumes loaded but we only want to render one...
var volumeNode = null;  //...in the test app, so we will only work with 1 node
var appMode = "none";
var tf = null;

init();

///////////////////////////////////////////////////////////////////////////////////////////////
// APP INIT FUNCTIONS
///////////////////////////////////////////////////////////////////////////////////////////////

function init(){
    initVolumetrics();
    initListeners();

    
}

function initVolumetrics(){
    var container = document.getElementById("volumetrics");
    volumetrics = new Volumetrics({container: container, visible: true, background: [0.9,0.9,0.9,1]});
    
    tf = new TransferFunction();
    onPreset3();

    var tfecontainer = document.getElementById("tfeditor");
    tfeditor = new TFEditor({container: tfecontainer, visible: true});
	tfeditor.setTF(tf);
    
    volumetrics.addTransferFunction(tf, "mytf");
    volumetrics.loadShaders("http://127.0.0.1:5500/../src/example_extra_shader.glsl", onVolumetricsInit);

    volumeNode = new VolumeNode();
}

function onVolumetricsInit(){
    volumeNode.shader = "simple_isosurface";
    download("../samples/1010_brain_mr_02.nii");
}

function initListeners(){
    var toolCameraPan = document.getElementById("toolCameraPan");
    var toolCameraZoom = document.getElementById("toolCameraZoom");
    var toolCameraOrbit = document.getElementById("toolCameraOrbit");
    var toolCameraRotate = document.getElementById("toolCameraRotate");
    var toolCameraReset = document.getElementById("toolCameraReset");
    var toolAnnotation = document.getElementById("toolAnnotation");

    toolCameraPan.addEventListener("click", function(){
        volumetrics.activeMode = Volumetrics.MODES.CAMERAPAN;
    }, false);

    toolCameraZoom.addEventListener("click", function(){
        volumetrics.activeMode = Volumetrics.MODES.CAMERAZOOM;
    }, false);

    toolCameraOrbit.addEventListener("click", function(){
        volumetrics.activeMode = Volumetrics.MODES.CAMERAORBIT;
    }, false);

    toolCameraRotate.addEventListener("click", function(){
        volumetrics.activeMode = Volumetrics.MODES.CAMERAROTATE;
    }, false);

    toolCameraReset.addEventListener("click", function(){
        volumetrics.initCamera();
    }, false);

    toolAnnotation.addEventListener("click", function(){
        volumetrics.activeMode = Volumetrics.MODES.PICKPOSITION;
        appMode = "annotation";
    }, false);

    toolRemoveAnnotation.addEventListener("click", function(){
        volumetrics.activeMode = Volumetrics.MODES.NONE;
        appMode = "removeAnnotation";
    }, false);


    var preset1 = document.getElementById("preset1");
    var preset2 = document.getElementById("preset2");
    var preset3 = document.getElementById("preset3");

    preset1.addEventListener("click", onPreset1, false);
    preset2.addEventListener("click", onPreset2, false);
    preset3.addEventListener("click", onPreset3, false);

    // Cutting Plane
    var cuttingONInput = document.getElementById("cuttingON");
    var onCuttingONOFF = function(event){
        volumetrics.cuttingPlaneActive = cuttingONInput.checked;
    }
    cuttingONInput.addEventListener("click", onCuttingONOFF, false);

    var cuttingSliderInput = document.getElementById("cuttingSlider");
    var onCuttingSlider = function(event){
        var plane = volumetrics.cuttingPlane;
        plane[3] = cuttingSliderInput.value;
        volumetrics.cuttingPlane = plane;
    }
    cuttingSliderInput.addEventListener("input", onCuttingSlider, false);

    // Isosurface
    var isosurfaceValueSlider = document.getElementById("isosurfaceValue");
    var onIsosurfaceValueSlider = function(event){
        volumetrics.setGlobalUniform("u_isosurface_value", isosurfaceValueSlider.value);
    }
    isosurfaceValueSlider.addEventListener("input", onIsosurfaceValueSlider, false);

    var isosurfaceMarginSlider = document.getElementById("isosurfaceMargin");
    var onIsosurfaceMarginSlider = function(event){
        volumetrics.setGlobalUniform("u_isosurface_margin", isosurfaceMarginSlider.value);
    }
    isosurfaceMarginSlider.addEventListener("input", onIsosurfaceMarginSlider, false);
}

function onPreset1(){
    tf.fromPoints([{"x":0.15885416666666666,"r":1,"g":1,"b":1,"a":0},{"x":0.2109375,"r":1,"g":1,"b":1,"a":0.2},{"x":0.2578125,"r":1,"g":0.548,"b":0,"a":0.3},{"x":0.8463541666666666,"r":1,"g":0,"b":0,"a":0.5},{"x":0.8854166666666666,"r":0,"g":0,"b":0,"a":0}]);
}

function onPreset2(){
    tf.fromPoints([{x:0.3,r:0,g:1,b:0,a:0.1}, {x:1,r:0,g:0,b:1,a:1}]);
}

function onPreset3(){
    tf.fromPoints([{x: 0, r: 0, g: 0, b: 1, a: 0.5}, {x: 1, r: 1, g: 0, b: 0, a: 0.5}]);    
    
    //tf.fromPoints([{x: 0.2, r: 0, g: 0, b: 0, a: 0}, {x: 0.2, r: 0, g: 0, b: 0, a: 0.5},{x: 0.3, r: 0, g: 0, b: 0, a: 0.5},{x: 0.3, r: 0, g: 0, b: 0, a: 0}]);    
    //tf.fromPoints([{x:0.45,r:0,g:0,b:0,a:0}, {x:0.5,r:1,g:0,b:0,a:1}, {x:0.55,r:0,g:0,b:0,a:0}]);
}

///////////////////////////////////////////////////////////////////////////////////////////////
// Labels
///////////////////////////////////////////////////////////////////////////////////////////////

var labelNode = null;

function onLabelInfo(info){
    if(info.click){
        if(appMode == "removeAnnotation"){
            volumetrics.removeLabelNode(info.uid);
        }
    }else if(info.input){
        //console.log("Text changed! ", info.labelNode.text);
    }
}
volumetrics.labelCallback = onLabelInfo;

///////////////////////////////////////////////////////////////////////////////////////////////
// Load Volumes from files
///////////////////////////////////////////////////////////////////////////////////////////////

function onVolume(response){
    if(response.status == VolumeLoader.DONE){
        console.log("Volume loaded.");

        for(var v of response.volumes){
            volumes.push(v);
        }

        var volume = response.volume;
        volumetrics.addVolume(volume, "importvol");

        var node = volumeNode;
        node.volume = "importvol";
        node.tf = "mytf";
        volumetrics.addVolumeNode(node);

        node._update_shader = true;

    }else if(response.status == VolumeLoader.ERROR){
        console.log("Error: ", response.explanation);
    }else if(response.status == VolumeLoader.STARTING){
        console.log("Starting...");
    }else if(response.status == VolumeLoader.LOADINGFILES){
        console.log("Loading Files...");
    }else if(response.status == VolumeLoader.PARSINGFILES){
        console.log("Parsing Volumes...");
    }else if(response.status == VolumeLoader.CREATINGVOLUMES){
        console.log("Creating Volumes...");
    }
};

function isDicom(ext){
    return ext == "dcm";
}

function isNifti(ext){
    return ext == "nii";
}

function isVL(ext){
    return ext == "vl";
}

function handleInput(event){
    var files = event.target.files;

    if(files.length == 0) return;

    var dicoms = [];
    var niftis = [];
    var vls = [];

    for(var file of files){
        var ext = file.substring(file.lastIndexOf(".")+1);

        if(isDicom(ext)){
            dicoms.push(file);
        }else if(isNifti(ext)){
            niftis.push(file);
        }else if(isVL(ext)){
            vls.push(file);
        }else{
            console.log("File format is not .dcm, .nii or .vl: " + file);
        }
    }

    if(dicoms.length > 0){
        VolumeLoader.loadDicomFiles(dicoms, onVolume, onVolume);
    }
    if(niftis.length > 0){
        VolumeLoader.loadNiftiFiles(niftis, onVolume, onVolume);
    }
    if(vls.length > 0){
        VolumeLoader.loadVLFiles(vls, onVolume, onVolume);
    }
}
var folderInput = document.getElementById("folderInput");
var filesInput = document.getElementById("filesInput");
folderInput.addEventListener("change", handleInput, false);
filesInput.addEventListener("change", handleInput, false);

function download(name){
    var urlpart = window.location.href.split("/");
    var url = "";
    for(var i=0; i<urlpart.length-1; i++){
        url += urlpart[i] + "/";
    }
    downloadUrl(url + name);
}

//Does not work with dicom volumes because them aren't a single file
function downloadUrl(url){
    var ext = url.substring(url.lastIndexOf(".")+1);
    if(!(isVL(ext)||isNifti(ext))){
        console.log("Cannot know format of " + url + ". Not downloading.");
    }

    console.log("Downloading volume from " + url + "...");
    fetch(url)
        .then(function(response) {
            return response.arrayBuffer();
        })
        .then(function(buffer) {
            console.log("Downloaded.");
            if(isVL(ext))
                VolumeLoader.parseVLBuffers([buffer], onVolume, onVolume);
            else if(isNifti(ext))
                VolumeLoader.parseNiftiBuffers([buffer], onVolume, onVolume);
        });
}
