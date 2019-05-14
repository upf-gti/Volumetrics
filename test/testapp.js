///////////////////////////////////////////////////////////////////////////////////////////////
// DATA
///////////////////////////////////////////////////////////////////////////////////////////////
var app = {
    dicom: null,
    image: null,

    volumetrics: null,
    tfeditor: null,
};

function init(){
    //var canvas = document.getElementById("mycanvas");
	//app.volumetrics = new Volumetrics({canvas: canvas, visible: false, background: [0.3,0.3,0.3,1]});

    var container = document.getElementById("volumetrics");
    app.volumetrics = new Volumetrics({container: container, visible: true, background: [0.3,0.3,0.3,1]});

	var tf = new TransferFunction();
    var tfecontainer = document.getElementById("tfeditor");
    app.tfeditor = new TFEditor({container: tfecontainer, visible: true});
	app.tfeditor.setTF(tf);

    app.volumetrics.addTransferFunction(tf, "mytf");
}

init();


///////////////////////////////////////////////////////////////////////////////////////////////
// Load 3dTexture
///////////////////////////////////////////////////////////////////////////////////////////////
function onDicomImage(image){
    app.image = image;
    var vol = Volume.create(image.width, image.height, image.depth, {widthSpacing: image.widthSpacing, heightSpacing: image.heightSpacing, depthSpacing: image.depthSpacing}, image.imageData);
    app.volumetrics.addVolume(vol, "myvol");
    var node = new VolumeNode();
    node.volume = "myvol";
    node.tf = "mytf";

    node.steps = 1000;
    node.stepSize = 1;

    app.volumetrics.addVolumeNode(node);

    app.tfeditor.histogramBuffer = vol.getHistogram();
    app.tfeditor.render();
};

///////////////////////////////////////////////////////////////////////////////////////////////
// Import Dicom and load 3dTexture
///////////////////////////////////////////////////////////////////////////////////////////////

function onDicomLoaded(dicom){
    app.dicom = dicom;
    DL.texture3d(dicom, onDicomImage);
};

function handleFolderInput(event){
    var files = event.target.files;

    if(files.length > 0)
        DL.load(files, onDicomLoaded);
};

var folderInput = document.getElementById("folderInput");
folderInput.addEventListener("change", handleFolderInput, false);

///////////////////////////////////////////////////////////////////////////////////////////////
// Import custom .dl file
///////////////////////////////////////////////////////////////////////////////////////////////

function handleDLInput(event){
    var file = event.target.files[0];
    if(file)
        DL.loadTextureFile(file, onDicomImage);
};

var imageInput = document.getElementById("imageInput");
imageInput.addEventListener("change", handleDLInput, false);
