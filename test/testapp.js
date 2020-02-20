///////////////////////////////////////////////////////////////////////////////////////////////
// MAIN
///////////////////////////////////////////////////////////////////////////////////////////////

var volumetrics = null;
var tfeditor = null;
var volumes = [];
var appMode = "none";
var tf = null;

function init(){
    var container = document.getElementById("volumetrics");
    volumetrics = new Volumetrics({container: container, visible: true, background: [0.9,0.9,0.9,1]});

	tf = new TransferFunction();
    onPreset1();

    var tfecontainer = document.getElementById("tfeditor");
    tfeditor = new TFEditor({container: tfecontainer, visible: true});
	tfeditor.setTF(tf);

    volumetrics.addTransferFunction(tf, "mytf");

    volumetrics.setPickPositionCallback(onPicking);

    volumetrics.activeMode = Volumetrics.MODES.CAMERAORBIT;
}
init();

var urlpart = window.location.href.split("/");
var url = "";
for(var i=0; i<urlpart.length-1; i++){
    url += urlpart[i] + "/";
}
var vlurl = url + "texture3d.vl";
//downloadVL(vlurl);

var toolCameraPan = document.getElementById("toolCameraPan");
var toolCameraZoom = document.getElementById("toolCameraZoom");
var toolCameraOrbit = document.getElementById("toolCameraOrbit");
var toolCameraRotate = document.getElementById("toolCameraRotate");
var toolCameraReset = document.getElementById("toolCameraReset");
var toolTestPicking = document.getElementById("toolTestPicking");
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


var preset1 = document.getElementById("preset1");
var preset2 = document.getElementById("preset2");
var preset3 = document.getElementById("preset3");

preset1.addEventListener("click", onPreset1, false);
preset2.addEventListener("click", onPreset2, false);
preset3.addEventListener("click", onPreset3, false);

function onPreset1(){
    tf.fromPoints([{"x":0.15885416666666666,"r":1,"g":1,"b":1,"a":0},{"x":0.2109375,"r":1,"g":1,"b":1,"a":0.2},{"x":0.2578125,"r":1,"g":0.548,"b":0,"a":0.3},{"x":0.8463541666666666,"r":1,"g":0,"b":0,"a":0.5},{"x":0.8854166666666666,"r":0,"g":0,"b":0,"a":0}]);
}

function onPreset2(){
    tf.fromPoints([{x:0.3,r:0,g:1,b:0,a:0.1}, {x:1,r:0,g:0,b:1,a:1}]);
}

function onPreset3(){
    tf.fromPoints([{x:0.45,r:0,g:0,b:0,a:0}, {x:0.5,r:1,g:0,b:0,a:1}, {x:0.55,r:0,g:0,b:0,a:0}]);
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
/*
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
*/
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
    var plane = volumetrics.cuttingPlane;
    plane[3] = cuttingSliderInput.value;
    volumetrics.cuttingPlane = plane;
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

function downloadVL(vlurl){
    vlurl = vlurl || "https://webglstudio.org/users/mfloriach/volumetrics/demo/texture3d.vl";
    console.log("Downloading VL from " + vlurl + "...");
    fetch(vlurl)
        .then(function(response) {
            return response.arrayBuffer();
        })
        .then(function(buffer) {
            console.log("Example downloaded.");
            VolumeLoader.parseVLBuffers([buffer], onVolume, onVolume);
        });
};

function handleVLExample(event){
    downloadVL();
}
var vlExampleButton = document.getElementById("vlExample");
vlExampleButton.addEventListener("click", handleVLExample);

///////////////////////////////////////////////////////////////////////////////////////////////
// Math
///////////////////////////////////////////////////////////////////////////////////////////////
/*
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
*/
