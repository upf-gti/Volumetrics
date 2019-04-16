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
	var container = document.getElementById("volumetrics");
	app.volumetrics = new Volumetrics({container: container});
	app.volumetrics.animate();

	var tf = new TransferFunction();
    var tfecontainer = document.getElementById("tfeditor");
    app.tfeditor = new TFEditor({container: tfecontainer});
	app.tfeditor.tf = tf;
    app.tfeditor.render();

    var d = 8;
    var dd = d*d;
    var buffer = new ArrayBuffer(d*d*d);
    var view = new Uint8Array(buffer);
    for(var i=0; i<d; i++){
        for(var j=0; j<d; j++){
            for(var k=0; k<d; k++){
                view[i + j*d + k*dd] = 4 * i * j * k;
            }
        }
    }
    app.volumetrics.addTransferFunction(tf, "mytf")

    var vol = Volume.create(d, d, d, {}, buffer);
    app.volumetrics.addVolume(vol, "test");

    var node = new VolumeNode();
    node.volume = "test";
    node.tf = "mytf";
    app.volumetrics.addVolumeNode(node);

    
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
