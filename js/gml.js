

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
	const generateButton = document.getElementById("generateButton");
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
			
			generateButton.onclick = function(){
				
				let outputFormat = document.getElementById("settingsForm").elements["output-format"].value;
				
				let outputBlob;
				let extension = "";
				let filetypeName = "";
				
				console.log(outputFormat);
				
				if(outputFormat == "output-format-stl"){
					outputBlob = parser.generateStl(structure);
					extension = ".stl";
					filetypeName = "STL";
				} else if(outputFormat == "output-format-gltf"){
					outputBlob = parser.generateGlb(structure);
					extension = ".glb";
					filetypeName = "glTF";
				}
				
				let objectUrl = URL.createObjectURL(outputBlob);
				
				let downloadLink = document.createElement("a");
				downloadLink.innerHTML = "Download "+filetypeName;
				downloadLink.download = structure.filename+extension;
				downloadLink.href = objectUrl;
				downloadLink.id = "downloadButton";
				
				generateButton.style.display = "none";
				toolsContainer.appendChild(downloadLink);
			};
			generateButton.style.display = "block";
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
		
		document.getElementById("info-inputFileName").innerHTML = file.name;
		
		const k = 1024;
		const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
		const decimal = 2;
		const n = Math.floor(Math.log(file.size) / Math.log(k));
		const fileSize = parseFloat((file.size / Math.pow(k, n)).toFixed(decimal))+" "+sizes[n];
		
		document.getElementById("info-inputFileSize").innerHTML = fileSize;
		
		document.getElementById("info-buildingCount").innerHTML = structure.buildings.length;
		
		const triangleCount = structure.buildings.reduce(function(accumulator, building){
			return accumulator + building.roofTriangles.length + building.wallTriangles.length + building.groundTriangles.length;
		}, 0);
		
		document.getElementById("info-triangleCount").innerHTML = triangleCount;
		
		document.getElementById("info-bbox-x").innerHTML = structure.lowerCorner[0] + "<br>" + structure.upperCorner[0];
		document.getElementById("info-bbox-y").innerHTML = structure.lowerCorner[1] + "<br>" + structure.upperCorner[1];
		document.getElementById("info-bbox-z").innerHTML = structure.lowerCorner[2] + "<br>" + structure.upperCorner[2];
		
		document.getElementById("info-span-x").innerHTML = Math.round(structure.spans[0]*100)/100 + " m";
		document.getElementById("info-span-y").innerHTML = Math.round(structure.spans[1]*100)/100 + " m";
		document.getElementById("info-span-z").innerHTML = Math.round(structure.spans[2]*100)/100 + " m";
		
		
		return structure;
	}
	
	function generateGlb(structure){
		
		const includeRoofs = document.getElementById("output-include-roofs").checked;
		const includeWalls = document.getElementById("output-include-walls").checked;
		const includeGround = document.getElementById("output-include-ground").checked;
		
		const transformSettings = document.getElementById("settingsForm").elements["output-coords"].value;
		
		let scale = 1;
		if(transformSettings == "output-coords-unit"){
			scale = Math.max(structure.spans[0], structure.spans[1], structure.spans[2]);
			console.log("Scale: 1:"+scale);
			scale = 1/scale;
		} else {
			console.log("Scale: 1:1");
		}
		
		let translate = {
			x: 0,
			y: 0,
			z: 0,
		};
		
		if( transformSettings == "output-coords-unit"){
			translate.x = 0-structure.lowerCorner[0];
			translate.y = 0-structure.lowerCorner[1];
			translate.z = 0-structure.lowerCorner[2];
		} else if( transformSettings == "output-coords-to-origin"){
			translate.x = 0-structure.lowerCorner[0];
			translate.y = 0-structure.lowerCorner[1];
		} else if( transformSettings == "output-coords-to-nearest-km"){
			translate.x = 0-Math.round(structure.lowerCorner[0]/1000)*1000;
			translate.y = 0-Math.round(structure.lowerCorner[1]/1000)*1000;
		}
		
		console.log("Translating by "+translate.x+", "+translate.y+", "+translate.z);
		
		
		
		const glb = {
			asset: {
				generator: "CityGML converter by Roland Rytz",
				version: "2.0",
			},
			scene: 0,
			scenes:[
				{
					name: structure.filename,
					nodes: [],
				},
			],
			nodes: [],
			materials: [],
			meshes: [],
			accessors: [],
			bufferViews: [],
			buffers: [],
		};

		let roofMaterialIndex = 0;
		const roofMaterial = {
			name: "roof",
			doubleSided: true,
			pbrMetallicRoughness: {
				baseColorFactor: [0.7, 0.42, 0.29, 1],
				metallicFactor: 0,
				roughnessFactor: 0.9
			},
		};
		let wallMaterialIndex = 0;
		const wallMaterial = {
			name: "wall",
			doubleSided: true,
			pbrMetallicRoughness: {
				baseColorFactor: [0.91, 0.88, 0.81, 1],
				metallicFactor: 0,
				roughnessFactor: 0.9
			},
		};
		let groundMaterialIndex = 0;
		const groundMaterial = {
			name: "ground",
			doubleSided: true,
			pbrMetallicRoughness: {
				baseColorFactor: [0.42, 0.61, 0.16, 1],
				metallicFactor: 0,
				roughnessFactor: 0.9
			},
		};
		
		if(includeRoofs){
			roofMaterialIndex = glb.materials.length;
			glb.materials.push(roofMaterial);
		}
		if(includeWalls){
			wallMaterialIndex = glb.materials.length;
			glb.materials.push(wallMaterial);
		}
		if(includeGround){
			groundMaterialIndex = glb.materials.length;
			glb.materials.push(groundMaterial);
		}
		
		let rootNode = {
			name: structure.filename,
			children: [],
		};
		
		glb.scenes[glb.scene].nodes.push(glb.nodes.length);
		glb.nodes.push(rootNode);
		
		let offset = 0;
		let dataArrays = [];
		
		for(let b in structure.buildings){
			
			let building = structure.buildings[b];
			
			let node = {
				name: building.id,
				children: [],
			};
			
			let buildingNodeId = glb.nodes.length;
			glb.nodes.push(node);
			rootNode.children.push(buildingNodeId);
			
			if(includeRoofs && building.roofTriangles.length > 0){
				let meshResult = addMesh(glb, building.roofTriangles, offset, "roof_"+building.id, roofMaterialIndex, translate, scale);
				
				offset = meshResult.offset;
				dataArrays.push(...meshResult.dataArrays);
				
				let node = {
					name: "roof_"+building.id,
					mesh: meshResult.meshIndex,
				};
				glb.nodes.push(node);
				glb.nodes[buildingNodeId].children.push(glb.nodes.length-1);
			}
			
			if(includeWalls && building.wallTriangles.length > 0){
				let meshResult = addMesh(glb, building.wallTriangles, offset, "wall_"+building.id, wallMaterialIndex, translate, scale);
				
				offset = meshResult.offset;
				dataArrays.push(...meshResult.dataArrays);
				
				let node = {
					name: "wall_"+building.id,
					mesh: meshResult.meshIndex,
				};
				glb.nodes.push(node);
				glb.nodes[buildingNodeId].children.push(glb.nodes.length-1);
			}
			
			if(includeGround && building.groundTriangles.length > 0){
				let meshResult = addMesh(glb, building.groundTriangles, offset, "ground_"+building.id, groundMaterialIndex, translate, scale);
				
				offset = meshResult.offset;
				dataArrays.push(...meshResult.dataArrays);
				
				let node = {
					name: "ground_"+building.id,
					mesh: meshResult.meshIndex,
				};
				glb.nodes.push(node);
				glb.nodes[buildingNodeId].children.push(glb.nodes.length-1);
			}
			
		}
		
		let bufferLength = offset;
		
		glb.buffers[0] = {
			byteLength: bufferLength
		};
		
		/*======== create buffer ========*/
		
		let jsonString = JSON.stringify(glb);
		
		const encoder = new TextEncoder();
		let encodedText = encoder.encode(jsonString);
		
		if(encodedText.byteLength%4 !== 0){
			// the gltf standard wants the length of a every chunk to be a multiple of 4 bytes.
			// let's add spaces to the json string to comply with that.
			
			let missingSpaces = 4-encodedText.byteLength%4;
			let spaces = " ".repeat(missingSpaces);
			jsonString += spaces;
			encodedText = encoder.encode(jsonString);
		}
		
		let fileLength = 12 + 8 + encodedText.length + 8 + bufferLength;
		
		let fileHeader = new Uint32Array(3);
		fileHeader[0] = 0x46546C67;
		fileHeader[1] = 2;
		fileHeader[2] = fileLength;
		
		let jsonHeader = new Uint32Array(2);
		jsonHeader[0] = encodedText.length;
		jsonHeader[1] = 0x4E4F534A;
		
		let bufferHeader = new Uint32Array(2);
		bufferHeader[0] = bufferLength;
		bufferHeader[1] = 0x004E4942;
		
		let fileBlob = new Blob([
			fileHeader,
			jsonHeader,
			encodedText,
			bufferHeader,
			...dataArrays
		], {type: "model/glb"});
		
		console.log(glb);
		
		return(fileBlob);
		
	}
	
	function createBuffersFromTriangles(triangles, translate, scale){
		let indices = [];
		let positions = [];
		let normals = [];
		
		let max = [
			-Infinity,
			-Infinity,
			-Infinity,
		];
		
		let min = [
			Infinity,
			Infinity,
			Infinity,
		];
		
		for(let i in triangles){
			let triangle = triangles[i];
			
			for(let i = 0; i < triangle.length; i+=3){
				let x = (triangle[i+0] + translate.x)*scale;
				let y = (triangle[i+1] + translate.y)*scale;
				let z = (triangle[i+2] + translate.z)*scale;
				
				triangle[i+0] = x;
				triangle[i+1] = z;
				triangle[i+2] = -y;
			}
			
			let normal = calculateNormalFromTriangle(triangle); // TODO: point normals the other way
			
			if(normal[0] == 0 && normal[1] == 0 && normal[2] == 0){
				// degenerate triangle, skip
				console.log("discarded degenerate triangle");
			} else {
				
				for(let i = 0; i < triangle.length; i+=3){
					max[0] = Math.max(max[0], triangle[i+0]);
					max[1] = Math.max(max[1], triangle[i+1]);
					max[2] = Math.max(max[2], triangle[i+2]);
					
					min[0] = Math.min(min[0], triangle[i+0]);
					min[1] = Math.min(min[1], triangle[i+1]);
					min[2] = Math.min(min[2], triangle[i+2]);
				}
				
				indices.push(positions.length/3, positions.length/3+1, positions.length/3+2);
				positions.push(...triangle);
				normals.push(
					normal[0], normal[1], normal[2],
					normal[0], normal[1], normal[2],
					normal[0], normal[1], normal[2],
				);
			
			}
		}
		
		indices = new Uint16Array(indices);
		positions = new Float32Array(positions);
		normals = new Float32Array(normals);
		
		return {
			indices: indices,
			positions: positions,
			normals: normals,
			max: max,
			min: min,
		};
	}
	
	function addMesh(glb, triangles, offset, name, materialIndex, translate, scale){
		
		let buffers = createBuffersFromTriangles(triangles, translate, scale);
		
		//console.log(buffers.indices.length, buffers.positions.length, buffers.normals.length);
		
		let outMesh = {
			name: name,
			primitives: [],
		};
			
		outMesh.primitives[0] = {
			attributes: {},
		};
		
		let dataArrays = [];
		let buf;
		
		/*======== indices ========*/
		buf = buffers.indices;
		dataArrays.push(buf);
		
		glb.bufferViews.push({
			buffer: 0,
			byteLength: buf.byteLength,
			byteOffset: offset,
			target: 34963 // indices (ELEMENT_ARRAY_BUFFER)
		});
		offset += buf.byteLength;
		if(offset%4 !== 0){
			// the gltf standard wants every bufferView offset to be a multiple of 4 bytes.
			// let's add empty bytes between dataArrays to comply with that.
			dataArrays.push(new Uint8Array(4-offset%4));
			offset += 4-offset%4;
		}
		
		glb.accessors.push({
			bufferView: glb.bufferViews.length-1,
			byteOffset: 0,
			type: "SCALAR",
			componentType: 5123, // 5123 = Uint16
			count: buf.length
		});
		outMesh.primitives[0].indices = glb.accessors.length-1;
		
		/*======== positions ========*/
		buf = buffers.positions;
		dataArrays.push(buf);
		
		glb.bufferViews.push({
			buffer: 0,
			byteLength: buf.byteLength,
			byteOffset: offset,
			target: 34962 // positions (ARRAY_BUFFER)
		});
		offset += buf.byteLength;
		if(offset%4 !== 0){
			// the gltf standard wants every bufferView offset to be a multiple of 4 bytes.
			// let's add empty bytes between dataArrays to comply with that.
			dataArrays.push(new Uint8Array(4-offset%4));
			offset += 4-offset%4;
		}
		
		glb.accessors.push({
			bufferView: glb.bufferViews.length-1,
			byteOffset: 0,
			type: "VEC3",
			componentType: 5126,
			count: buf.length/3,
			min: buffers.min,
			max: buffers.max
		});
		outMesh.primitives[0].attributes.POSITION = glb.accessors.length-1;
		
		/*======== normals ========*/
		buf = buffers.normals;
		dataArrays.push(buf);
		
		glb.bufferViews.push({
			buffer: 0,
			byteLength: buf.byteLength,
			byteOffset: offset,
			target: 34962 // positions (ARRAY_BUFFER)
		});
		offset += buf.byteLength;
		if(offset%4 !== 0){
			// the gltf standard wants every bufferView offset to be a multiple of 4 bytes.
			// let's add empty bytes between dataArrays to comply with that.
			dataArrays.push(new Uint8Array(4-offset%4));
			offset += 4-offset%4;
		}
		
		glb.accessors.push({
			bufferView: glb.bufferViews.length-1,
			byteOffset: 0,
			type: "VEC3",
			componentType: 5126,
			count: buf.length/3
		});
		outMesh.primitives[0].attributes.NORMAL = glb.accessors.length-1;
		
		outMesh.primitives[0].material = materialIndex;
		
		glb.meshes.push(outMesh);
		
		return {
			meshIndex: glb.meshes.length-1,
			dataArrays: dataArrays,
			offset: offset,
		};
		
		
	}
	
	function generateStl(structure){
		let triangles = [];
		
		for(let building of structure.buildings){
			triangles.push(...building.roofTriangles);
			triangles.push(...building.wallTriangles);
			triangles.push(...building.groundTriangles);
		}
		
		// output-coords-keep
		// output-coords-unit
		// output-coords-to-origin
		// output-coords-to-nearest-km
		let transformSettings = document.getElementById("settingsForm").elements["output-coords"].value;
		
		let scale = 1;
		if(transformSettings == "output-coords-unit"){
			scale = Math.max(structure.spans[0], structure.spans[1], structure.spans[2]);
			console.log("Scale: 1:"+scale);
			scale = 1/scale;
		} else {
			console.log("Scale: 1:1");
		}
		
		let translateX = 0;
		let translateY = 0;
		let translateZ = 0;
		
		if( transformSettings == "output-coords-unit"){
			translateX = 0-structure.lowerCorner[0];
			translateY = 0-structure.lowerCorner[1];
			translateZ = 0-structure.lowerCorner[2];
		} else if( transformSettings == "output-coords-to-origin"){
			translateX = 0-structure.lowerCorner[0];
			translateY = 0-structure.lowerCorner[1];
		} else if( transformSettings == "output-coords-to-nearest-km"){
			translateX = 0-Math.round(structure.lowerCorner[0]/1000)*1000;
			translateY = 0-Math.round(structure.lowerCorner[1]/1000)*1000;
			
			console.log("Translating by "+translateX+", "+translateY);
		}
		
		
		for(let t in triangles){
			for(let i = 0; i < triangles[t].length; i+=3){
				triangles[t][i+0] = (triangles[t][i+0] + translateX)*scale;
				triangles[t][i+1] = (triangles[t][i+1] + translateY)*scale;
				triangles[t][i+2] = (triangles[t][i+2] + translateZ)*scale;
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
		
		let blob = new Blob([view.buffer], {type: "model/stl"});
		
		return blob;
		
	}
	
	return {
		loadFile: loadFile,
		parseGmlFile: parseGmlFile,
		generateStl: generateStl,
		generateGlb: generateGlb,
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
	
	context.fillStyle = "#fa0";
	
	
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
