///////////////////////////////////////////////////////////////////////////////////////////////
// DATA
///////////////////////////////////////////////////////////////////////////////////////////////
var app = {
    volumes: [],

    volumetrics: null,
    tfeditor: null,

    testPicking: true,
};

function init(){
    var container = document.getElementById("volumetrics");
    app.volumetrics = new Volumetrics({container: container, visible: true, background: [0.3,0.3,0.3,1]});

	var tf = new TransferFunction();
    tf.points = [{x:0.35,r:0,g:0,b:0,a:0.001}, {x:0.4,r:0,g:1,b:0,a:0.001}, {x:0.7,r:1,g:0,b:0,a:0.3}, {x:0.9,r:0,g:0.8,b:0.9,a:0.6}];
    tf._needUpdate = true;

    tf.points = [{x:0,r:0,g:1,b:0,a:0.002}, {x:1,r:0,g:0,b:1,a:1}];
    tf._needUpdate = true;

    var tfecontainer = document.getElementById("tfeditor");
    app.tfeditor = new TFEditor({container: tfecontainer, visible: true});
	app.tfeditor.setTF(tf);

    app.volumetrics.addTransferFunction(tf, "mytf");

    app.volumetrics.setPickPositionCallback(onPicking);
}
init();

var toolCameraNone = document.getElementById("toolCameraNone");
var toolCameraPan = document.getElementById("toolCameraPan");
var toolCameraZoom = document.getElementById("toolCameraZoom");
var toolCameraOrbit = document.getElementById("toolCameraOrbit");
var toolCameraRotate = document.getElementById("toolCameraRotate");
var toolCameraReset = document.getElementById("toolCameraReset");
var toolTestPicking = document.getElementById("toolTestPicking");

toolCameraNone.addEventListener("click", function(){
    app.volumetrics.activeMode = Volumetrics.MODES.NONE;
}, false);

toolCameraPan.addEventListener("click", function(){
    app.volumetrics.activeMode = Volumetrics.MODES.CAMERAPAN;
}, false);

toolCameraZoom.addEventListener("click", function(){
    app.volumetrics.activeMode = Volumetrics.MODES.CAMERAZOOM;
}, false);

toolCameraOrbit.addEventListener("click", function(){
    app.volumetrics.activeMode = Volumetrics.MODES.CAMERAORBIT;
}, false);

toolCameraRotate.addEventListener("click", function(){
    app.volumetrics.activeMode = Volumetrics.MODES.CAMERAROTATE;
}, false);

toolCameraReset.addEventListener("click", function(){
    app.volumetrics.resetCamera();
}, false);

toolTestPicking.addEventListener("click", function(){
    app.volumetrics.activeMode = Volumetrics.MODES.PICKPOSITION;
}, false);

///////////////////////////////////////////////////////////////////////////////////////////////
// Testing
///////////////////////////////////////////////////////////////////////////////////////////////
function testLabels(){
    var labelNode = new LabelNode();
    labelNode.text = "Hola Javi!!!"
    labelNode.pointerPosition = [-100,100,100];
    app.volumetrics.labelNodes.test = labelNode;
}
testLabels();

///////////////////////////////////////////////////////////////////////////////////////////////
// Picking
///////////////////////////////////////////////////////////////////////////////////////////////

function onPicking(info){
    if(info.up && info.mouseGlobalPosition != null){
        var sceneNode = new RD.SceneNode();
        sceneNode.mesh = "sphere";
        sceneNode.position = info.mouseGlobalPosition;
        sceneNode.color = [1, 1, 0];

        app.volumetrics.addSceneNode(sceneNode);
    }
}
app.volumetrics.renderer.meshes["sphere"] = GL.Mesh.sphere({radius:5});

///////////////////////////////////////////////////////////////////////////////////////////////
// Shaders
///////////////////////////////////////////////////////////////////////////////////////////////

var shaderDefault = document.getElementById("shaderDefault");
var onShaderDefault = function(event){
    app.volumetrics.shader = "volumetric_default";
}
shaderDefault.addEventListener("click", onShaderDefault, false);

var shaderXRAY = document.getElementById("shaderXRAY");
var onShaderXRAY = function(event){
    app.volumetrics.shader = "volumetric_xray";
}
shaderXRAY.addEventListener("click", onShaderXRAY, false);

var shaderMIP = document.getElementById("shaderMIP");
var onShaderMIP = function(event){
    app.volumetrics.shader = "volumetric_mip";
}
shaderMIP.addEventListener("click", onShaderMIP, false);

var shaderPicking = document.getElementById("shaderPicking");
var onShaderPicking = function(event){
    app.volumetrics.shader = "volumetric_picking";
}
shaderPicking.addEventListener("click", onShaderPicking, false);

///////////////////////////////////////////////////////////////////////////////////////////////
// Cutting Plane
///////////////////////////////////////////////////////////////////////////////////////////////

var cuttingONInput = document.getElementById("cuttingON");
var onCuttingONOFF = function(event){
    app.volumetrics.cuttingPlaneActive = cuttingONInput.checked;
}
cuttingONInput.addEventListener("click", onCuttingONOFF, false);

var cuttingSliderInput = document.getElementById("cuttingSlider");
var onCuttingSlider = function(event){
    app.volumetrics.cuttingPlaneZ = cuttingSliderInput.value;
}
cuttingSliderInput.addEventListener("input", onCuttingSlider, false);

///////////////////////////////////////////////////////////////////////////////////////////////
// Import Volumes from files
///////////////////////////////////////////////////////////////////////////////////////////////

var importVolumeNode = new VolumeNode();
var importONInput = document.getElementById("importON");
var onImportONInputOFF = function(event){
    if(importONInput.checked){
        importVolumeNode.show();
    }else{
        importVolumeNode.hide();
    }
}
importONInput.addEventListener("click", onImportONInputOFF, false);

function onVolume(response){
    if(response.status == VolumeLoader.DONE){
        console.log("Volume loaded.");

        for(var v of response.volumes){
            app.volumes.push(v);
        }

        var volume = response.volume;
        app.volumetrics.addVolume(volume, "importvol");

        var node = importVolumeNode;
        node.volume = "importvol";
        node.tf = "mytf";
        app.volumetrics.addVolumeNode(node, "importnode");

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

//Nifti
function handleNiiInput(event){
    var files = event.target.files;
    if(files.length > 0)
        VolumeLoader.loadNiftiFiles(files, onVolume, onVolume);
};
var niiInput = document.getElementById("niiInput");
niiInput.addEventListener("change", handleNiiInput, false);

//Dicom
function handleDicomInput(event){
    var files = event.target.files;

    if(files.length > 0)
        VolumeLoader.loadDicomFiles(files, onVolume, onVolume);
};

var dicomInput = document.getElementById("dicomInput");
dicomInput.addEventListener("change", handleDicomInput, false);

//VL
function handleVLInput(event){
    var files = event.target.files;
    if(files.length > 0)
        VolumeLoader.loadVLFiles(files, onVolume, onVolume);
};
var vlInput = document.getElementById("vlInput");
vlInput.addEventListener("change", handleVLInput, false);

function downloadVLExample(){
    console.log("Downloading example...");
    fetch("https://webglstudio.org/users/mfloriach/volumetrics/demo/texture3d.vl")
        .then(function(response) {
            return response.arrayBuffer();
        })
        .then(function(buffer) {
            console.log("Example downloaded.");
            VolumeLoader.parseVLBuffers([buffer], onVolume, onVolume);
        });
};
var vlExampleButton = document.getElementById("vlExample");
vlExampleButton.addEventListener("click", downloadVLExample);

///////////////////////////////////////////////////////////////////////////////////////////////
// Math
///////////////////////////////////////////////////////////////////////////////////////////////

var mathON = false;
var mathONInput = document.getElementById("mathON");
var mathFuncInput = document.getElementById("mathFunc");
var mathSetButton = document.getElementById("mathSet");

var mathInit = function(){
    app.math = {
        volume: null,
        node: new VolumeNode(),
        func: "x+y+z",
        code: null,
        width: 1,
        height: 1,
        depth: 1,
        bytes: 1,
        totalbytes: 1,
        buffer: null,
        view: null,

    }

    mathSetDimensions(128, 128, 128, 1);

    app.math.node.volume = "mathVolume";
    app.math.node.tf = "mytf";
    app.math.node.hide();
    app.volumetrics.addVolumeNode(app.math.node, "mathVolumeNode");

    app.math.func = "1 - (x^2 + y^2 + z^2)/3";
    mathFuncInput.value = app.math.func;
}

var mathSetDimensions = function(width, height, depth, bytes){
    var preBytes = app.math.totalbytes;
    var totalbytes = width*height*depth*bytes;

    app.math.width = width;
    app.math.height = height;
    app.math.depth = depth;
    app.math.bytes = bytes;
    app.math.totalbytes = totalbytes;

    if(app.math.buffer && preBytes == totalbytes) return;

    app.math.buffer = new ArrayBuffer(totalbytes);
    if(bytes == 1){
        app.math.view = new Uint8Array(app.math.buffer);
    }else if(bytes == 2){
        app.math.view = new Float32Array(app.math.buffer);
    }else if(bytes == 4){
        app.math.view = new Float32Array(app.math.buffer);
    }else{
        console.log("bytes value not valid in mathSetDimensions, it must be 1, 2 or 4.");
        app.math.buffer = null;
        return;
    }

    app.math.volume = Volume.create(width, height, depth, {voxelDepth: bytes*8}, app.math.buffer);
    app.volumetrics.addVolume(app.math.volume, "mathVolume");
}

var onMathONOFF = function(event){
    if(mathONInput.checked == false){
        app.math.node.hide();
    }else{
        app.math.node.show();
    }
}

var onMathFuncSet = function(event){
    app.math.func = mathFuncInput.value;
    app.math.code = math.compile(app.math.func);
    app.math.scope = {x: 0, y: 0, z: 0, t: 0};

    mathComputeValues();
}

var mathComputeValues = function(){
    var s;
    if(app.math.bytes == 1){
        s = 255;
    }else if(app.math.bytes == 2){
        s = 1;
    }else if(app.math.bytes == 4){
        s = 1;
    }else{
        console.log("bytes value not valid in mathComputeValues, it must be 1, 2 or 4.");
        return;
    }

    var code = app.math.code;
    var scope = app.math.scope;

    var w = app.math.width;
    var h = app.math.height;
    var d = app.math.depth;

    var ww = w/2;
    var hh = h/2;
    var dd = d/2;

    for(var i=0; i<w; i++){
        for(var j=0; j<h; j++){
            for(var k=0; k<d; k++){
                scope.x = (i-w/2)/ww;
                scope.y = (j-h/2)/hh;
                scope.z = (k-d/2)/dd;
                var val = code.evaluate(scope);
                val *= s;
                app.math.view[i + j*w + k*w*h] = val;
            }
        }
    }

    app.math.volume.uploadDataTexture();
}

mathInit();

mathONInput.addEventListener("click", onMathONOFF, false);
mathSetButton.addEventListener("click", onMathFuncSet, false);
