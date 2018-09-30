const fs = require("fs");
const alphanumeric = require("alphanumeric-id");
var rp = require("request-promise");

let BaseURL = "https://hljwxgw6f2.execute-api.us-east-1.amazonaws.com";

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
async function IncrementBatchAndQueryHelper(
	listOfMovies,
	batchSize,
	batchCounter,
	remainingMovies,
	continuationIndex,
	incrementMultiplier
) {
	if (remainingMovies <= 0) {
		return;
	}

	if (batchCounter == 10) {
		batchCounter = 1;
		batchSize = batchSize * incrementMultiplier;
		console.log("-----------Batch Count Incremented to: " + batchSize + "-----------------");
		console.log("-----------Articles Remaining: " + remainingMovies + "-----------------");
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
		resolveWithFullResponse: true
	};

	try {
		let response = await rp(options);
	} catch (e) {
		console.log("Cannot Upload in Batch Count: " + batchCounter);
		console.log(e);
		throw e;
	}

	//keep querying and retrying till the index is able to get the the first record ID that was uploaded in the batch
	let TimeForResponse = await RetryTillSuccess(firstMovieID);
	console.log("Count: " + batchCounter + " Response Time (ms): " + TimeForResponse + " For: " + firstMovieID);
	return IncrementBatchAndQueryHelper(listOfMovies, batchSize, batchCounter + 1, remainingMovies, continuationIndex, incrementMultiplier);
}

async function RetryTillSuccess(targetID, retryMax) {
	return _RetryTillSuccess(targetID, 0, 1, retryMax);
}

async function _RetryTillSuccess(targetID, responseTime, retryCounter, retryMax) {
	if (retryCounter == retryMax) {
		throw new Error("Max Retries were hit for " + targetID);
	}

	if (retryCounter % 50 == 0) {
		console.log("Note: Made 50 requests for " + targetID + " Resp time at: " + responseTime);
	}
	var options = {
		method: "GET",
		uri: BaseURL + "/Prod/search?" + "q=" + targetID + "&index=movies",
		resolveWithFullResponse: true,
		time: true
	};

	try {
		let response = await rp(options);
		let timings = response.request.timings;
		let searchResults = JSON.parse(response.body);
		//check if response has the correct index
		if (searchResults.length > 0 && targetID === searchResults[0].ref) {
			return responseTime + timings.end;
		} else {
			return _RetryTillSuccess(targetID, responseTime + timings.end, retryCounter + 1, retryMax);
		}
	} catch (e) {
		console.log("Failed to retry");
		throw new Error(e);
	}
}
