const lunr = require("lunr");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();
let BUCKET_NAME, IndexConfig;

exports.lambdaHandler = async (event, context) => {
	BUCKET_NAME = process.env.BUCKET_NAME;

	let AddedItem = event.Records[0].s3.object.key;

	//no need to index anything that hasn't been added to articles
	if (!AddedItem.startsWith("articles/")) {
		return "Skipping the addition of a non-article";
	}

	//fetch index configuration from S3
	IndexConfig = await getJSONFile(BUCKET_NAME, "search_config.json");
	if (IndexConfig == null) {
		return "Please set the Search Index Configuration before adding documents";
	}

	//fetch previous cache of documents
	let AllArticles = [];

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
			let isArray = Array.isArray(result);
			if (isArray) {
				AllArticles = AllArticles.concat(result);
			} else {
				AllArticles.push(result);
			}
		}
	}

	let IndexUploadPromiseArray = [];
	//make indexes and upload them
	for (var config of IndexConfig.configs) {
		let ShardSize = config.shards || 2000;
		let shardedArray = ShardArray(AllArticles, ShardSize);

		let indexCount = 1;
		for (var articles of shardedArray) {
			//build the index up for each shard and upload new index
			var index = lunr(function() {
				for (var field of config.fields) {
					this.field(field);
				}

				this.ref(config.ref);
				articles.forEach(function(article) {
					this.add(article);
				}, this);
			});

			//upload JSON Indexes in Parallel
			IndexUploadPromiseArray.push(
				uploadToS3(BUCKET_NAME, "indexes/" + config.name + "/search_index_" + indexCount + ".json", JSON.stringify(index))
			);
			console.log("Uploaded index: " + config.name + "_" + indexCount);
			indexCount++;
		}
	}

	try {
		let UploadResults = await Promise.all(IndexUploadPromiseArray);
	} catch (e) {
		console.log("Something went wrong: ", e);
	}

	/*
		Keep all articles document for reference, we will not necessarily use it
	*/
	//update "alldocs.json"
	await uploadToS3(BUCKET_NAME, "articles_all.json", JSON.stringify(AllArticles));
	console.log("Uploaded all articles back!");
};

function ShardArray(allitems, chunk_size) {
	var arrays = [];

	let StartIndex = 0;
	while (StartIndex <= allitems.length) {
		arrays.push(allitems.slice(StartIndex, StartIndex + chunk_size));
		StartIndex += chunk_size;
	}

	return arrays;
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
