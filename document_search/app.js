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
		ref: { type: "string" }
	},
	required: ["fields", "ref"]
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
			return BuildResponse(200, await SearchForDocument(query), true);
		case "/add":
			if ("body" in event) {
				let document = JSON.parse(event.body);
				return BuildResponse(200, await UploadDocument(document), false);
			}
		case "/internal/config":
			switch (event.httpMethod) {
				case "POST":
					let config = JSON.parse(event.body);
					return BuildResponse(200, await UpdateConfigDocument(config), false);
				case "GET":
					return BuildResponse(200, await GetConfigDocument(), true);
			}
		default:
			return BuildResponse(400, "Not a valid path", false);
	}
};

async function AddDocument(documents) {
	//Add Document(s) to S3 Bucket

	if (Array.isArray(document)) {
		for (var document of documents) {
			await UploadDocument(document);
		}
	} else {
		await UploadDocument(documents);
	}

	return "Uploaded Documents. Please allow up to 1 minute to allow document to be available for searching";
}

async function GetConfigDocument() {
	//fetch previous cache of documents
	try {
		var params = {
			Bucket: BUCKET_NAME,
			Key: "search_config.json"
		};
		let data = await s3.getObject(params).promise();
		return JSON.parse(data.Body);
	} catch (err) {
		console.log(err.message);
		console.log("Search Config does not exist");
		return "No config has been created";
	}
}

async function UpdateConfigDocument(config) {
	if (config.key != API_KEY) {
		return "Invalid API Key for Internal Config";
	}
	let schemaCheck = v.validate(config, SearchConfigSchema);
	console.log(schemaCheck);
	if (schemaCheck["errors"] && schemaCheck.errors.length > 0) {
		console.log("Cannot Upload Document, Search config invalid!");
		let listOfMessages = [];
		for (var err of schemaCheck.errors) {
			listOfMessages.push(err.stack);
		}
		return "Invalid Schema Configuration: " + listOfMessages;
	}

	//add to S3 Bucket
	var params = {
		Bucket: BUCKET_NAME,
		Key: "search_config.json",
		Body: JSON.stringify(config)
	};
	try {
		var putObjectPromise = await s3.putObject(params).promise();
		return "Uploaded Document!";
	} catch (err) {
		console.log(err);
		return err;
	}
}

async function UploadDocument(document) {
	//add to S3 Bucket
	var params = {
		Bucket: BUCKET_NAME,
		Key: "articles/" + Date.now() + ".json",
		Body: JSON.stringify(document)
	};
	try {
		var putObjectPromise = await s3.putObject(params).promise();
		return "Uploaded Document!";
	} catch (err) {
		console.log(err);
		return err;
	}
}

async function SearchForDocument(query) {
	console.log("Searching Index for ", query);

	//Load Index from S3
	try {
		var params = {
			Bucket: BUCKET_NAME,
			Key: "search_index.json"
		};
		let data = await s3.getObject(params).promise();
		let searchIndex = JSON.parse(data.Body);

		//load the index to lunr
		let index = lunr.Index.load(searchIndex);
		//perform query
		return index.search(query + "~2");
	} catch (err) {
		console.log(err.message);
		console.log("Search Index cannot be found");
		return "No Search Index was found. Make sure you have set up an index and added documents";
	}
}

function BuildResponse(statusCode, body, shouldStringify) {
	if (shouldStringify) {
		body = JSON.stringify(body);
	}

	let response = {
		statusCode,
		body
	};

	return response;
}
