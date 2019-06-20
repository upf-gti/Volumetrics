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
}
init();

///////////////////////////////////////////////////////////////////////////////////////////////
// Tests
///////////////////////////////////////////////////////////////////////////////////////////////

function testPicking(event){
    if(!testPicking) return;

    var pickPos = app.volumetrics.pickPosition(event.layerX, app.volumetrics.context.canvas.height-event.layerY);
    if(pickPos == null) return; //no pick
    var sceneNode = new RD.SceneNode();
    sceneNode.mesh = "sphere";
    sceneNode.position = pickPos;
    //sceneNode.shader = "debug_surface_depth"
    sceneNode.color = [1, 1, 0];

    app.volumetrics.scene._root.addChild(sceneNode);
}
/* Enable test picking */
//app.volumetrics.context.canvas.addEventListener("mouseup", testPicking);
app.volumetrics.renderer.meshes["sphere"] = GL.Mesh.sphere({radius:5});

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


///////////////////////////////////////////////////////////////////////////////////////////////
// Import Volumes from files
///////////////////////////////////////////////////////////////////////////////////////////////

function onVolume(response){
    if(response.status == VolumeLoader.DONE){
        console.log("Volume loaded.");

        for(var v of response.volumes){
            app.volumes.push(v);
        }

        var volume = response.volume;
        app.volumetrics.addVolume(volume, "myvol");

        var node = new VolumeNode();
        node.volume = "myvol";
        node.tf = "mytf";
        app.volumetrics.addVolumeNode(node, "myvolnode");

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
