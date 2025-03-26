

const pMon = new ProgressMonitor(document.body, {
	itemsCount: 3,
	title: "Converting..."
});

main();


function main(){
	
	const canvasContainer = document.getElementById("canvasContainer");
	
	const parser = new GmlParser();
	const renderer = new Renderer(canvasContainer);
	
	const toolsContainer = document.getElementById("toolsContainer");
	const generateStlButton = document.getElementById("generateStlButton");
	const fileInput = document.getElementById("fileUpload");
	const fileInputLabel = document.getElementById("fileUploadButton");
	
	fileInput.onchange = function(e){
		e.preventDefault();
		
		fileInputLabel.style.display = "none";
		
		parser.loadFile(fileInput.files[0]).then(function(structure){
			pMon.postMessage("Rendering...").then(function(){
				renderer.drawBuildings(structure);
				pMon.postMessage("Done!", "success");
				pMon.finish(0, 500);
			});
			
			generateStlButton.onclick = function(){
				let stl = parser.generateStl(structure);
				
				let blob = new Blob([stl.buffer], {type: "model/stl"});
				let objectUrl = URL.createObjectURL(blob);
				
				let downloadLink = document.createElement("a");
				downloadLink.innerHTML = "Download STL";
				downloadLink.download = structure.filename+".stl";
				downloadLink.href = objectUrl;
				downloadLink.id = "downloadButton";
				
				generateStlButton.style.display = "none";
				toolsContainer.appendChild(downloadLink);
			};
			generateStlButton.style.display = "block";
		});
	}
}

function GmlParser(){
	
	function findNodesByName(nodeList, nodeName){
		/*
			Recursively find nodes by nodeName.
			This will not match elements nested within other matches.
			
			The reason why we're not using something like querySelectorAll() is that this is a **LOT** faster
		*/
		
		let foundElementsList = [];
		
		for(let node of nodeList){
			if(node.nodeName == nodeName){
				foundElementsList.push(node);
			} else {
				foundElementsList.push(...findNodesByName(node.children, nodeName));
			}
		}
		
		return foundElementsList;
	}
	
	async function loadFile(file){
		
		const reader = new FileReader();
		
		await pMon.start();
		await pMon.postMessage("Loading file from disk...");
		
		reader.addEventListener("progress", function(e){
			let progress = e.loaded/e.total;
			pMon.updateProgress(progress);
		});
		
		let readFile = new Promise((resolve, reject) => {
			reader.onload = function(){
				resolve(reader.result);
			};
			reader.onerror = function(e){
				pMon.postMessage("Couldn't load file.", "error");
				console.log(e);
				console.log(reader.error);
				reject(e);
			};
		});
		
		reader.readAsText(file);
		
		let loadedFile = await readFile;
		
		await pMon.updateProgress(1);
		await pMon.finishItem();
		
		return await parseGmlFile(file, loadedFile);
		
	}
	
	function parsePosList(posList){
		let resultArray = [];
		
		for(let p of posList){
			let positions = p.innerHTML;
			positions = positions.trim().replace(/\s+/, " ");
			positions = positions.split(" ");
			positions = positions.map(function(x){
				return parseFloat(x);
			});
			positions = new Float32Array(positions);
			if(positions.length != 12){
				console.error("Ring in building "+id+" is not a triangle. This is allowed in CityGML, but I expected SwissTopo to export their buildings using only triangles...")
			} else {
				positions = positions.slice(0, 9); // remove the last point, as it's the same as the first
				resultArray.push(positions);
			}
		}
		
		return resultArray;
	}
	
	async function parseXML(text){
		
		const url = URL.createObjectURL(new Blob([text], {'type': 'text/xml'}));
		let cleanup = () => { URL.revokeObjectURL(url); }
		
		return new Promise((accept, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('GET', url);
			xhr.overrideMimeType('text/xml');
			xhr.responseType = 'document';
		
			xhr.onload = () => {
				accept(xhr.responseXML);
			};
			
			xhr.onprogress = function(e){
				let progress = e.loaded/e.total;
				pMon.updateProgress(progress);
			};
			
			xhr.onabort = xhr.onerror = (e) => {
				pMon.postMessage("Couldn't parse xml.", "error");
				console.log(e);
				reject(e);
			};
			
			xhr.onloadend = cleanup;
			
			xhr.send(null);
		});
	}
	
	async function parseGmlFile(file, text){
		
		const filename = file.name.substring(0, file.name.length-4); // this assumes the name has a three-letter file extension, like .gml
		
		await pMon.postMessage("Parsing XML...");
		
		const doc = await parseXML(text);
		
		//const parser = new DOMParser();
		//const doc = await parser.parseFromString(text, "text/xml");
		
		await pMon.updateProgress(1);
		await pMon.finishItem();
		
		await pMon.postMessage("Finding buildings...");
		
		let buildings = findNodesByName(doc.documentElement.children, "bldg:Building");
		
		await pMon.postMessage("Finding metadata...");
		
		console.log("Found "+buildings.length+" buildings.");
		
		let structure = {
			filename: filename,
			buildings: [],
		};
		
		let lowerCorner = "";
		let upperCorner = "";
		
		for(let el of doc.documentElement.children){
			if(el.nodeName == "gml:boundedBy"){
				lowerCorner = findNodesByName(el.children, "gml:lowerCorner")[0].innerHTML;
				upperCorner = findNodesByName(el.children, "gml:upperCorner")[0].innerHTML;
				
				break;
			}
		}
		
		lowerCorner = lowerCorner.trim().replace(/\s+/, " ");
		lowerCorner = lowerCorner.split(" ");
		lowerCorner = lowerCorner.map(function(x){
			return parseFloat(x);
		});
		
		upperCorner = upperCorner.trim().replace(/\s+/, " ");
		upperCorner = upperCorner.split(" ");
		upperCorner = upperCorner.map(function(x){
			return parseFloat(x);
		});
		
		let spans = [
			upperCorner[0] - lowerCorner[0],
			upperCorner[1] - lowerCorner[1],
			upperCorner[2] - lowerCorner[2]
		];
		
		structure.lowerCorner = lowerCorner;
		structure.upperCorner = upperCorner;
		structure.spans = spans;
		
		let buildingsWithoutEgid = 0;
		
		await pMon.postMessage("Processing buildings...", "info", buildings.length);
		
		let buildingsProcessed = 0;
		
		for(let b in buildings){
			
			let building = buildings[b];
			
			let children = Array.from(building.children);
			
			let buildingItem = {
				id: null,
				roofTriangles: [],
				wallTriangles: [],
				groundTriangles: []
			};
			
			
			let gmlId = building.attributes["gml:id"].value;
			
			let egidEl = children.find(function(x){
				try {
					return(x.attributes.name.value == "EGID");
				} catch {}
			});
			let id = null;
			if(egidEl && egidEl.firstElementChild){
				id = "EGID_"+egidEl.firstElementChild.innerHTML;
			} else {
				id = "building_without_egid_"+buildingsWithoutEgid;
				buildingsWithoutEgid++;
			}
			
			buildingItem.id = id;
			
			//console.log("Processing building "+id+"...");
			
			let roofs = children.filter(function(x){
				return (x.nodeName == "bldg:boundedBy" && x.firstElementChild && x.firstElementChild.nodeName == "bldg:RoofSurface");
			});
			for(let roof of roofs){
				let posLists = findNodesByName(roof.children, "gml:posList");
				buildingItem.roofTriangles.push(...parsePosList(posLists));
			}
			
			
			let walls = children.filter(function(x){
				return (x.nodeName == "bldg:boundedBy" && x.firstElementChild && x.firstElementChild.nodeName == "bldg:WallSurface");
			});
			for(let wall of walls){
				let posLists = findNodesByName(wall.children, "gml:posList");
				buildingItem.wallTriangles.push(...parsePosList(posLists));
			}
			
			
			let grounds = children.filter(function(x){
				return (x.nodeName == "bldg:boundedBy" && x.firstElementChild && x.firstElementChild.nodeName == "bldg:GroundSurface");
			});
			for(let ground of grounds){
				let posLists = findNodesByName(ground.children, "gml:posList");
				buildingItem.groundTriangles.push(...parsePosList(posLists));
			}
			
			structure.buildings.push(buildingItem);
			
			buildingsProcessed++;
			await pMon.updateCount(buildingsProcessed);
			
		}
		
		return structure;
	}
	
	function generateStl(structure){
		let triangles = [];
		
		for(let building of structure.buildings){
			triangles.push(...building.roofTriangles);
			triangles.push(...building.wallTriangles);
			triangles.push(...building.groundTriangles);
		}
		
		let scale = Math.max(structure.spans[0], structure.spans[1], structure.spans[2]);
		console.log("Scale: 1/"+scale);
		scale = 1/scale;
		
		
		for(let t in triangles){
			for(let i = 0; i < triangles[t].length; i+=3){
				triangles[t][i+0] = (triangles[t][i+0] - structure.lowerCorner[0])*scale;
				triangles[t][i+1] = (triangles[t][i+1] - structure.lowerCorner[1])*scale;
				triangles[t][i+2] = (triangles[t][i+2] - structure.lowerCorner[2])*scale;
			}
		}
		
		const numTriangles = triangles.length;
		const sizeBytes = 84+(numTriangles*50);
		const buffer = new ArrayBuffer(sizeBytes);
		const view = new DataView(buffer);
		
		for(let i = 0; i < 80; i++){
			view.setUint8(i, 0);
		}
		view.setUint32(80, numTriangles, true);
		
		let text = structure.filename;
		let utf8Encode = new TextEncoder();
		let textArray = utf8Encode.encode(text);
		for(let i in textArray){
			view.setUint8(i, textArray[i]);
			if(i == 79){
				break;
			}
		}
		
		let byteOffset = 84;
		
		for(let i = 0; i < triangles.length; i++){
			
			// Normal vector
			view.setFloat32(byteOffset+0, 0);
			view.setFloat32(byteOffset+4, 0);
			view.setFloat32(byteOffset+8, 0);
			byteOffset += 12;
			
			// Point 0
			view.setFloat32(byteOffset+0, triangles[i][0], true);
			view.setFloat32(byteOffset+4, triangles[i][1], true);
			view.setFloat32(byteOffset+8, triangles[i][2], true);
			byteOffset += 12;
			
			// Point 1
			view.setFloat32(byteOffset+0, triangles[i][3], true);
			view.setFloat32(byteOffset+4, triangles[i][4], true);
			view.setFloat32(byteOffset+8, triangles[i][5], true);
			byteOffset += 12;
			
			// Point 2
			view.setFloat32(byteOffset+0, triangles[i][6], true);
			view.setFloat32(byteOffset+4, triangles[i][7], true);
			view.setFloat32(byteOffset+8, triangles[i][8], true);
			byteOffset += 12;
			
			// Attribute byte count (always 0)
			view.setUint16(byteOffset, 0);
			byteOffset += 2;
			
		}
		
		console.log("byteOffset: "+byteOffset);
		console.log("calculated: "+numTriangles+" Triangles, "+sizeBytes+" Bytes");
		
		return view;
		
	}
	
	return {
		loadFile: loadFile,
		parseGmlFile: parseGmlFile,
		generateStl: generateStl,
	};
}

function Renderer(canvasContainer){
	
	let canvas = document.createElement("canvas");
	canvas.id = "renderCanvas";
	canvas.width = canvasContainer.getBoundingClientRect().width;
	canvas.height = canvasContainer.getBoundingClientRect().height;
	canvasContainer.appendChild(canvas);
	
	let context = canvas.getContext("2d");
	
	let smallerSize = Math.min(canvas.width, canvas.height);
	
	context.fillStyle = "#0f0";
	
	
	function drawBuildings(structure){
		
		let scale = Math.min(canvas.width/structure.spans[0], canvas.height/structure.spans[1]);
		
		let drawingHeight = structure.spans[1]*scale;
		
		let drawPositions = new Float32Array(9);
		
		for(let building of structure.buildings){
			for(let triangle of building.groundTriangles){
				
				for(i = 0; i < triangle.length; i+= 3){
					drawPositions[i  ] = (triangle[i  ] - structure.lowerCorner[0])*scale;
					drawPositions[i+1] = drawingHeight-(triangle[i+1] - structure.lowerCorner[1])*scale;
					drawPositions[i+2] = triangle[i+2];
				}
				
				context.beginPath();
				context.moveTo(drawPositions[0], drawPositions[1]);
				context.lineTo(drawPositions[3], drawPositions[4]);
				context.lineTo(drawPositions[6], drawPositions[7]);
				context.closePath();
				context.fill();
				
			}
		}
		
	}
	
	return {
		drawBuildings: drawBuildings
	};
}
