const lunr = require("lunr");
const fs = require("fs");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();
let Validator = require("jsonschema").Validator;
let v = new Validator();
const SearchConfigSchema = {
	id: "/SearchConfig",
	type: "object",
	properties: {
		fields: {
			type: "array",
			items: { type: "string" }
		},
		ref: { type: "string" },
		name: { type: "string" }
	},
	required: ["fields", "ref", "name"]
};

let BUCKET_NAME, API_KEY;
/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 * @param {string} event.resource - Resource path.
 * @param {string} event.path - Path parameter.
 * @param {string} event.httpMethod - Incoming request's method name.
 * @param {Object} event.headers - Incoming request headers.
 * @param {Object} event.queryStringParameters - query string parameters.
 * @param {Object} event.pathParameters - path parameters.
 * @param {Object} event.stageVariables - Applicable stage variables.
 * @param {Object} event.requestContext - Request context, including authorizer-returned key-value pairs, requestId, sourceIp, etc.
 * @param {Object} event.body - A JSON string of the request payload.
 * @param {boolean} event.body.isBase64Encoded - A boolean flag to indicate if the applicable request payload is Base64-encode
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
 * @param {Object} context
 * @param {string} context.logGroupName - Cloudwatch Log Group name
 * @param {string} context.logStreamName - Cloudwatch Log stream name.
 * @param {string} context.functionName - Lambda function name.
 * @param {string} context.memoryLimitInMB - Function memory.
 * @param {string} context.functionVersion - Function version identifier.
 * @param {function} context.getRemainingTimeInMillis - Time in milliseconds before function times out.
 * @param {string} context.awsRequestId - Lambda request ID.
 * @param {string} context.invokedFunctionArn - Function ARN.
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 * @returns {boolean} object.isBase64Encoded - A boolean flag to indicate if the applicable payload is Base64-encode (binary support)
 * @returns {string} object.statusCode - HTTP Status Code to be returned to the client
 * @returns {Object} object.headers - HTTP Headers to be returned
 * @returns {Object} object.body - JSON Payload to be returned
 *
 */
exports.lambdaHandler = async (event, context) => {
	BUCKET_NAME = process.env.BUCKET_NAME;
	API_KEY = process.env.INTERNAL_API_KEY;

	let path = event.path;
	let method = event.httpMethod;

	switch (path) {
		case "/search":
			let query = event.queryStringParameters.q;
			let count = event.queryStringParameters.count || 25;
			let index = event.queryStringParameters.index;
			return await SearchForDocument(query, count, index);
		case "/add":
			switch (event.httpMethod) {
				case "POST":
					let document = JSON.parse(event.body);
					return await UploadArticle(document);
			}
		case "/internal/config":
			switch (event.httpMethod) {
				case "POST":
					let config = JSON.parse(event.body);
					return await UpdateConfigDocument(config);
				case "GET":
					return await GetConfigDocument();
			}
		default:
			return BuildResponse(400, "Not a valid path, or you don't have access to it", false);
	}
};

async function GetConfigDocument() {
	//fetch previous cache of documents
	try {
		var params = {
			Bucket: BUCKET_NAME,
			Key: "search_config.json"
		};
		let data = await s3.getObject(params).promise();
		return BuildResponse(200, JSON.parse(data.Body), true);
	} catch (err) {
		console.log(err.message);
		console.log("Search Config does not exist!");
		return BuildResponse(400, "No search configuration exists. You must upload one");
	}
}

async function UpdateConfigDocument(SearchConfig) {
	if (!SearchConfig.apikey || SearchConfig.apikey != API_KEY) {
		return BuildResponse(401, "You may not update the config");
	}
	if (!SearchConfig.configs) {
		return BuildResponse(400, "Missing List of Index Configurations");
	}
	for (var index of SearchConfig.configs) {
		let schemaCheck = v.validate(index, SearchConfigSchema);
		if (!isValidIndexName(index.name)) {
			return BuildResponse(400, "Invalid Index Name. Names must be one-word and lowercase:  " + index.name);
		}
		console.log(schemaCheck);
		if (schemaCheck["errors"] && schemaCheck.errors.length > 0) {
			console.log("Cannot Upload Document, Search config invalid!");
			let listOfMessages = [];
			for (var err of schemaCheck.errors) {
				listOfMessages.push(err.stack);
			}
			return BuildResponse(400, "Invalid Search Index Schema: " + listOfMessages);
		}
	}

	//add to S3 Bucket
	var params = {
		Bucket: BUCKET_NAME,
		Key: "search_config.json",
		Body: JSON.stringify(SearchConfig)
	};
	try {
		await s3.putObject(params).promise();
		console.log("Uploaded search configuration for: " + index.name);
		return BuildResponse(200, "Index Config Updated");
	} catch (err) {
		console.log(err);
		return BuildResponse(400, "Uploading Configuration Failed. Please check logs");
	}
}

async function UploadArticle(document) {
	//add to S3 Bucket
	var params = {
		Bucket: BUCKET_NAME,
		Key: "articles/" + Date.now() + ".json",
		Body: JSON.stringify(document)
	};
	try {
		await s3.putObject(params).promise();
		return BuildResponse(200, "Article Added");
	} catch (err) {
		console.log(err);
		return BuildResponse(400, "Upload Article Failed");
	}
}

async function SearchForDocument(query, numValues = 25, indexName) {
	console.log("Searching Index for ", query);
	if (!indexName || !isValidIndexName(indexName)) {
		return BuildResponse(400, "Invalid Index Name Provided");
	}
	console.log("Got Request..");
	let SearchResults = [];

	//Load Multiple Indexes from S3
	try {
		//Fetch all available shards
		let listOfShards = await listObjects(BUCKET_NAME, "indexes/" + indexName);
		console.log("Received List of Shards...");
		let listOfDocumentPromises = [];
		for (var documentName of listOfShards) {
			listOfDocumentPromises.push(getIndexJSONFile(BUCKET_NAME, documentName));
		}

		try {
			let allIndexes = await Promise.all(listOfDocumentPromises);
			console.log("Got all Indexes...");
			for (var index of allIndexes) {
				if (index != null) {
					SearchResults = SearchResults.concat(GetSearchResults(index, query, numValues));
				} else {
					return BuildResponse(500, "Something went wrong while trying to query the index...");
				}
			}
			console.log("Got search results...");
		} catch (err) {
			console.log("Something went wrong while querying the index", err);
			return BuildResponse(500, "Something went wrong while trying to query the index...");
		}

		SearchResults.sort(function(hitA, hitB) {
			return hitB.score - hitA.score;
		});

		console.log("Sending sorted results", SearchResults);

		return BuildResponse(200, SearchResults.slice(0, numValues), true);
	} catch (err) {
		console.log("No Search Index was found");
		console.log(err.message);
		return BuildResponse(412, "No Search Index was found, or it was invalid. Make sure you have uploaded a index config first.");
	}
}

function GetSearchResults(searchIndex, query, numValues) {
	//load the index to lunr
	let index = lunr.Index.load(searchIndex);
	//perform
	let results = index.query(function() {
		// exact matches should have the highest boost
		this.term(lunr.tokenizer(query), { boost: 100 });

		// prefix matches should be boosted slightly
		this.term(query, { boost: 10, usePipeline: false, wildcard: lunr.Query.wildcard.TRAILING });

		// finally, try a fuzzy search with character 2, without any boost
		this.term(query, { boost: 5, usePipeline: false, editDistance: 3 });
	});
	return results.slice(0, numValues);
}

/**
 * @param {*} Bucket
 * @param {*} Prefix
 * Return array of all the objects in Bucket or Sub-Path in Bucket
 */
async function listObjects(Bucket, Prefix) {
	let params = {
		Bucket,
		Prefix,
		MaxKeys: 1000
	};

	let results = [];
	let isTruncated = true;

	try {
		while (isTruncated) {
			//fetch list of all incoming folders
			let data = await s3.listObjectsV2(params).promise();
			isTruncated = data.IsTruncated;
			for (let item of data.Contents) {
				results.push(item.Key);
			}
			params.ContinuationToken = data.NextContinuationToken;
		}
	} catch (e) {
		throw e;
	}

	return results;
}

function BuildResponse(statusCode, responseBody, shouldStringify = false) {
	let body = "invalid response";
	if (shouldStringify) {
		body = JSON.stringify(responseBody);
	} else {
		body = JSON.stringify({ msg: responseBody });
	}

	let response = {
		statusCode,
		body
	};

	return response;
}

function isValidIndexName(str) {
	if (str) {
		var re = /^[a-z-]+$/g;
		return re.test(str);
	}

	return false;
}

async function getIndexJSONFile(Bucket, Key, query, numValues) {
	//fetch previous cache of documents
	try {
		var params = {
			Bucket,
			Key
		};
		let data = await s3.getObject(params).promise();
		return JSON.parse(data.Body);
	} catch (err) {
		console.log(err.message);
		console.log("Object does not exist...for ", Key);
		return null;
	}
}
