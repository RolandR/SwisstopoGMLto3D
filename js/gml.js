fetch("sefinen.gml")
	.then((response) => response.text())
	.then((text) => {
		const parser = new DOMParser();
		const doc = parser.parseFromString(text, "text/xml");
		
		let buildings = doc.getElementsByTagName("bldg:Building");
		
		for(let building of buildings){
			let gmlId = building.attributes["gml:id"].value;
			
			// This query looks super weird because of namespaces. *|Building matches Building tags of any namespace, including CityGML's bldg:Building.
			// I used wildcard namespaces because from what I've found out, querySelector() doesn't completely support namespaces?
			let egid = doc.querySelector('*|Building[*|id="'+gmlId+'"]>*|intAttribute[name="EGID"]>*|value').innerHTML;
			
			console.log(egid);
		}
		
	});
