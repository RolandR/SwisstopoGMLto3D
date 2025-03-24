
main();


function main(){
	
	let canvasContainer = document.getElementById("canvasContainer");
	
	let parser = new GmlParser();
	let renderer = new Renderer(canvasContainer);
	
	fetch("sefinen.gml")
	.then((response) => response.text())
	.then((text) => {
		let structure = parser.parseGmlText(text);
		renderer.drawBuildings(structure);
	});
}

function GmlParser(){
	
	function parseGmlText(text){
		
		console.log("Parsing GML file...");
		
		const parser = new DOMParser();
		const doc = parser.parseFromString(text, "text/xml");
		
		let buildings = doc.getElementsByTagName("bldg:Building");
		
		console.log("Found "+buildings.length+" buildings.");
		
		let structure = {
			buildings: []
		};
		
		let lowerCorner = doc.querySelector('*|lowerCorner').innerHTML;
		lowerCorner = lowerCorner.trim().replace(/\s+/, " ");
		lowerCorner = lowerCorner.split(" ");
		lowerCorner = lowerCorner.map(function(x){
			return parseFloat(x);
		});
		
		let upperCorner = doc.querySelector('*|upperCorner').innerHTML;
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
		
		for(let building of buildings){
			
			let buildingItem = {
				egid: null,
				roofTriangles: [],
				wallTriangles: [],
				groundTriangles: []
			};
			
			
			let gmlId = building.attributes["gml:id"].value;
			
			// This query looks super weird because of namespaces. *|Building matches Building tags of any namespace, including CityGML's bldg:Building.
			// I used wildcard namespaces because from what I've found out, querySelector() doesn't completely support namespaces?
			let egidEl = doc.querySelector('*|Building[*|id="'+gmlId+'"]>*|intAttribute[name="EGID"]>*|value');
			let egid = null;
			if(egidEl){
				egid = egidEl.innerHTML;
			} else {
				console.warn("Encountered building without EGID");
			}
			
			buildingItem.egid = egid;
			
			console.log("Processing building with EGID "+egid+"...");
			
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
						console.error("Ring in building "+egid+" is not a triangle. This is allowed in CityGML, but I expected SwissTopo to export their buildings using only triangles...")
					} else {
						positions = positions.slice(0, 8); // remove the last point, as it's the same as the first
						resultArray.push(positions);
					}
				}
				
				return resultArray;
			}
			
			let roofPosLists = doc.querySelectorAll('*|Building[*|id="'+gmlId+'"]>*|boundedBy>*|RoofSurface *|exterior *|posList');
			buildingItem.roofTriangles = parsePosList(roofPosLists);
			
			let wallPosLists = doc.querySelectorAll('*|Building[*|id="'+gmlId+'"]>*|boundedBy>*|WallSurface *|exterior *|posList');
			buildingItem.wallTriangles = parsePosList(wallPosLists);
			
			let groundPosLists = doc.querySelectorAll('*|Building[*|id="'+gmlId+'"]>*|boundedBy>*|GroundSurface *|exterior *|posList');
			buildingItem.groundTriangles = parsePosList(groundPosLists);
			
			
			structure.buildings.push(buildingItem);
			
		}
		
		return structure;
	}
	
	return {
		parseGmlText: parseGmlText
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
		
		console.log("Rendering...");
		
		let scale = Math.min(canvas.width/structure.spans[0], canvas.height/structure.spans[1]);
		
		let drawPositions = new Float32Array(9);
		
		for(let building of structure.buildings){
			for(let triangle of building.groundTriangles){
				
				for(i = 0; i < triangle.length; i+= 3){
					drawPositions[i  ] = (triangle[i  ] - structure.lowerCorner[0])*scale;
					drawPositions[i+1] = (triangle[i+1] - structure.lowerCorner[1])*scale;
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
