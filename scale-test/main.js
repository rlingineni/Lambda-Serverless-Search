const fs = require("fs");
const alphanumeric = require("alphanumeric-id");
var rp = require("promise-request-retry");

let BaseURL = "https://hbmle8gyoc.execute-api.us-east-1.amazonaws.com";

fs.readFile("../movies.json", function read(err, data) {
	if (err) {
		throw err;
	}

	let listOfMovies = JSON.parse(data);
	console.log(listOfMovies.length);
	AddIDToListOfMovies(listOfMovies);
	console.log("Will perform test for " + listOfMovies.length + " Objects");
	IncrementBatchAndQuery(listOfMovies, 1, 1);
});

function AddIDToListOfMovies(listOfMovies) {
	for (var movie of listOfMovies) {
		movie.id = alphanumeric(8);
	}
}

function IncrementBatchAndQuery(listOfMovies, startBatchSize, incrementMultiplier) {
	IncrementBatchAndQueryHelper(listOfMovies, startBatchSize, 1, listOfMovies.length, 0, incrementMultiplier);
}

let indexedCount = 0;
let numFails = 0;

async function IncrementBatchAndQueryHelper(
	listOfMovies,
	batchSize,
	batchCounter,
	remainingMovies,
	continuationIndex,
	incrementMultiplier
) {
	//100 to amount for any request losses or failures
	if (indexedCount >= listOfMovies.length - numFails) {
		return;
	}

	//get the number of docs
	let moviesBatch = listOfMovies.slice(continuationIndex, continuationIndex + batchSize);
	let firstMovieID = moviesBatch[0].id;
	//increment the indexes for next run
	continuationIndex = continuationIndex + batchSize;

	//subtract the remaining movies
	remainingMovies = listOfMovies.length - continuationIndex - 1;

	//upload the documents
	var options = {
		method: "POST",
		uri: BaseURL + "/Prod/add",
		body: moviesBatch,
		json: true,
		resolveWithFullResponse: true,
		retry: 3
	};

	try {
		let response = await rp(options);
	} catch (e) {
		console.log("Cannot Upload in Batch Count: " + batchCounter);
		console.log(e);
		throw e;
	}

	//keep querying and retrying till the index is able to get the the first record ID that was uploaded in the batch
	RetryTillSuccess(firstMovieID, batchCounter, 50, (responseTime, uploadedID, uploadIndex) => {
		let percentIndexed = Math.floor((uploadIndex / listOfMovies.length) * 100);
		//just to make sure logging as expected
		if (percentIndexed < 1) {
			console.log(
				"Indexed Article Num:" +
					uploadIndex +
					" (~" +
					percentIndexed +
					"% uploaded) " +
					"Response Time (ms): " +
					responseTime +
					" For: " +
					uploadedID
			);
		}
		BuildPercentGraph(percentIndexed, responseTime, uploadedID, uploadIndex);
		indexedCount++;
	});

	return IncrementBatchAndQueryHelper(listOfMovies, batchSize, batchCounter + 1, remainingMovies, continuationIndex, incrementMultiplier);
}

async function RetryTillSuccess(targetID, processId, retryMax, callback) {
	return _RetryTillSuccess(targetID, processId, 0, 1, retryMax, callback);
}

async function _RetryTillSuccess(targetID, processId, responseTime, retryCounter, retryMax, callback) {
	if (retryCounter == retryMax) {
		console.log("Note: Made 50 requests for " + targetID + " And Failed ... ");
		numFails++;
		callback(0, targetID + "[lost]", processId);
		return;
	}

	var options = {
		method: "GET",
		uri: BaseURL + "/Prod/search?" + "q=" + targetID + "&index=movies",
		resolveWithFullResponse: true,
		time: true
	};

	let endingTime; //so that the catch block can see this also
	try {
		let response = await rp(options);
		let timings = response.request.timings;
		let endingTime = timings.end;
		let searchResults = JSON.parse(response.body);
		//check if response has the correct index
		if (searchResults.length > 0 && targetID === searchResults[0].ref) {
			callback(responseTime + timings.end, targetID, processId);
		} else {
			_RetryTillSuccess(targetID, processId, responseTime + timings.end, retryCounter + 1, retryMax, callback);
		}
	} catch (e) {
		//console.log("Request or error occured for " + processId + " " + targetID);
		_RetryTillSuccess(targetID, processId, responseTime + endingTime, retryCounter + 1, retryMax, callback);
	}
}

let PercentGraph = {};
function BuildPercentGraph(percentIndexed, responseTime, idAdded, uploadIndex) {
	previousIndex = (percentIndexed - 1).toString();
	percentIndexed = percentIndexed.toString();
	if (parseFloat(responseTime)) {
		responseTime = parseFloat(responseTime);
	} else {
		responseTime = 1000;
	}

	if (PercentGraph[percentIndexed]) {
		PercentGraph[percentIndexed].count = PercentGraph[percentIndexed].count + 1;
		PercentGraph[percentIndexed].ids.push(idAdded);
		PercentGraph[percentIndexed].totalTime = PercentGraph[percentIndexed].totalTime + responseTime;
		let average = PercentGraph[percentIndexed].totalTime / PercentGraph[percentIndexed].count;
		PercentGraph[percentIndexed].avg = average;
	} else {
		PercentGraph[percentIndexed] = {
			count: 1,
			totalTime: responseTime,
			avg: responseTime,
			ids: [idAdded]
		};

		if (PercentGraph[previousIndex]) {
			console.log(
				previousIndex +
					"% complete and ~" +
					uploadIndex +
					" records indexed at an avg of " +
					PercentGraph[previousIndex].avg +
					" Ids: " +
					PercentGraph[previousIndex].ids.slice(0, 8)
			);
			console.log(PercentGraph);
		}
	}
}
