///////////////////////////////////////////////////////////////////////////////////////////////
// MAIN
///////////////////////////////////////////////////////////////////////////////////////////////

var volumetrics = null;
var tfeditor = null;
var volumes = [];
var appMode = "none";

function init(){
    var container = document.getElementById("volumetrics");
    volumetrics = new Volumetrics({container: container, visible: true, background: [0.3,0.3,0.3,1]});

	var tf = new TransferFunction();
    tf.points = [{x:0.35,r:0,g:0,b:0,a:0.001}, {x:0.4,r:0,g:1,b:0,a:0.001}, {x:0.7,r:1,g:0,b:0,a:0.3}, {x:0.9,r:0,g:0.8,b:0.9,a:0.6}];
    tf._needUpdate = true;

    tf.points = [{x:0,r:0,g:1,b:0,a:0.002}, {x:1,r:0,g:0,b:1,a:1}];
    tf._needUpdate = true;

    var tfecontainer = document.getElementById("tfeditor");
    tfeditor = new TFEditor({container: tfecontainer, visible: true});
	tfeditor.setTF(tf);

    volumetrics.addTransferFunction(tf, "mytf");

    volumetrics.setPickPositionCallback(onPicking);

    volumetrics.activeMode = Volumetrics.MODES.CAMERAORBIT;
}
init();

var toolCameraNone = document.getElementById("toolCameraNone");
var toolCameraPan = document.getElementById("toolCameraPan");
var toolCameraZoom = document.getElementById("toolCameraZoom");
var toolCameraOrbit = document.getElementById("toolCameraOrbit");
var toolCameraRotate = document.getElementById("toolCameraRotate");
var toolCameraReset = document.getElementById("toolCameraReset");
var toolTestPicking = document.getElementById("toolTestPicking");
var toolAnnotation = document.getElementById("toolAnnotation");

toolCameraNone.addEventListener("click", function(){
    volumetrics.activeMode = Volumetrics.MODES.NONE;
}, false);

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

toolTestPicking.addEventListener("click", function(){
    volumetrics.activeMode = Volumetrics.MODES.PICKPOSITION;
    appMode = "testPick";
}, false);

toolAnnotation.addEventListener("click", function(){
    volumetrics.activeMode = Volumetrics.MODES.PICKPOSITION;
    appMode = "annotation";
}, false);

toolRemoveAnnotation.addEventListener("click", function(){
    volumetrics.activeMode = Volumetrics.MODES.NONE;
    appMode = "removeAnnotation";
}, false);

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
// Picking
///////////////////////////////////////////////////////////////////////////////////////////////

var downpick = null;
var movepick = null;
var uppick = null;
function onPicking(info){
    if(info.down){
        downpick = info;

        if(downpick.left == true){
            if(appMode == "annotation" && info.mouseGlobalPosition && labelNode == null){
                labelNode = new LabelNode();
                labelNode.text = "...";
                labelNode.pointerPosition = vec3.clone(info.mouseGlobalPosition);
                labelNode.position = vec3.clone(info.mouseGlobalPosition);
                volumetrics.addLabelNode(labelNode);
            }
        }
    }
    else if(info.dragging){
        movepick = info;

        if(appMode == "annotation" && labelNode != null){
            var delta = vec3.subtract(vec3.create(), movepick.mouseCameraPosition, downpick.mouseCameraPosition);
            labelNode.position = vec3.add(vec3.create(), labelNode.pointerPosition, delta);
        }
    }
    else if(info.up){
        uppick = info;

        if(appMode == "annotation" && labelNode != null){
            labelNode = null;
        }

        if(appMode === "testPick" && info.mouseGlobalPosition != null){
            var sceneNode = new RD.SceneNode();
            sceneNode.mesh = "sphere";
            sceneNode.position = info.mouseGlobalPosition;
            sceneNode.color = [1, 1, 0];

            volumetrics.addSceneNode(sceneNode);
        }
    }
}
volumetrics.renderer.meshes["sphere"] = GL.Mesh.sphere({radius:5});


///////////////////////////////////////////////////////////////////////////////////////////////
// Shaders
///////////////////////////////////////////////////////////////////////////////////////////////

var shaderDefault = document.getElementById("shaderDefault");
var onShaderDefault = function(event){
    volumetrics.shader = "volumetric_default";
}
shaderDefault.addEventListener("click", onShaderDefault, false);

var shaderXRAY = document.getElementById("shaderXRAY");
var onShaderXRAY = function(event){
    volumetrics.shader = "volumetric_xray";
}
shaderXRAY.addEventListener("click", onShaderXRAY, false);

var shaderMIP = document.getElementById("shaderMIP");
var onShaderMIP = function(event){
    volumetrics.shader = "volumetric_mip";
}
shaderMIP.addEventListener("click", onShaderMIP, false);

var shaderPicking = document.getElementById("shaderPicking");
var onShaderPicking = function(event){
    volumetrics.shader = "volumetric_picking";
}
shaderPicking.addEventListener("click", onShaderPicking, false);

///////////////////////////////////////////////////////////////////////////////////////////////
// Cutting Plane
///////////////////////////////////////////////////////////////////////////////////////////////

var cuttingONInput = document.getElementById("cuttingON");
var onCuttingONOFF = function(event){
    volumetrics.cuttingPlaneActive = cuttingONInput.checked;
}
cuttingONInput.addEventListener("click", onCuttingONOFF, false);

var cuttingSliderInput = document.getElementById("cuttingSlider");
var onCuttingSlider = function(event){
    volumetrics.cuttingPlaneZ = cuttingSliderInput.value;
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
            volumes.push(v);
        }

        var volume = response.volume;
        volumetrics.addVolume(volume, "importvol");

        var node = importVolumeNode;
        node.volume = "importvol";
        node.tf = "mytf";
        volumetrics.addVolumeNode(node);

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
var mathVolume = null;
var mathNode = null;
var mathFunc = null;
var mathCode = null;
var mathScope = null;
var mathWidth = 1;
var mathHeight = 1;
var mathDepth = 1;
var mathBytes = 1;
var mathTotalBytes = 1;
var mathBuffer = null;
var mathView = null;

var mathInit = function(){
    mathVolume = null;
    mathNode = new VolumeNode();
    mathFunc = "x+y+z";
    mathScope = null;
    mathCode = null;
    mathWidth = 1;
    mathHeight = 1;
    mathDepth = 1;
    mathBytes = 1;
    mathTotalBytes = 1;
    mathBuffer = null;
    mathView = null;

    mathSetDimensions(128, 128, 128, 1);

    mathNode.volume = "mathVolume";
    mathNode.tf = "mytf";
    mathNode.hide();
    volumetrics.addVolumeNode(mathNode);

    mathFunc = "1 - (x^2 + y^2 + z^2)/3";
    mathFuncInput.value = mathFunc;
}

var mathSetDimensions = function(width, height, depth, bytes){
    var preBytes = mathTotalBytes;
    var totalbytes = width*height*depth*bytes;

    mathWidth = width;
    mathHeight = height;
    mathDepth = depth;
    mathBytes = bytes;
    mathTotalBytes = totalbytes;

    if(mathBuffer && preBytes == totalbytes) return;

    mathBuffer = new ArrayBuffer(totalbytes);
    if(bytes == 1){
        mathView = new Uint8Array(mathBuffer);
    }else if(bytes == 2){
        mathView = new Float32Array(mathBuffer);
    }else if(bytes == 4){
        mathView = new Float32Array(mathBuffer);
    }else{
        console.log("bytes value not valid in mathSetDimensions, it must be 1, 2 or 4.");
        mathBuffer = null;
        return;
    }

    mathVolume = Volume.create(width, height, depth, {voxelDepth: bytes*8}, mathBuffer);
    volumetrics.addVolume(mathVolume, "mathVolume");
}

var onMathONOFF = function(event){
    if(mathONInput.checked == false){
        mathNode.hide();
    }else{
        mathNode.show();
    }
}

var onMathFuncSet = function(event){
    mathFunc = mathFuncInput.value;
    mathCode = math.compile(mathFunc);
    mathScope = {x: 0, y: 0, z: 0, t: 0};

    mathComputeValues();
}

var mathComputeValues = function(){
    var s;
    if(mathBytes == 1){
        s = 255;
    }else if(mathBytes == 2){
        s = 1;
    }else if(mathBytes == 4){
        s = 1;
    }else{
        console.log("bytes value not valid in mathComputeValues, it must be 1, 2 or 4.");
        return;
    }

    var code = mathCode;
    var scope = mathScope;

    var w = mathWidth;
    var h = mathHeight;
    var d = mathDepth;

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
                mathView[i + j*w + k*w*h] = val;
            }
        }
    }

    mathVolume.uploadDataTexture();
}

mathInit();

mathONInput.addEventListener("click", onMathONOFF, false);
mathSetButton.addEventListener("click", onMathFuncSet, false);
