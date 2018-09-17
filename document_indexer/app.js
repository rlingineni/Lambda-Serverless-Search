const lunr = require("lunr");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();
let BUCKET_NAME;

exports.lambdaHandler = async (event, context) => {
	process.env.BUCKET_NAME = "citycontacts";
	BUCKET_NAME = process.env.BUCKET_NAME;

	let IndexConfig = {
		fields: ["title", "director", "year"],
		ref: "title"
	};

	//fetch index configuration from S3
	let SearchConfig = await getJSONFile(BUCKET_NAME, "search_config.json");
	if (SearchConfig != null) {
		IndexConfig = SearchConfig;
	} else {
		return "Please set the Search Index Configuration";
	}

	//fetch previous cache of documents
	let AllArticles = await getJSONFile(BUCKET_NAME, "articles_all.json");
	if (AllArticles == null) {
		AllArticles = [];
	}

	//fetch every document uploaded to S3 in articles folder
	let listOfDocuments = await listObjects(BUCKET_NAME, "articles/");
	console.log("Got articles list ...");
	let listOfDocumentPromises = [];
	for (var documentName of listOfDocuments) {
		listOfDocumentPromises.push(getJSONFile(BUCKET_NAME, documentName));
	}

	let PromiseResults = await Promise.all(listOfDocumentPromises);
	for (var result of PromiseResults) {
		if (result != null) {
			AllArticles.push(result);
		}
	}

	//build the index and upload new index
	var index = lunr(function() {
		for (var field of IndexConfig.fields) {
			this.field(field);
		}

		this.ref(IndexConfig.ref);

		AllArticles.forEach(function(document) {
			this.add(document);
		}, this);
	});

	//update "alldocs.json"
	await uploadToS3(BUCKET_NAME, "articles_all.json", JSON.stringify(AllArticles));
	console.log("Uploaded all articles back!");

	await uploadToS3(BUCKET_NAME, "search_index.json", JSON.stringify(index));
	console.log("Uploaded index!");
	//mark raw documents for deletion
};

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

async function getJSONFile(Bucket, Key) {
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

async function uploadToS3(Bucket, Key, Body) {
	//add to S3 Bucket
	var params = {
		Bucket,
		Key,
		Body
	};
	try {
		var putObjectPromise = await s3.putObject(params).promise();
		return "Uploaded Object!";
	} catch (err) {
		console.log(err.code);
		console.log("Uploading document failed ...");
		return null;
	}
}
