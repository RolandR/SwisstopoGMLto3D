

function ProgressMonitor(container, options){
	
	let itemsDone = 0;
	let itemsToDo = options.itemsCount;
	
	let progress = 0;
	let activeCountEl;
	let activeTotalCountEl;
	let activeCount = 0;
	let activeTotalCount = 0;
	let updateCountStep = 1;
	let maxCountUpdateTimes = 20;
	
	let mainEl = document.createElement("div");
	mainEl.className = "loadingStatus";
	//mainEl.style.display = "flex";
	
	let progressItemsContainer = document.createElement("div");
	progressItemsContainer.className = "progressItemsContainer";
	mainEl.appendChild(progressItemsContainer);
	
	let progressItems = [];
	
	for(let i = 0; i < options.itemsCount; i++){
		let progressItem = document.createElement("div");
		progressItem.className = "progressItem";
		progressItemsContainer.appendChild(progressItem);
		progressItems.push(progressItem);
	}
	
	let loadingBarContainer = document.createElement("div");
	loadingBarContainer.className = "loadingBarContainer";
	mainEl.appendChild(loadingBarContainer);
	
	let loadingBar = document.createElement("div");
	loadingBar.className = "loadingBar";
	loadingBar.style.width = progress*100 + "%";
	loadingBarContainer.appendChild(loadingBar);
	
	let titleEl = document.createElement("span");
	titleEl.className = "progressTitle";
	titleEl.innerHTML = options.title;
	mainEl.appendChild(titleEl);
	
	let loadingContent = document.createElement("div");
	loadingContent.className = "loadingContent";
	mainEl.appendChild(loadingContent);
	
	/* ========================================= */
	
	function start(){
		container.appendChild(mainEl);
		progressItems[0].className += " active";
		
		return new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
	}
	
	function setProgress(newProgress){
		progress = parseFloat(newProgress);
		loadingBar.style.width = progress*100 + "%";
	}
	
	function finishItem(){
		progressItems[itemsDone].className = "progressItem done";
		itemsDone++;
		if(progressItems[itemsDone]){
			progressItems[itemsDone].className = "progressItem active";
		}
		
		setProgress(0);
		
		return new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
	}
	
	function updateProgress(progress){
		setProgress(progress);
		
		return new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
	}
	
	function postMessage(message, type, totalCount){
		if(type === undefined){
			type = "info";
		}

		let messageEl = document.createElement("span");
		messageEl.className = "progressMessage " + type;
		messageEl.innerHTML = message;
		
		if(totalCount !== undefined){
			
			activeTotalCount = parseFloat(totalCount);
			
			activeCountEl = document.createElement("span");
			activeCountEl.innerHTML = " ("+activeCount+"/";
			messageEl.appendChild(activeCountEl);
			
			activeTotalCountEl = document.createElement("span");
			activeTotalCountEl.innerHTML = activeTotalCount+")";
			messageEl.appendChild(activeTotalCountEl);
			
			updateCountStep = Math.max(10, ~~(activeTotalCount/maxCountUpdateTimes));
			
		}
		
		loadingContent.insertBefore(messageEl, loadingContent.firstChild);
		
		return new Promise((resolve) => {
			setTimeout(resolve, 10);
		});
		
	}
	
	function updateCount(newCount){
		
		activeCount = parseFloat(newCount);
		
		if(activeCount%updateCountStep == 0 || activeCount == activeTotalCount){
			
			if(activeCountEl && activeTotalCountEl){
				activeCountEl.innerHTML = " ("+activeCount+"/";
				activeTotalCountEl.innerHTML = activeTotalCount+")";
			}
			
			setProgress(activeCount/activeTotalCount);
			
			return new Promise((resolve) => {
				setTimeout(resolve, 0);
			});
		} else {
			return;
		}
	}
	
	async function finish(delay, fadeDuration){
		
		await finishItem();
		await updateProgress(1);
		
		setTimeout(function(){
			mainEl.className += " fading";
			setTimeout(function(){
				mainEl.style.display = "none";
				mainEl.remove();
			}, fadeDuration);
		}, delay);
	}
	
	return {
		postMessage: postMessage,
		updateProgress: updateProgress,
		finishItem: finishItem,
		updateCount: updateCount,
		finish: finish,
		start: start
	};
	
}