//////////////////////////////////////////////////////////////////////////
// Html elements
//////////////////////////////////////////////////////////////////////////

//Feedback
var feedbackdiv = document.getElementById("feedback-div");
var feedbackbar = document.getElementById("feedback-bar");
var feedbacktext = document.getElementById("feedback-text");

//Inputs
var folderInput = document.getElementById("folderInput");
var filesInput = document.getElementById("filesInput");

//////////////////////////////////////////////////////////////////////////
// Load Volumes from files
//////////////////////////////////////////////////////////////////////////

function onVolume(response){
    if(response.status == VolumeLoader.STARTING){
        feedbackdiv.className = "";
        feedbacktext.innerText = "Starting...";
    }else if(response.status == VolumeLoader.LOADINGFILES){
        feedbacktext.innerText = "Loading Files...";
        feedbackbar.style.width = "25%";
    }else if(response.status == VolumeLoader.PARSINGFILES){
        feedbacktext.innerText = "Parsing Volumes...";
        feedbackbar.style.width = "50%";
    }else if(response.status == VolumeLoader.CREATINGVOLUMES){
        feedbacktext.innerText = "Creating Volumes...";
        feedbackbar.style.width = "75%";
    }else if(response.status == VolumeLoader.DONE){
        feedbacktext.innerText = "Done. Downloading...";
        feedbackbar.style.width = "100%";
        for(var volume of response.volumes){
            volume.downloadVL();
        }

    }else if(response.status == VolumeLoader.ERROR){
        feedbacktext.innerText = "Error: " + response.explanation;
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
        var name = file.name;
        var ext = name.substring(name.lastIndexOf(".")+1);

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

folderInput.addEventListener("change", handleInput, false);
filesInput.addEventListener("change", handleInput, false);
