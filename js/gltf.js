

function GltfTools(){
	
	async function createGltf(scene){
		
		
		let json = {
			asset: {
				generator: "Roland's GLTF converter thingy!",
				version: "2.0"
			},
			scene: 0,
			scenes: [],
			nodes: [],
			materials: [],
			meshes: [],
			accessors: [],
			bufferViews: [],
			buffers: []
		}
		
		let bufferViews = [];
		let offset = 0;
		
		json.scenes[0] = newScene;
		json.nodes = newNodes;
		
		let pointer = -1;
		
		await pMon.postMessage("Preparing buffers...", "info", flatMeshes.length);
		
		for(let i in flatMeshes){
			
			/*json.nodes.push({
				name: flatMeshes[i].nodeName,
				mesh: i*1
			});
			json.scenes[0].nodes.push(json.nodes.length-1); // TODO: use actual node structure*/
			
			
			let mesh = flatMeshes[i];
			
			let outMesh = {
				name: mesh.name,
				primitives: []
			};
			
			for(let p in mesh.primitives){
				
				outMesh.primitives[p] = {
					attributes: {}
				};
				let buf;
				
				/*======== indices ========*/
				buf = mesh.primitives[p].indices;
				bufferViews.push(buf);
				pointer++;
				
				json.bufferViews.push({
					buffer: 0,
					byteLength: buf.byteLength,
					byteOffset: offset,
					target: 34963 // indices (ELEMENT_ARRAY_BUFFER)
				});
				offset += buf.byteLength;
				if(offset%4 !== 0){
					// the gltf standard wants every bufferView offset to be a multiple of 4 bytes.
					// let's add empty bytes between bufferViews to comply with that.
					bufferViews.push(new Uint8Array(4-offset%4));
					offset += 4-offset%4;
				}
				
				json.accessors.push({
					bufferView: pointer,
					byteOffset: 0,
					type: "SCALAR",
					componentType: 5125, // 5125 = Uint32
					count: mesh.primitives[p].indices.length
				});
				outMesh.primitives[p].indices = pointer;
				
				/*======== positions ========*/
				buf = mesh.primitives[p].positions;
				bufferViews.push(buf);
				pointer++;
				
				json.bufferViews.push({
					buffer: 0,
					byteLength: buf.byteLength,
					byteOffset: offset,
					target: 34962 // positions (ARRAY_BUFFER)
				});
				offset += buf.byteLength;
				if(offset%4 !== 0){
					// the gltf standard wants every bufferView offset to be a multiple of 4 bytes.
					// let's add empty bytes between bufferViews to comply with that.
					bufferViews.push(new Uint8Array(4-offset%4));
					offset += 4-offset%4;
				}
				
				let min = [
					mesh.primitives[p].positions[0],
					mesh.primitives[p].positions[1],
					mesh.primitives[p].positions[2],
				];
				let max = [
					mesh.primitives[p].positions[0],
					mesh.primitives[p].positions[1],
					mesh.primitives[p].positions[2],
				];
				
				for(let i = 0; i < mesh.primitives[p].positions.length; i += 3){
					min[0] = Math.min(mesh.primitives[p].positions[i+0], min[0]);
					max[0] = Math.max(mesh.primitives[p].positions[i+0], max[0]);
					
					min[1] = Math.min(mesh.primitives[p].positions[i+1], min[1]);
					max[1] = Math.max(mesh.primitives[p].positions[i+1], max[1]);
					
					min[2] = Math.min(mesh.primitives[p].positions[i+2], min[2]);
					max[2] = Math.max(mesh.primitives[p].positions[i+2], max[2]);
				}
				
				json.accessors.push({
					bufferView: pointer,
					byteOffset: 0,
					type: "VEC3",
					componentType: 5126,
					count: mesh.primitives[p].positions.length/3,
					min: min,
					max: max
				});
				outMesh.primitives[p].attributes.POSITION = pointer;
				
				/*======== normals ========*/
				buf = mesh.primitives[p].normals;
				bufferViews.push(buf);
				pointer++;
				
				json.bufferViews.push({
					buffer: 0,
					byteLength: buf.byteLength,
					byteOffset: offset,
					target: 34962 // positions (ARRAY_BUFFER)
				});
				offset += buf.byteLength;
				if(offset%4 !== 0){
					// the gltf standard wants every bufferView offset to be a multiple of 4 bytes.
					// let's add empty bytes between bufferViews to comply with that.
					bufferViews.push(new Uint8Array(4-offset%4));
					offset += 4-offset%4;
				}
				
				json.accessors.push({
					bufferView: pointer,
					byteOffset: 0,
					type: "VEC3",
					componentType: 5126,
					count: mesh.primitives[p].normals.length/3
				});
				outMesh.primitives[p].attributes.NORMAL = pointer;
				
				/*======== texCoords ========*/
				if(mesh.primitives[p].texCoords){
					buf = mesh.primitives[p].texCoords;
					bufferViews.push(buf);
					pointer++;
					
					json.bufferViews.push({
						buffer: 0,
						byteLength: buf.byteLength,
						byteOffset: offset,
						target: 34962 // positions (ARRAY_BUFFER)
					});
					offset += buf.byteLength;
					if(offset%4 !== 0){
						// the gltf standard wants every bufferView offset to be a multiple of 4 bytes.
						// let's add empty bytes between bufferViews to comply with that.
						bufferViews.push(new Uint8Array(4-offset%4));
						offset += 4-offset%4;
					}
					
					json.accessors.push({
						bufferView: pointer,
						byteOffset: 0,
						type: "VEC2",
						componentType: 5126,
						count: mesh.primitives[p].texCoords.length/2
					});
					outMesh.primitives[p].attributes.TEXCOORD_0 = pointer;
				}
				
				outMesh.primitives[p].material = parseInt(mesh.primitives[p].material);
			}
			
			json.meshes.push(outMesh);
			
			await pMon.updateCount(i+1);
		}
		
		await pMon.postMessage("Encoding JSON data...");
		
		let bufferLength = offset;
		
		json.buffers[0] = {
			byteLength: bufferLength
		};
		
		json.materials = glb.materials;
		
		/*======== create buffer ========*/
		
		//console.log(json);
		
		let jsonString = JSON.stringify(json);
		
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
		
		await pMon.postMessage("Creating file blob...");
		
		let fileBlob = new Blob([
			fileHeader,
			jsonHeader,
			encodedText,
			bufferHeader,
			...bufferViews
		], {type: "model/glb"});
		
		await pMon.postMessage("Done!", "success");
		await pMon.finish(0, 500);
		
		return(URL.createObjectURL(fileBlob));
		
	}
	
	
	return {
		createGltf: createGltf,
	};
	
}