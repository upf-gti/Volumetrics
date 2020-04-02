"use strict"

/***
 * TF-WIDGET.js
 * Visual interactive editor for transfer functions
 ***/

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
	this._canvas_margin = 10;

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
		channel: [false, false, false, false]
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

	var channels = ["r", "g", "b", "a"];
	for(var c in channels){
		var d = document.createElement("div");
		d.style.display = "inline";
		
		var text = document.createElement("span");
		text.id = "TFEditor_text_"+c;
		text.innerText = channels[c];
		text.style["font-family"] = "Courier New";
		text.style["font-size"] = "12px";
		text.style.margin = "0";

		var checkbox = document.createElement("input");
		checkbox.id = "TFEditor_checkbox_"+c;
		checkbox.type = "checkbox";
		checkbox.style.margin = "0 6px 0 2px";

		d.appendChild(text);
		d.appendChild(checkbox);
		div.appendChild(d);

		//Set listeners
		checkbox.addEventListener("click", this._onCheckbox.bind(this));
	}
	this.container.appendChild(div);

	this.setSize();
}

TFEditor.prototype._onResize = function(event){
	this.setSize();
}

TFEditor.prototype._onCheckbox = function(event){
	var c = parseInt( event.target.id[event.target.id.length-1] );
	this.state.channel[c] = event.target.checked;

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
	if(this.state.dragging){
		//change values
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
			var v = Math.round(ly + f*(ry-ly));
			for(var c in this.state.channel){
				if(this.state.channel[c])
					transfer_function[i*4+parseInt(c)] = v;
			}
			
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
